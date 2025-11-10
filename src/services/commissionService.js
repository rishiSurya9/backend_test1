import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { env } from '../config/env.js';
import { getAncestorsUpTo } from './matrixService.js';
import { ensureUserActivityStatus } from './activityService.js';

const COMMISSION_LEVELS = 8;

function parsePercent(value) {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'number') return new Prisma.Decimal(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return new Prisma.Decimal(numeric);
  return new Prisma.Decimal(0);
}

function roundMoney(decimal) {
  if (!(decimal instanceof Prisma.Decimal)) return new Prisma.Decimal(0);
  return decimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function getDefaultCommissionPercents() {
  const fallback = [10, 5, 3, 2, 1.5, 1, 0.5, 0.25];
  const raw = env.COMMISSION_DEFAULTS;
  if (!raw) return fallback;
  const values = raw.split(',')
    .map((entry) => entry.trim())
    .map((entry) => Number(entry))
    .filter((num) => Number.isFinite(num) && num >= 0);
  if (!values.length) return fallback;
  const filled = [...values];
  while (filled.length < COMMISSION_LEVELS) {
    filled.push(0);
  }
  return filled.slice(0, COMMISSION_LEVELS);
}

async function fetchCommissionPercents(tx) {
  const settings = await tx.commissionSetting.findMany({
    orderBy: { level: 'asc' }
  });
  if (!settings.length) {
    const defaults = getDefaultCommissionPercents();
    await Promise.all(defaults.map((percent, index) => tx.commissionSetting.create({
      data: { level: index + 1, percent }
    })));
    return defaults.map((percent, index) => ({ level: index + 1, percent }));
  }
  return settings.map((entry) => ({
    level: entry.level,
    percent: Number(entry.percent)
  }));
}

async function creditReferralWallet(tx, { userId, amount, currency, description, referenceId, meta }) {
  const numericAmount = amount instanceof Prisma.Decimal ? amount.toNumber() : Number(amount);
  await tx.wallet.upsert({
    where: { userId },
    update: {
      referralBalance: { increment: numericAmount }
    },
    create: {
      userId,
      referralBalance: numericAmount
    }
  });
  const transaction = await tx.transaction.create({
    data: {
      userId,
      type: 'COMMISSION',
      status: 'SUCCESS',
      provider: 'SYSTEM',
      amount,
      currency,
      walletTo: 'REFERRAL',
      referenceId,
      description,
      meta
    }
  });
  return transaction;
}

function isAncestorEligible(ancestor, level) {
  const now = new Date();
  if (!ancestor) return { eligible: false, reason: 'Ancestor missing' };
  if (!ancestor.isActive || ancestor.activityStatus !== 'ACTIVE') {
    return { eligible: false, reason: 'Ancestor inactive' };
  }
  if (ancestor.activeUntil && new Date(ancestor.activeUntil) < now) {
    return { eligible: false, reason: 'Plan expired' };
  }
  if ((ancestor.qualificationLevel || 0) < level) {
    return { eligible: false, reason: 'Level not qualified' };
  }
  return { eligible: true };
}

function buildEventRef({ transactionId, purchaseId, level, ancestorId }) {
  const refBase = transactionId || purchaseId;
  return `commission:${refBase}:${level}:${ancestorId}`;
}

export async function ensureCommissionSettingsSeeded() {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.commissionSetting.count();
    if (existing > 0) return;
    const defaults = getDefaultCommissionPercents();
    await Promise.all(defaults.map((percent, index) => tx.commissionSetting.create({
      data: { level: index + 1, percent }
    })));
  });
}

export async function distributePurchaseCommission(
  {
    userId,
    amountInr,
    transactionId,
    purchaseId,
    currency = env.COMMISSION_CURRENCY || 'INR'
  },
  txOverride = null
) {
  const baseAmount = new Prisma.Decimal(amountInr || 0);
  if (baseAmount.lte(0)) {
    return { payouts: [], skipped: [] };
  }

  const payouts = [];
  const skipped = [];

  const runner = async (tx) => {
    const [percents, ancestors] = await Promise.all([
      fetchCommissionPercents(tx),
      getAncestorsUpTo(userId, COMMISSION_LEVELS, tx)
    ]);

    const orderedAncestors = new Map((ancestors || []).map((entry) => [Number(entry.level), entry]));

    for (const setting of percents) {
      const level = Number(setting.level);
      const percentDecimal = parsePercent(setting.percent);
      if (level > COMMISSION_LEVELS) continue;

      const ancestor = orderedAncestors.get(level);
      if (!ancestor) continue;

      const activityResult = await ensureUserActivityStatus(ancestor.id, tx);
      if (activityResult?.status) {
        ancestor.activityStatus = activityResult.status;
        ancestor.isActive = activityResult.status === 'ACTIVE';
      }

      const commissionRaw = roundMoney(baseAmount.mul(percentDecimal).div(100));
      if (commissionRaw.lte(0)) {
        skipped.push({ level, ancestorId: ancestor.id, reason: 'Zero commission amount' });
        continue;
      }

      const eligibility = isAncestorEligible(ancestor, level);
      const eventRef = buildEventRef({ transactionId, purchaseId, level, ancestorId: ancestor.id });

      try {
        const history = await tx.commissionHistory.create({
          data: {
            userId: ancestor.id,
            sourceUserId: userId,
            level,
            amount: eligibility.eligible ? commissionRaw : new Prisma.Decimal(0),
            currency,
            status: eligibility.eligible ? 'PAID' : 'SKIPPED',
            reason: eligibility.reason || null,
            eventRef
          }
        });

        if (!eligibility.eligible) {
          skipped.push({ level, ancestorId: ancestor.id, reason: eligibility.reason });
          continue;
        }

        const description = `Level ${level} commission from ${userId}`;
        const transaction = await creditReferralWallet(tx, {
          userId: ancestor.id,
          amount: commissionRaw,
          currency,
          description,
          referenceId: eventRef,
          meta: {
            level,
            fromUserId: userId,
            purchaseId,
            transactionId
          }
        });

        await tx.commissionHistory.update({
          where: { id: history.id },
          data: { walletTransactionId: transaction.id }
        });

        payouts.push({
          userId: ancestor.id,
          amount: Number(commissionRaw),
          currency
        });
      } catch (err) {
        if (err?.code === 'P2002') {
          skipped.push({ level, ancestorId: ancestor.id, reason: 'Duplicate commission detected' });
          continue;
        }
        throw err;
      }
    }
  };

  if (txOverride) {
    await runner(txOverride);
  } else {
    await prisma.$transaction(async (tx) => runner(tx));
  }

  return { payouts, skipped };
}
