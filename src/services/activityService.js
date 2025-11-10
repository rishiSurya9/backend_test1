import { prisma } from '../prisma/client.js';
import { env } from '../config/env.js';

const GRACE_DAYS = Number(env.MONTHLY_ACTIVITY_GRACE_DAYS || 30);

function cloneDate(date) {
  return new Date(date.getTime());
}

function startOfMonth(date) {
  const d = cloneDate(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = cloneDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function upsertActivityHistory(tx, { userId, period, status, notes }) {
  await tx.activityHistory.upsert({
    where: { user_period: { userId, period } },
    update: {
      status,
      notes,
      checkedAt: new Date()
    },
    create: {
      userId,
      period,
      status,
      notes
    }
  });
}

export async function recordPlanRenewal(userId, referenceDate = new Date(), txOverride = null) {
  if (!userId) return null;
  const executor = txOverride || prisma;
  const renewedAt = cloneDate(referenceDate);
  const activeUntil = addDays(renewedAt, GRACE_DAYS);
  const updated = await executor.user.update({
    where: { id: userId },
    data: {
      isActive: true,
      activityStatus: 'ACTIVE',
      lastPlanRenewalAt: renewedAt,
      activeUntil
    }
  });

  await upsertActivityHistory(executor, {
    userId,
    period: startOfMonth(renewedAt),
    status: 'ACTIVE',
    notes: 'Plan renewed'
  });

  return updated;
}

export async function ensureUserActivityStatus(userId, txOverride = null) {
  if (!userId) return null;
  const executor = txOverride || prisma;
  const now = new Date();
  const user = await executor.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      activityStatus: true,
      activeUntil: true
    }
  });
  if (!user) return null;

  if (user.activeUntil && new Date(user.activeUntil) >= now) {
    if (!user.isActive || user.activityStatus !== 'ACTIVE') {
      await executor.user.update({
        where: { id: userId },
        data: { isActive: true, activityStatus: 'ACTIVE' }
      });
    }
    return { status: 'ACTIVE', changed: false };
  }

  if (user.isActive || user.activityStatus !== 'LAPSED') {
    await executor.user.update({
      where: { id: userId },
      data: { isActive: false, activityStatus: 'LAPSED' }
    });
    await upsertActivityHistory(executor, {
      userId,
      period: startOfMonth(now),
      status: 'LAPSED',
      notes: 'Activity period expired'
    });
    return { status: 'LAPSED', changed: true };
  }

  return { status: 'LAPSED', changed: false };
}
