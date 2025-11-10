import { prisma } from '../prisma/client.js';

export async function clearDatabase(req, res, next) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.invoice.deleteMany();
      await tx.tokenPurchase.deleteMany();
      await tx.transaction.deleteMany();
      await tx.wallet.deleteMany();
      await tx.oTP.deleteMany();
      await tx.user.deleteMany();
      await tx.plan.deleteMany();
    });

    res.json({ ok: true, cleared: true });
  } catch (err) {
    next(err);
  }
}
