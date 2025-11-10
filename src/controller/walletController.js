import { prisma } from '../prisma/client.js';
import { requireTransactionPin } from '../services/pinService.js';

function assert(condition, message = 'Bad Request', code = 400) {
  if (!condition) {
    const err = new Error(message);
    err.status = code;
    throw err;
  }
}

async function getOrCreateWallet(userId) {
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId } });
  }
  return wallet;
}

export async function getWallet(req, res, next) {
  try {
    const wallet = await getOrCreateWallet(req.user.id);
    res.json({ ok: true, wallet });
  } catch (err) { next(err); }
}

export async function transferReferralToMain(req, res, next) {
  try {
    const { amount, pin } = req.body || {};
    const amt = Number(amount);
    assert(Number.isFinite(amt) && amt > 0, 'amount must be > 0');

    const userId = req.user.id;
    await requireTransactionPin(userId, pin);

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(userId);
      assert(Number(wallet.referralBalance) >= amt, 'Insufficient referral balance', 400);

      const updated = await tx.wallet.update({
        where: { userId },
        data: {
          referralBalance: { decrement: amt },
          mainBalance: { increment: amt }
        }
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'TRANSFER_INTERNAL',
          status: 'SUCCESS',
          amount: amt,
          currency: updated.currency,
          walletFrom: 'REFERRAL',
          walletTo: 'MAIN',
          provider: 'SYSTEM',
          description: 'Referral to Main transfer'
        }
      });

      return updated;
    });

    res.json({ ok: true, wallet: result });
  } catch (err) { next(err); }
}

export async function listTransactions(req, res, next) {
  try {
    const { limit = 20, cursor } = req.query || {};
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const where = { userId: req.user.id };

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
