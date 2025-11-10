import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getWallet, transferReferralToMain, listTransactions } from '../controller/walletController.js';

const router = Router();

router.get('/', requireAuth, getWallet);
router.post('/transfer', requireAuth, transferReferralToMain); // Referral -> Main
router.get('/transactions', requireAuth, listTransactions);

export default router;
