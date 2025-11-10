import { prisma } from '../prisma/client.js';
import { env } from '../config/env.js';

const MAX_CHILDREN = Number(env.MATRIX_CHILD_LIMIT || 8);
const QUALIFICATION_STEP = 8;
const MAX_QUALIFICATION_LEVEL = 8;

const USER_MATRIX_RETURN_SELECT = {
  id: true,
  username: true,
  email: true,
  phone: true,
  sponsorId: true,
  parentId: true,
  path: true,
  matrixLevel: true,
  qualificationLevel: true,
  activityStatus: true,
  isActive: true,
  createdAt: true,
  lastPlanRenewalAt: true
};

const SPONSOR_SELECT = {
  id: true,
  parentId: true,
  path: true,
  matrixLevel: true
};

function normalizeReferral(referral) {
  if (!referral || typeof referral !== 'string') return null;
  const trimmed = referral.trim();
  return trimmed.length ? trimmed : null;
}

async function syncAvailableSlot(tx, { userId, depth, path, childCount }) {
  const existing = await tx.availablePosition.findUnique({ where: { userId } });
  if (childCount >= MAX_CHILDREN) {
    if (existing) {
      await tx.availablePosition.delete({ where: { id: existing.id } });
    }
    return;
  }
  if (existing) {
    await tx.availablePosition.update({
      where: { id: existing.id },
      data: { depth, childCount, path }
    });
  } else {
    await tx.availablePosition.create({
      data: { userId, depth, childCount, path }
    });
  }
}

async function ensureUserPath(tx, user) {
  if (user.path) return user;
  const basePath = `/${user.id}/`;
  const matrixLevel = typeof user.matrixLevel === 'number' ? user.matrixLevel : 0;
  const updated = await tx.user.update({
    where: { id: user.id },
    data: {
      path: basePath,
      matrixLevel,
      positionIndex: 0
    },
    select: SPONSOR_SELECT
  });
  const childCount = await tx.user.count({ where: { parentId: updated.id } });
  await syncAvailableSlot(tx, {
    userId: updated.id,
    depth: updated.matrixLevel ?? 0,
    path: updated.path,
    childCount
  });
  return updated;
}

async function resolveSponsor(tx, referral) {
  const ref = normalizeReferral(referral);
  if (ref) {
    const byId = await tx.user.findUnique({ where: { id: ref }, select: SPONSOR_SELECT });
    if (byId) return byId;
    if (ref.includes('@')) {
      const byEmail = await tx.user.findUnique({ where: { email: ref }, select: SPONSOR_SELECT });
      if (byEmail) return byEmail;
    }
    if (/^\d+$/.test(ref)) {
      const byPhone = await tx.user.findUnique({ where: { phone: ref }, select: SPONSOR_SELECT });
      if (byPhone) return byPhone;
    }
    const byUsername = await tx.user.findUnique({ where: { username: ref }, select: SPONSOR_SELECT });
    if (byUsername) return byUsername;
  }

  if (env.MATRIX_ROOT_USER_ID) {
    return tx.user.findUnique({ where: { id: env.MATRIX_ROOT_USER_ID }, select: SPONSOR_SELECT });
  }

  return null;
}

async function ensureRootBootstrap(tx) {
  if (!env.MATRIX_ROOT_USER_ID) return;

  const root = await tx.user.findUnique({
    where: { id: env.MATRIX_ROOT_USER_ID },
    select: SPONSOR_SELECT
  });
  if (!root) return;

  const placedRoot = await ensureUserPath(tx, root);
  const childrenCount = await tx.user.count({ where: { parentId: placedRoot.id } });
  await syncAvailableSlot(tx, {
    userId: placedRoot.id,
    depth: placedRoot.matrixLevel ?? 0,
    path: placedRoot.path,
    childCount: childrenCount
  });
}

async function lockNextAvailableSlot(tx, basePath = null) {
  let rows;
  if (basePath) {
    const likePattern = `${basePath}%`;
    rows = await tx.$queryRaw`
      SELECT id, userId, childCount, depth, path
      FROM AvailablePosition
      WHERE path LIKE ${likePattern}
      ORDER BY depth ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `;
  } else {
    rows = await tx.$queryRaw`
      SELECT id, userId, childCount, depth, path
      FROM AvailablePosition
      ORDER BY depth ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const [row] = rows;
  return {
    id: Number(row.id),
    userId: String(row.userId),
    childCount: Number(row.childCount),
    depth: Number(row.depth),
    path: String(row.path)
  };
}

async function createPositionSlot(tx, { userId, depth, path }) {
  await tx.availablePosition.upsert({
    where: { userId },
    update: { depth, childCount: 0, path },
    create: {
      userId,
      depth,
      childCount: 0,
      path
    }
  });
}

async function placeAsRoot(tx, userId, sponsorId) {
  const path = `/${userId}/`;
  const user = await tx.user.update({
    where: { id: userId },
    data: {
      sponsorId: sponsorId || undefined,
      parentId: null,
      path,
      matrixLevel: 0,
      positionIndex: 0
    },
    select: USER_MATRIX_RETURN_SELECT
  });
  await createPositionSlot(tx, { userId, depth: 0, path });
  return user;
}

async function placeUnderSponsor(tx, sponsor, userId, sponsorId) {
  const preparedSponsor = sponsor.path ? sponsor : await ensureUserPath(tx, sponsor);
  const childCountBefore = await tx.user.count({ where: { parentId: preparedSponsor.id } });
  if (childCountBefore >= MAX_CHILDREN) return null;

  const parentPath = preparedSponsor.path || `/${preparedSponsor.id}/`;
  const depth = (preparedSponsor.matrixLevel ?? 0) + 1;
  const path = `${parentPath}${userId}/`;

  const user = await tx.user.update({
    where: { id: userId },
    data: {
      sponsorId: sponsorId || preparedSponsor.id,
      parentId: preparedSponsor.id,
      path,
      matrixLevel: depth,
      positionIndex: childCountBefore
    },
    select: USER_MATRIX_RETURN_SELECT
  });

  await syncAvailableSlot(tx, {
    userId: preparedSponsor.id,
    depth: preparedSponsor.matrixLevel ?? 0,
    path: parentPath,
    childCount: childCountBefore + 1
  });

  await createPositionSlot(tx, { userId, depth, path });
  return user;
}

async function placeUnderParent(tx, slot, userId, sponsorId) {
  const nextIndex = slot.childCount;
  const depth = slot.depth + 1;
  const path = `${slot.path}${userId}/`;

  if (slot.childCount + 1 >= MAX_CHILDREN) {
    await tx.availablePosition.delete({ where: { id: slot.id } });
  } else {
    await tx.availablePosition.update({
      where: { id: slot.id },
      data: { childCount: slot.childCount + 1 }
    });
  }

  const user = await tx.user.update({
    where: { id: userId },
    data: {
      sponsorId: sponsorId || undefined,
      parentId: slot.userId,
      path,
      matrixLevel: depth,
      positionIndex: nextIndex
    },
    select: USER_MATRIX_RETURN_SELECT
  });

  await createPositionSlot(tx, { userId, depth, path });
  return user;
}

export async function assignSponsorAndPlaceUser({ userId, referralCode } = {}, txOverride = null) {
  if (!userId) {
    const error = new Error('userId required for matrix placement');
    error.status = 400;
    throw error;
  }

  const runner = async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: USER_MATRIX_RETURN_SELECT
    });
    if (!current) {
      const error = new Error('User not found for placement');
      error.status = 404;
      throw error;
    }
    if (current.path) {
      if (!current.sponsorId && referralCode) {
        const sponsor = await resolveSponsor(tx, referralCode);
        if (sponsor) {
          return tx.user.update({
            where: { id: userId },
            data: { sponsorId: sponsor.id },
            select: USER_MATRIX_RETURN_SELECT
          });
        }
      }
      return current;
    }

    await ensureRootBootstrap(tx);
    const sponsor = await resolveSponsor(tx, referralCode);

    if (sponsor) {
      const preparedSponsor = await ensureUserPath(tx, sponsor);
      const directPlacement = await placeUnderSponsor(tx, preparedSponsor, userId, preparedSponsor.id);
      if (directPlacement) return directPlacement;

      const slot = await lockNextAvailableSlot(tx, preparedSponsor.path || `/${preparedSponsor.id}/`);
      if (slot) {
        return placeUnderParent(tx, slot, userId, preparedSponsor.id);
      }
    }

    const slot = await lockNextAvailableSlot(tx);
    if (!slot) {
      return placeAsRoot(tx, userId, sponsor?.id || null);
    }

    return placeUnderParent(tx, slot, userId, sponsor?.id || null);
  };

  if (txOverride) {
    return runner(txOverride);
  }

  return prisma.$transaction(async (tx) => runner(tx), { maxWait: 5000, timeout: 10000 });
}

export async function getAncestorsUpTo(userId, levels = 8, txOverride = null) {
  if (!userId) return [];
  const levelsToFetch = Math.max(1, Math.min(Number(levels) || 1, 32));
  const executor = txOverride || prisma;
  const user = await executor.user.findUnique({
    where: { id: userId },
    select: { path: true }
  });
  if (!user?.path) return [];

  const parts = user.path.split('/').filter(Boolean);
  parts.pop(); // remove self
  const ancestorIds = parts.slice(-levelsToFetch).reverse();
  if (!ancestorIds.length) return [];

  const ancestors = await executor.user.findMany({
    where: { id: { in: ancestorIds } },
    select: {
      id: true,
      activityStatus: true,
      qualificationLevel: true,
      isActive: true,
      activeUntil: true,
      matrixLevel: true
    }
  });

  const ancestorsById = new Map(ancestors.map((x) => [x.id, x]));
  return ancestorIds.map((id, index) => ({
    level: index + 1,
    ...ancestorsById.get(id),
    id
  })).filter((entry) => Boolean(entry.id));
}

export async function recalculateQualificationLevel(userId, txOverride = null) {
  if (!userId) return { level: 0, changed: false, activeDirects: 0 };
  const executor = txOverride || prisma;
  const now = new Date();

  const [current, activeDirects] = await Promise.all([
    executor.user.findUnique({
      where: { id: userId },
      select: { qualificationLevel: true }
    }),
    executor.user.count({
      where: {
        sponsorId: userId,
        activityStatus: 'ACTIVE',
        isActive: true,
        OR: [
          { activeUntil: null },
          { activeUntil: { gt: now } }
        ]
      }
    })
  ]);

  const existingLevel = current?.qualificationLevel || 0;
  const computedLevel = Math.min(
    MAX_QUALIFICATION_LEVEL,
    Math.floor(activeDirects / QUALIFICATION_STEP)
  );

  if (computedLevel === existingLevel) {
    return { level: existingLevel, changed: false, activeDirects };
  }

  await executor.user.update({
    where: { id: userId },
    data: { qualificationLevel: computedLevel }
  });

  if (computedLevel > existingLevel) {
    for (let level = existingLevel + 1; level <= computedLevel; level += 1) {
      await executor.levelQualificationHistory.create({
        data: {
          userId,
          level,
          status: 'QUALIFIED',
          notes: `Active direct referrals: ${activeDirects}`
        }
      });
    }
  } else {
    for (let level = existingLevel; level > computedLevel; level -= 1) {
      await executor.levelQualificationHistory.create({
        data: {
          userId,
          level,
          status: 'REVOKED',
          notes: `Active direct referrals: ${activeDirects}`
        }
      });
    }
  }

  return { level: computedLevel, changed: true, activeDirects };
}
