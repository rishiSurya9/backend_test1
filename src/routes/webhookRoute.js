import { Router } from 'express';
import { razorpayWebhook, stripeWebhook } from '../controller/webhookController.js';

const router = Router();

// These endpoints expect raw body for signature verification; server config should preserve req.rawBody
router.post('/razorpay', razorpayWebhook);
router.post('/stripe', stripeWebhook);

export default router;

