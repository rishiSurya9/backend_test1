import { verifyToken } from '../utils/jwt.js';
import { prisma } from '../prisma/client.js';
import { env } from '../config/env.js';

export async function requireAuth(req, res, next) {
  try {
    let token = req.cookies && req.cookies.access_token;
    if (!token) {
      const header = req.headers['authorization'] || '';
      [, token] = header.split(' ');
    }
    if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}

export function requireAdmin(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const ids = String(env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const emails = String(env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const isAdmin = (ids.length && ids.includes(req.user.id)) || (emails.length && req.user.email && emails.includes(String(req.user.email).toLowerCase()));
    if (!isAdmin) return res.status(403).json({ ok: false, error: 'Forbidden' });
    return next();
  } catch (_) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
}
