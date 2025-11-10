import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createAddFundsOrder, withdrawFunds, paymentTransactions, approveWithdrawal, rejectWithdrawal, createTokenPurchaseOrder, listTokenPurchases, downloadTokenPurchaseInvoice } from '../controller/paymentController.js';
import { getPlans } from '../controller/planController.js';

const router = Router();

router.post('/add-funds/order', requireAuth, createAddFundsOrder);
router.get('/plans', requireAuth, getPlans);
router.post('/token/purchase', requireAuth, createTokenPurchaseOrder);
router.post('/token/order', requireAuth, createTokenPurchaseOrder); // backward compatibility
router.get('/token/purchases', requireAuth, listTokenPurchases);
router.get('/token/purchases/:id/invoice', requireAuth, downloadTokenPurchaseInvoice);
router.post('/withdraw', requireAuth, withdrawFunds);
router.get('/transactions', requireAuth, paymentTransactions);
router.post('/withdrawals/:id/approve', requireAuth, requireAdmin, approveWithdrawal);
router.post('/withdrawals/:id/reject', requireAuth, requireAdmin, rejectWithdrawal);

export default router;
