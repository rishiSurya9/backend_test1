import { prisma } from '../prisma/client.js';
import { verifyPassword } from '../utils/crypto.js';

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function requireTransactionPin(userId, pin) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw httpError('pin must be 4 digits');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pinHash: true, phoneVerifiedAt: true }
  });

  if (!user) {
    throw httpError('Unauthorized', 401);
  }
  if (!user.phoneVerifiedAt) {
    throw httpError('Phone not verified', 403);
  }
  if (!user.pinHash) {
    throw httpError('Transaction PIN not set', 403);
  }

  const isValid = await verifyPassword(pin, user.pinHash);
  if (!isValid) {
    throw httpError('Invalid PIN', 401);
  }

  return user;
}

