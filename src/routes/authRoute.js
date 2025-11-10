import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  signup,
  requestOtp,
  verifyOtp,
  verifyPhoneOtp,
  setTransactionPin,
  login,
  loginRequestOtp,
  forgotPasswordRequestOtp,
  resetPassword,
  forgotPinRequestOtp,
  resetPin,
  logout
} from '../controller/authController.js';

const router = Router();

// Signup flow
router.post('/signup', signup);
router.post('/verify-phone-otp', verifyPhoneOtp);
router.post('/set-pin', requireAuth, setTransactionPin);

// Generic OTP (optional)
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);

// Login
router.post('/login', login);
router.post('/login/request-otp', loginRequestOtp);
router.post('/logout', logout);

// Forgot password
router.post('/forgot-password/request-otp', forgotPasswordRequestOtp);
router.post('/forgot-password/reset', resetPassword);

// Forgot PIN
router.post('/forgot-pin/request-otp', forgotPinRequestOtp);
router.post('/forgot-pin/reset', resetPin);

export default router;
