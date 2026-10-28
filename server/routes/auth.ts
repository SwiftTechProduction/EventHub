/** Mendaftarkan endpoint registrasi, login, dan verifikasi OTP. */
import express from 'express';
import {
    getProfile,
    login,
    register,
    resendVerificationOTP,
    requestPasswordReset,
    resetPassword,
    updateProfile,
    verifyOTP
} from '../controllers/authController';
import { protect } from '../middleware/auth';
const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-verification', resendVerificationOTP);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);

export default router;
