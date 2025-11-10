import { prisma } from '../prisma/client.js';

const MAX_DEPTH = 8;

const USER_MATRIX_SELECT = {
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

function parseDepth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MAX_DEPTH;
  if (numeric < 1) return 1;
  if (numeric > MAX_DEPTH) return MAX_DEPTH;
  return Math.floor(numeric);
}

function ensureUserPlacement(user) {
  if (!user?.path) {
    const err = new Error('User is not placed in the matrix yet');
    err.status = 409;
    throw err;
  }
}

async function resolveTargetUser(authUserId, targetUserId) {
  const me = await prisma.user.findUnique({
    where: { id: authUserId },
    select: USER_MATRIX_SELECT
  });
  if (!me) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  ensureUserPlacement(me);

  if (!targetUserId || targetUserId === authUserId) {
    return { me, target: me };
  }

  const target = await prisma.user.findUnique({
    where: { id: String(targetUserId) },
    select: USER_MATRIX_SELECT
  });
  if (!target) {
    const err = new Error('Requested member not found');
    err.status = 404;
    throw err;
  }
  ensureUserPlacement(target);

  if (!target.path.startsWith(me.path)) {
    const err = new Error('Requested member is outside your downline');
    err.status = 403;
    throw err;
  }

  return { me, target };
}

async function loadHierarchy(target, depth) {
  const maxLevel = target.matrixLevel + depth;
  const nodes = await prisma.user.findMany({
    where: {
      path: { startsWith: target.path },
      matrixLevel: { lte: maxLevel + 1 }
    },
    select: USER_MATRIX_SELECT
  });

  const trimmed = [];
  let hasMore = false;
  for (const node of nodes) {
    const relativeLevel = node.matrixLevel - target.matrixLevel;
    if (relativeLevel <= depth) {
      trimmed.push({
        ...node,
        relativeLevel
      });
    } else {
      hasMore = true;
    }
  }

  return { nodes: trimmed, hasMore };
}

function buildTree(targetId, nodes) {
  const byId = new Map();
  const byParent = new Map();

  nodes.forEach((node) => {
    const formatted = {
      id: node.id,
      username: node.username,
      email: node.email,
      phone: node.phone,
      sponsorId: node.sponsorId,
      parentId: node.parentId,
      level: node.relativeLevel,
      matrixLevel: node.matrixLevel,
      qualificationLevel: node.qualificationLevel,
      activityStatus: node.activityStatus,
      isActive: node.isActive,
      createdAt: node.createdAt,
      lastPlanRenewalAt: node.lastPlanRenewalAt,
      children: [],
      childCount: 0
    };
    byId.set(node.id, formatted);
    if (!byParent.has(node.parentId || null)) {
      byParent.set(node.parentId || null, []);
    }
    byParent.get(node.parentId || null).push(formatted);
  });

  byId.forEach((node) => {
    node.childCount = (byParent.get(node.id) || []).length;
    node.children = (byParent.get(node.id) || []).sort((a, b) => {
      const aDate = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const bDate = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return aDate - bDate;
    });
    node.createdAt = node.createdAt instanceof Date ? node.createdAt.toISOString() : node.createdAt;
    if (node.lastPlanRenewalAt) {
      node.lastPlanRenewalAt = node.lastPlanRenewalAt instanceof Date
        ? node.lastPlanRenewalAt.toISOString()
        : node.lastPlanRenewalAt;
    }
  });

  const root = byId.get(targetId);
  if (root) {
    root.children = root.children.sort((a, b) => {
      const levelDiff = a.level - b.level;
      if (levelDiff !== 0) return levelDiff;
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      const aName = a.username ? String(a.username) : '';
      const bName = b.username ? String(b.username) : '';
      return aName.localeCompare(bName);
    });
  }

  return root || null;
}

export async function getReferralTree(req, res, next) {
  try {
    const depth = parseDepth(req.query.depth);
    const targetUserId = req.query.userId ? String(req.query.userId) : null;

    const { target } = await resolveTargetUser(req.user.id, targetUserId);
    const { nodes, hasMore } = await loadHierarchy(target, depth);
    const tree = buildTree(target.id, nodes);

    res.json({
      ok: true,
      tree,
      pagination: {
        depth,
        hasMore
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function listDownlineMembers(req, res, next) {
  try {
    const depth = parseDepth(req.query.depth);
    const targetUserId = req.query.userId ? String(req.query.userId) : null;
    const mode = String(req.query.mode || 'all').toLowerCase();

    const { target } = await resolveTargetUser(req.user.id, targetUserId);
    const { nodes, hasMore } = await loadHierarchy(target, depth);

    const members = nodes
      .filter((node) => node.id !== target.id)
      .map((node) => ({
        id: node.id,
        sponsorId: node.sponsorId,
        parentId: node.parentId,
        level: node.relativeLevel,
        matrixLevel: node.matrixLevel,
        username: node.username,
        email: node.email,
        phone: node.phone,
        qualificationLevel: node.qualificationLevel,
        activityStatus: node.activityStatus,
        isActive: node.isActive,
        createdAt: node.createdAt instanceof Date ? node.createdAt.toISOString() : node.createdAt,
        lastPlanRenewalAt: node.lastPlanRenewalAt instanceof Date
          ? node.lastPlanRenewalAt.toISOString()
          : node.lastPlanRenewalAt
      }));

    const filtered = mode === 'direct'
      ? members.filter((member) => member.level === 1)
      : members;

    filtered.sort((a, b) => a.level - b.level || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json({
      ok: true,
      members: filtered,
      pagination: {
        depth,
        hasMore,
        mode
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getCommissionReport(req, res, next) {
  try {
    const userId = req.user.id;
    const levelFilter = req.query.level ? Number(req.query.level) : null;
    const take = Math.min(Math.max(Number(req.query.limit) || 100, 10), 500);

    const where = { userId };
    if (Number.isInteger(levelFilter) && levelFilter > 0 && levelFilter <= MAX_DEPTH) {
      where.level = levelFilter;
    }

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (!Number.isNaN(from?.getTime()) || !Number.isNaN(to?.getTime())) {
      where.createdAt = {};
      if (from && !Number.isNaN(from.getTime())) {
        where.createdAt.gte = from;
      }
      if (to && !Number.isNaN(to.getTime())) {
        where.createdAt.lte = to;
      }
    }

    const history = await prisma.commissionHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take
    });

    const summaryMap = new Map();
    const items = history.map((entry) => {
      const amount = Number(entry.amount);
      const level = entry.level;
      const key = String(level);
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          level,
          paidTotal: 0,
          skippedTotal: 0,
          paidCount: 0,
          skippedCount: 0
        });
      }
      const summary = summaryMap.get(key);
      if (entry.status === 'PAID') {
        summary.paidTotal += amount;
        summary.paidCount += 1;
      } else {
        summary.skippedTotal += amount;
        summary.skippedCount += 1;
      }

      return {
        id: entry.id,
        sourceUserId: entry.sourceUserId,
        level,
        amount,
        currency: entry.currency,
        status: entry.status,
        reason: entry.reason,
        eventRef: entry.eventRef,
        walletTransactionId: entry.walletTransactionId,
        createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt
      };
    });

    const summary = Array.from(summaryMap.values()).sort((a, b) => a.level - b.level);

    res.json({
      ok: true,
      summary,
      items,
      pagination: {
        limit: take,
        level: levelFilter || null,
        from: from && !Number.isNaN(from.getTime()) ? from.toISOString() : null,
        to: to && !Number.isNaN(to.getTime()) ? to.toISOString() : null
      }
    });
  } catch (err) {
    next(err);
  }
}
