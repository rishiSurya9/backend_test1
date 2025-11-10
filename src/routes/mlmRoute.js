import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getReferralTree, listDownlineMembers, getCommissionReport } from '../controller/mlmController.js';

const router = Router();

router.get('/tree', requireAuth, getReferralTree);
router.get('/downline', requireAuth, listDownlineMembers);
router.get('/commissions', requireAuth, getCommissionReport);

export default router;
