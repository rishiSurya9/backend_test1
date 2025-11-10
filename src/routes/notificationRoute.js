import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getNotifications, markNotificationsAsRead, deleteNotification } from '../controller/notificationController.js';

const router = Router();

router.get('/', requireAuth, getNotifications);
router.post('/read', requireAuth, markNotificationsAsRead);
router.delete('/:id', requireAuth, deleteNotification);

export default router;
