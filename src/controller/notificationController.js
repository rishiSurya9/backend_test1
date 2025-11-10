import { listNotifications, markNotificationsRead, deleteNotification as deleteNotificationService, broadcastNotification as broadcastNotificationService } from '../services/notificationService.js';

export async function getNotifications(req, res, next) {
  try {
    const { limit, cursor, unread } = req.query || {};
    const { items, nextCursor } = await listNotifications(req.user.id, {
      limit,
      cursor,
      unreadOnly: unread === 'true'
    });
    res.json({ ok: true, items, nextCursor });
  } catch (err) { next(err); }
}

export async function markNotificationsAsRead(req, res, next) {
  try {
    const { ids } = req.body || {};
    const result = await markNotificationsRead(req.user.id, { ids });
    res.json({ ok: true, count: result.count });
  } catch (err) { next(err); }
}

export async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    await deleteNotificationService(req.user.id, id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function broadcastNotification(req, res, next) {
  try {
    const { title, message, type } = req.body || {};
    if (!title || !message) {
      const error = new Error('title and message are required');
      error.status = 400;
      throw error;
    }
    const result = await broadcastNotificationService({
      title: String(title),
      message: String(message),
      type: type ? String(type) : 'ADMIN_BROADCAST'
    });
    res.json({ ok: true, count: result.count });
  } catch (err) { next(err); }
}
