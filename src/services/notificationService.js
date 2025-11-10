import { prisma } from '../prisma/client.js';

class NotificationQueue {
  constructor() {
    this.queue = [];
    this.active = false;
  }

  enqueue(task) {
    this.queue.push(task);
    this.process();
  }

  async process() {
    if (this.active) return;
    this.active = true;
    while (this.queue.length) {
      const task = this.queue.shift();
      try {
        // Run task sequentially to avoid spamming downstream providers.
        /* eslint-disable no-await-in-loop */
        await task();
        /* eslint-enable no-await-in-loop */
      } catch (err) {
        console.error('[NotificationQueue] task failed', err?.message || err);
      }
    }
    this.active = false;
  }
}

const dispatcher = new NotificationQueue();

function scheduleDelivery(notification, channels = {}) {
  dispatcher.enqueue(async () => {
    const { email, sms } = channels;
    if (email?.enabled && typeof email?.send === 'function') {
      try {
        await email.send(notification);
      } catch (err) {
        console.error('[NotificationQueue] email delivery failed', err?.message || err);
      }
    }
    if (sms?.enabled && typeof sms?.send === 'function') {
      try {
        await sms.send(notification);
      } catch (err) {
        console.error('[NotificationQueue] sms delivery failed', err?.message || err);
      }
    }
    // Placeholder for push notifications or other channels.
  });
}

export async function createNotification({ userId, type, title, message, channels }) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, message }
  });
  if (channels) scheduleDelivery(notification, channels);
  return notification;
}

export async function createNotificationsBulk(items = []) {
  if (!items.length) return { count: 0 };
  const data = items.map(({ userId, type, title, message }) => ({
    userId,
    type,
    title,
    message
  }));
  const result = await prisma.notification.createMany({ data, skipDuplicates: true });
  return { count: result.count };
}

export async function listNotifications(userId, { limit = 20, cursor, unreadOnly = false } = {}) {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const where = { userId };
  if (unreadOnly) where.isRead = false;

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: String(cursor) } : undefined
  });

  const nextCursor = notifications.length === take ? notifications[notifications.length - 1].id : null;
  return { items: notifications, nextCursor };
}

export async function markNotificationsRead(userId, { ids } = {}) {
  const where = { userId };
  if (Array.isArray(ids) && ids.length > 0) {
    where.id = { in: ids.map((id) => String(id)) };
  }
  const result = await prisma.notification.updateMany({
    where,
    data: { isRead: true }
  });
  return { count: result.count };
}

export async function deleteNotification(userId, id) {
  const notification = await prisma.notification.findUnique({ where: { id: String(id) } });
  if (!notification || notification.userId !== userId) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }
  await prisma.notification.delete({ where: { id: notification.id } });
  return { ok: true };
}

export async function broadcastNotification({ title, message, type = 'ADMIN_BROADCAST' }) {
  const users = await prisma.user.findMany({ select: { id: true } });
  if (!users.length) return { count: 0 };
  const items = users.map((user) => ({
    userId: user.id,
    type,
    title,
    message
  }));
  return createNotificationsBulk(items);
}

export { scheduleDelivery };
