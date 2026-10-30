/** Menghubungkan endpoint booking dengan autentikasi dan hak akses admin. */
import express from 'express';
const router = express.Router();
import {
    bookEvent,
    cancelBooking,
    getMyBookings,
    reviewBooking,
    sendBookingOTP,
    uploadPaymentProof
} from '../controllers/bookingController';
import { organizer, protect } from '../middleware/auth';

router.post('/send-otp', protect, sendBookingOTP);
router.post('/', protect, bookEvent);
router.post('/:id/payment-proof', protect, uploadPaymentProof);
router.put('/:id/review', protect, organizer, reviewBooking);
router.get('/my', protect, getMyBookings);
router.delete('/:id', protect, cancelBooking);

export default router;
