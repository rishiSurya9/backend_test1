import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { clearDatabase } from '../controller/adminController.js';

const router = Router();

router.post('/clear-db', requireAuth, requireAdmin, clearDatabase);

export default router;
