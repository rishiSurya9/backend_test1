import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { broadcastNotification } from '../controller/notificationController.js';

const router = Router();

router.post('/broadcast', requireAuth, requireAdmin, broadcastNotification);

export default router;
