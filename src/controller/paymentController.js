import { prisma } from '../prisma/client.js';
import { env } from '../config/env.js';
import { createInvoiceForTokenPurchase } from '../services/invoiceService.js';
import { getDefaultTokenPlan } from '../services/planService.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../events/eventTypes.js';
import { distributePurchaseCommission } from '../services/commissionService.js';
import { recordPlanRenewal } from '../services/activityService.js';
import { requireTransactionPin } from '../services/pinService.js';
import { getTokenValueInr, tokensToInr } from '../services/tokenService.js';

function assert(condition, message = 'Bad Request', code = 400) {
  if (!condition) {
    const err = new Error(message);
    err.status = code;
    throw err;
  }
}

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

function fetchImpl(...args) {
  if (typeof fetch === 'function') return fetch(...args);
  throw new Error('global fetch is not available; use Node 18+ or provide a fetch polyfill');
}

function ensureRazorpayKeys(message = 'Razorpay credentials not configured') {
  assert(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET, message, 500);
}

function ensureRazorpayPayoutConfig() {
  ensureRazorpayKeys('Razorpay credentials not configured for payouts');
  assert(env.RAZORPAY_ACCOUNT_NUMBER, 'Razorpay account number not configured', 500);
}

function hasRazorpayPayoutConfig() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_ACCOUNT_NUMBER);
}

function toPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function cloneJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(JSON.stringify(value)) : fallback;
  } catch (_) {
    return fallback;
  }
}

function validateWithdrawDetails(method, details) {
  const info = toPlainObject(details);
  assert(Object.keys(info).length > 0, 'withdraw details required');
  if (info.fundAccountId) return info;
  if (method === 'UPI') {
    assert(info.vpa, 'details.vpa required for UPI withdrawal');
  } else {
    assert(info.ifsc && info.accountNumber, 'Bank IFSC and accountNumber required');
  }
  return info;
}

function appendDescription(base, fragment) {
  if (!fragment) return base;
  const cleanBase = (base || '').trim();
  const cleanFragment = fragment.trim();
  if (!cleanBase) return cleanFragment;
  if (cleanBase.includes(cleanFragment)) return cleanBase;
  return `${cleanBase} ${cleanFragment}`.trim();
}

function sanitizeNarration(text) {
  const value = (text || '').trim() || 'Wallet withdrawal';
  return value.length > 30 ? value.slice(0, 30) : value;
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  ensureRazorpayKeys();
  const url = path.startsWith('http') ? path : `${RAZORPAY_API_BASE}${path}`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
  };
  if (body) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkErr) {
    const error = new Error(networkErr.message || 'Failed to reach Razorpay');
    error.status = 502;
    error.razorpay = { error: networkErr.message };
    throw error;
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }

  if (!response.ok || (data && data.error)) {
    const error = new Error(data?.error?.description || `Razorpay API error (${response.status})`);
    error.status = 502;
    error.razorpay = data;
    throw error;
  }

  return data;
}

async function createRazorpayContact(trx, user, details) {
  if (details?.contactId) {
    return razorpayRequest(`/contacts/${details.contactId}`, { method: 'GET' });
  }

  const contactDetails = toPlainObject(details?.contact);
  const payload = {
    name: contactDetails.name || user?.username || user?.email || user?.phone || 'Wallet User',
    type: 'employee',
    reference_id: `wd_${trx.id}`,
    notes: { userId: user?.id, transactionId: trx.id }
  };
  if (contactDetails.email || user?.email) payload.email = contactDetails.email || user?.email;
  if (contactDetails.phone || user?.phone) payload.contact = contactDetails.phone || user?.phone;

  return razorpayRequest('/contacts', { method: 'POST', body: payload });
}

async function createRazorpayFundAccount(trx, contact, method, details) {
  if (details?.fundAccountId) {
    return razorpayRequest(`/fund_accounts/${details.fundAccountId}`, { method: 'GET' });
  }

  const mode = method.toUpperCase();
  if (mode === 'UPI') {
    assert(details?.vpa, 'details.vpa required for UPI withdrawal');
    const payload = {
      contact_id: contact.id,
      account_type: 'vpa',
      vpa: { address: details.vpa },
      notes: { transactionId: trx.id }
    };
    return razorpayRequest('/fund_accounts', { method: 'POST', body: payload });
  }

  assert(details?.ifsc && details?.accountNumber, 'Bank IFSC and accountNumber required');
  const payload = {
    contact_id: contact.id,
    account_type: 'bank_account',
    bank_account: {
      name: details.accountName || contact.name,
      ifsc: details.ifsc,
      account_number: details.accountNumber
    },
    notes: { transactionId: trx.id }
  };
  return razorpayRequest('/fund_accounts', { method: 'POST', body: payload });
}

async function createRazorpayPayout(trx, fundAccount, method, details) {
  ensureRazorpayPayoutConfig();
  const amountPaise = Math.round(Number(trx.amount) * 100);
  assert(amountPaise > 0, 'Invalid payout amount');

  const payload = {
    account_number: env.RAZORPAY_ACCOUNT_NUMBER,
    fund_account_id: fundAccount.id,
    amount: amountPaise,
    currency: trx.currency || 'INR',
    mode: method === 'UPI' ? 'UPI' : String(details?.mode || 'IMPS').toUpperCase(),
    purpose: details?.purpose || 'payout',
    queue_if_low_balance: true,
    narration: sanitizeNarration(details?.narration || `Wallet WD ${trx.id.slice(-6)}`),
    reference_id: trx.id
  };
  if (details?.notes && typeof details.notes === 'object') {
    payload.notes = cloneJson(details.notes);
  }
  return razorpayRequest('/payouts', { method: 'POST', body: payload });
}

async function triggerRazorpayPayout({ trx, user, method, details, adminUserId }) {
  try {
    const meta = toPlainObject(trx.meta);
    if (meta.razorpay?.payoutId) {
      const fresh = await prisma.transaction.findUnique({ where: { id: trx.id } });
      return { transaction: fresh || trx, wallet: null, payout: meta.razorpay };
    }

    const detailCopy = cloneJson(details, {});
    const contact = await createRazorpayContact(trx, user, detailCopy);
    const fundAccount = await createRazorpayFundAccount(trx, contact, method, detailCopy);
    const payout = await createRazorpayPayout(trx, fundAccount, method, detailCopy);

    const payoutStatus = String(payout.status || '').toLowerCase();
    let transactionStatus = 'PENDING';
    if (payoutStatus === 'processed') transactionStatus = 'SUCCESS';
    if (['rejected', 'failed', 'cancelled'].includes(payoutStatus)) transactionStatus = 'FAILED';

    const nextMeta = {
      ...meta,
      method,
      details: detailCopy,
      requiresApproval: false,
      manualPayoutRequired: false,
      razorpay: {
        contactId: contact.id,
        fundAccountId: fundAccount.id,
        payoutId: payout.id,
        status: payout.status,
        mode: payout.mode,
        referenceId: payout.reference_id,
        amount: payout.amount,
        currency: payout.currency
      }
    };

    if (adminUserId) {
      nextMeta.admin = {
        ...(toPlainObject(meta.admin)),
        approvedBy: adminUserId,
        approvedAt: new Date().toISOString()
      };
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { id: trx.id },
      data: {
        status: transactionStatus,
        referenceId: payout.id,
        description: appendDescription(trx.description || `Withdrawal via ${method}`, `(payout ${payout.status})`),
        meta: nextMeta
      }
    });

    let wallet = null;
    if (transactionStatus === 'FAILED') {
      wallet = await prisma.wallet.update({
        where: { userId: trx.userId },
        data: { mainBalance: { increment: Number(trx.amount) } }
      });
    }

    return { transaction: updatedTransaction, wallet, payout };
  } catch (error) {
    const meta = toPlainObject(trx.meta);
    meta.razorpayError = error.razorpay || { message: error.message };
    meta.requiresApproval = false;
    await prisma.transaction.update({
      where: { id: trx.id },
      data: {
        status: 'FAILED',
        description: appendDescription(trx.description || 'Withdrawal', '(payout failed)'),
        meta
      }
    });
    const wallet = await prisma.wallet.update({
      where: { userId: trx.userId },
      data: { mainBalance: { increment: Number(trx.amount) } }
    });

    const err = new Error(error.message || 'Razorpay payout failed');
    err.status = error.status || 502;
    err.wallet = wallet;
    err.razorpay = error.razorpay;
    throw err;
  }
}

// Create an add-funds order via Razorpay only.
export async function createAddFundsOrder(req, res, next) {
  try {
    const { amount, currency = 'INR' } = req.body || {};
    const amt = Number(amount);
    assert(Number.isFinite(amt) && amt > 0, 'amount must be > 0');
    ensureRazorpayKeys('Razorpay credentials required to create orders');

    const userId = req.user.id;
    const order = await razorpayRequest('/orders', {
      method: 'POST',
      body: {
        amount: Math.round(amt * 100),
        currency,
        receipt: `rcpt_${userId}_${Date.now()}`.slice(0, 40),
        payment_capture: 1
      }
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'ADD_FUNDS',
        status: 'PENDING',
        amount: amt,
        currency,
        walletTo: 'MAIN',
        provider: 'RAZORPAY',
        referenceId: order.id,
        description: 'Add funds via Razorpay',
        meta: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          status: order.status
        }
      }
    });

    return res.json({ ok: true, provider: 'RAZORPAY', order });
  } catch (err) { next(err); }
}

// Purchase tokens by specifying desired quantity (debited from main wallet)
export async function createTokenPurchaseOrder(req, res, next) {
  try {
    const { tokens, pin } = req.body || {};
    const userId = req.user.id;

    const requestedTokens = Number(tokens);
    assert(Number.isFinite(requestedTokens) && requestedTokens > 0, 'tokens must be > 0');

    const tokenValueInr = getTokenValueInr();
    const amountInr = tokensToInr(requestedTokens, tokenValueInr);
    assert(amountInr > 0, 'Unable to compute purchase amount');

    const rate = Number(env.USD_INR_RATE || 1) || 1;
    const priceUsd = Number((amountInr / rate).toFixed(2));

    await requireTransactionPin(userId, pin);

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      assert(Number(wallet.mainBalance) >= amountInr, 'Insufficient main balance', 400);

      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: {
          mainBalance: { decrement: amountInr },
          tokenBalance: { increment: requestedTokens }
        }
      });

      const trx = await tx.transaction.create({
        data: {
          userId,
          type: 'TOKEN_PURCHASE',
          status: 'SUCCESS',
          amount: amountInr,
          currency: 'INR',
          walletFrom: 'MAIN',
          walletTo: 'TOKEN',
          provider: 'SYSTEM',
          description: `Token purchase (${requestedTokens})`,
          meta: {
            mode: 'DIRECT_TOKEN_PURCHASE',
            priceUsd,
            amountInr,
            tokens: requestedTokens,
            rate: Number(env.USD_INR_RATE || 1),
            tokenValueInr
          }
        }
      });

      const plan = await getDefaultTokenPlan(tx);

      const purchase = await tx.tokenPurchase.create({
        data: {
          userId,
          planId: plan.id,
          transactionId: trx.id,
          status: 'SUCCESS',
          priceUsd,
          priceInr: amountInr,
          tokens: requestedTokens
        }
      });

      const invoice = await createInvoiceForTokenPurchase({
        userId,
        tokenPurchase: purchase,
        planName: plan.name,
        amountInr,
        tokens: requestedTokens
      }, tx);

      return { wallet: updatedWallet, trx, purchase, invoice, plan };
    });

    eventBus.emit(EVENTS.TOKEN_PURCHASED, {
      userId,
      tokens: Number(result.purchase.tokens),
      amount: Number(result.trx.amount),
      currency: result.trx.currency,
      planName: result.plan?.name || 'Token Purchase',
      tokenValueInr
    });

    return res.json({
      ok: true,
      tokenPurchaseId: result.purchase.id,
      transactionId: result.trx.id,
      tokens: requestedTokens,
      tokenValueInr,
      amountInr,
      invoiceId: result.invoice?.id || null,
      wallet: {
        mainBalance: Number(result.wallet.mainBalance),
        tokenBalance: Number(result.wallet.tokenBalance)
      }
    });
  } catch (err) { next(err); }
}

// Withdraw funds from main wallet using Razorpay semantics.
// If amount exceeds WITHDRAW_ADMIN_THRESHOLD, leave as PENDING awaiting admin approval.
export async function withdrawFunds(req, res, next) {
  try {
    const { amount, method = 'UPI', details, pin } = req.body || {};
    const amt = Number(amount);
    assert(Number.isFinite(amt) && amt > 0, 'amount must be > 0');

    const payoutMethod = String(method || '').toUpperCase();
    assert(payoutMethod === 'UPI' || payoutMethod === 'BANK', 'method must be UPI or BANK');
    const hasPayoutConfig = hasRazorpayPayoutConfig();

    const sanitizedDetails = validateWithdrawDetails(payoutMethod, cloneJson(details, {}));

    const min = Number(env.MIN_WITHDRAW_AMOUNT || 100);
    assert(amt >= min, `Minimum withdrawal is Rs ${min}`, 400);

    const threshold = Number(env.WITHDRAW_ADMIN_THRESHOLD || 5000);
    const requiresApproval = amt > threshold;

    const userId = req.user.id;
    await requireTransactionPin(userId, pin);

    const { wallet: debitedWallet, transaction } = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      assert(Number(wallet.mainBalance) >= amt, 'Insufficient balance', 400);

      const updatedWallet = await tx.wallet.update({ where: { userId }, data: { mainBalance: { decrement: amt } } });

      const description = requiresApproval
        ? `Withdrawal via ${payoutMethod} (awaiting admin approval)`
        : `Withdrawal via ${payoutMethod}`;

      const trx = await tx.transaction.create({
        data: {
          userId,
          type: 'WITHDRAW',
          status: 'PENDING',
          amount: amt,
          currency: updatedWallet.currency,
          walletFrom: 'MAIN',
          provider: 'RAZORPAY',
          description,
          meta: {
            method: payoutMethod,
            details: sanitizedDetails,
            requiresApproval,
            manualPayoutRequired: !hasPayoutConfig
          }
        }
      });

      return { wallet: updatedWallet, transaction: trx };
    });

    eventBus.emit(EVENTS.WITHDRAW_REQUESTED, {
      userId,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      status: requiresApproval ? 'AWAITING_ADMIN' : 'PROCESSING'
    });

    if (requiresApproval || !hasPayoutConfig) {
      const message = requiresApproval
        ? 'Withdrawal queued for admin approval'
        : 'Withdrawal pending manual processing (payout credentials not configured)';
      return res.status(202).json({
        ok: true,
        wallet: debitedWallet,
        transaction,
        message
      });
    }

    try {
      ensureRazorpayPayoutConfig();
      const result = await triggerRazorpayPayout({
        trx: transaction,
        user: req.user,
        method: payoutMethod,
        details: sanitizedDetails
      });
      const walletState = result.wallet || debitedWallet;
      return res.status(202).json({ ok: true, wallet: walletState, transaction: result.transaction, payout: result.payout });
    } catch (error) {
      const walletLatest = await prisma.wallet.findUnique({ where: { userId } });
      if (walletLatest) error.wallet = walletLatest;
      return next(error);
    }
  } catch (err) { next(err); }
}

// List payment-related transactions (add funds + withdraw)
export async function paymentTransactions(req, res, next) {
  try {
    const { limit = 20, cursor, status, type } = req.query || {};
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const where = { userId: req.user.id };

    const typeFilter = String(type || '').toUpperCase();
    if (typeFilter === 'ADD_FUNDS' || typeFilter === 'WITHDRAW') where.type = typeFilter;
    else where.type = { in: ['ADD_FUNDS', 'WITHDRAW'] };

    const statusFilter = String(status || '').toUpperCase();
    if (['PENDING', 'SUCCESS', 'FAILED'].includes(statusFilter)) where.status = statusFilter;

    const items = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: String(cursor) } : undefined
    });
    const nextCursor = items.length === take ? items[items.length - 1].id : null;
    res.json({ ok: true, items, nextCursor });
  } catch (err) { next(err); }
}

// Admin: approve a pending withdrawal (keep funds debited, mark SUCCESS)
export async function approveWithdrawal(req, res, next) {
  try {
    const { id } = req.params;
    const trx = await prisma.transaction.findUnique({ where: { id } });
    if (!trx || trx.type !== 'WITHDRAW' || trx.status !== 'PENDING') {
      const err = new Error('Withdrawal not found or not pending'); err.status = 404; throw err;
    }

    const meta = toPlainObject(trx.meta);
    const method = String(meta.method || 'UPI').toUpperCase();
    const details = cloneJson(meta.details, {});
    validateWithdrawDetails(method, details);
    const hasPayoutConfig = hasRazorpayPayoutConfig();

    const user = await prisma.user.findUnique({ where: { id: trx.userId } });
    assert(user, 'User not found for withdrawal', 404);

    if (meta.razorpay?.payoutId) {
      return res.json({ ok: true, transaction: trx, payout: meta.razorpay });
    }

    if (!hasPayoutConfig) {
      const updated = await prisma.transaction.update({
        where: { id: trx.id },
        data: {
          status: 'SUCCESS',
          description: appendDescription(trx.description || `Withdrawal via ${method}`, '(processed manually)'),
          meta: {
            ...meta,
            requiresApproval: false,
            manualPayoutRequired: false,
            manualPayout: {
              ...(toPlainObject(meta.manualPayout)),
              processedBy: req.user.id,
              processedAt: new Date().toISOString()
            }
          }
        }
      });
      return res.json({ ok: true, transaction: updated, message: 'Withdrawal marked as processed manually' });
    }

    const result = await triggerRazorpayPayout({
      trx,
      user,
      method,
      details,
      adminUserId: req.user.id
    });

    const response = { ok: true, transaction: result.transaction, payout: result.payout };
    if (result.wallet) response.wallet = result.wallet;
    res.json(response);
  } catch (err) { next(err); }
}

// Admin: reject a pending withdrawal (refund to main wallet, mark FAILED)
export async function rejectWithdrawal(req, res, next) {
  try {
    const { id } = req.params;
    const trx = await prisma.transaction.findUnique({ where: { id } });
    if (!trx || trx.type !== 'WITHDRAW' || trx.status !== 'PENDING') {
      const err = new Error('Withdrawal not found or not pending'); err.status = 404; throw err;
    }

    const meta = toPlainObject(trx.meta);
    if (meta.razorpay?.payoutId) {
      const err = new Error('Withdrawal already initiated with Razorpay; cannot reject');
      err.status = 400;
      throw err;
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { userId: trx.userId },
        data: { mainBalance: { increment: Number(trx.amount) } }
      });
      const updatedTransaction = await tx.transaction.update({
        where: { id },
        data: {
          status: 'FAILED',
          description: appendDescription(trx.description || 'Withdrawal', '(rejected)'),
          meta: {
            ...meta,
            requiresApproval: false,
            manualPayoutRequired: false,
            admin: {
              ...(toPlainObject(meta.admin)),
              rejectedBy: req.user.id,
              rejectedAt: new Date().toISOString()
            }
          }
        }
      });
      return { wallet: updatedWallet, transaction: updatedTransaction };
    });

    res.json({ ok: true, wallet: result.wallet, transaction: result.transaction });
  } catch (err) { next(err); }
}

// Helper used by webhook to finalize token purchases and produce invoice
export async function finalizeSuccessfulTokenPurchase(tx, trx) {
  if (trx.type !== 'TOKEN_PURCHASE' || trx.status !== 'SUCCESS') return null;
  const purchase = await tx.tokenPurchase.findFirst({ where: { transactionId: trx.id } });
  if (!purchase) return null;
  if (purchase.status === 'SUCCESS') return null; // idempotent

  // Credit token wallet (create wallet if missing)
  await tx.wallet.upsert({
    where: { userId: trx.userId },
    update: { tokenBalance: { increment: Number(purchase.tokens) } },
    create: { userId: trx.userId, tokenBalance: Number(purchase.tokens) }
  });

  const updated = await tx.tokenPurchase.update({ where: { id: purchase.id }, data: { status: 'SUCCESS' } });

  // Generate invoice
  await createInvoiceForTokenPurchase({
    userId: trx.userId,
    tokenPurchase: updated,
    planName: trx.meta?.planName || 'Plan',
    amountInr: Number(updated.priceInr),
    tokens: Number(updated.tokens)
  }, tx);

  await recordPlanRenewal(trx.userId, new Date(), tx);
  const commissionResult = await distributePurchaseCommission({
    userId: trx.userId,
    amountInr: Number(updated.priceInr),
    transactionId: trx.id,
    purchaseId: updated.id,
    currency: trx.currency
  }, tx);

  return {
    purchaseEvent: {
      userId: trx.userId,
      tokens: Number(updated.tokens),
      amount: Number(trx.amount),
      currency: trx.currency,
      planName: trx.meta?.planName || null,
      tokenValueInr: getTokenValueInr()
    },
    commissionPayouts: commissionResult.payouts,
    commissionSkipped: commissionResult.skipped
  };
}

export async function listTokenPurchases(req, res, next) {
  try {
    const { limit = 20, cursor } = req.query || {};
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const userId = req.user.id;

    const purchases = await prisma.tokenPurchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: String(cursor) } : undefined,
      include: {
        plan: true,
        invoice: { select: { id: true, createdAt: true } },
        transaction: { select: { id: true, amount: true, currency: true, status: true, createdAt: true } }
      }
    });

    const nextCursor = purchases.length === take ? purchases[purchases.length - 1].id : null;
    const perTokenInr = getTokenValueInr();
    const items = purchases.map((p) => ({
      id: p.id,
      status: p.status,
      priceUsd: Number(p.priceUsd),
      priceInr: Number(p.priceInr),
      tokens: Number(p.tokens),
      tokenValueInr: perTokenInr,
      createdAt: p.createdAt,
      plan: { id: p.planId, name: p.plan?.name || null },
      invoice: p.invoice ? { id: p.invoice.id, createdAt: p.invoice.createdAt } : null,
      transaction: p.transaction ? {
        id: p.transaction.id,
        amount: Number(p.transaction.amount),
        currency: p.transaction.currency,
        status: p.transaction.status,
        createdAt: p.transaction.createdAt
      } : null
    }));

    res.json({ ok: true, items, nextCursor });
  } catch (err) { next(err); }
}

export async function downloadTokenPurchaseInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const purchase = await prisma.tokenPurchase.findUnique({
      where: { id: String(id) },
      include: { invoice: true }
    });
    if (!purchase || purchase.userId !== req.user.id) {
      const err = new Error('Token purchase not found');
      err.status = 404;
      throw err;
    }
    assert(purchase.invoice, 'Invoice not available', 404);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${purchase.id}.pdf"`);
    res.send(Buffer.from(purchase.invoice.pdf));
  } catch (err) { next(err); }
}
