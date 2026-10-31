/** Menghubungkan endpoint booking dengan autentikasi dan hak akses admin. */
import express from 'express';
const router = express.Router();
import {
    bookEvent,
    cancelPaymentProofUpload,
    cancelBooking,
    completePaymentProofUpload,
    getPaymentProofChunk,
    getMyBookings,
    reviewBooking,
    sendBookingOTP,
    uploadPaymentProof,
    startPaymentProofUpload,
    uploadPaymentProofChunk
} from '../controllers/bookingController';
import { organizer, protect } from '../middleware/auth';

router.post('/send-otp', protect, sendBookingOTP);
router.post('/', protect, bookEvent);
router.post('/:id/payment-proof/start', protect, startPaymentProofUpload);
router.post('/:id/payment-proof/chunk', protect, uploadPaymentProofChunk);
router.post('/:id/payment-proof/complete', protect, completePaymentProofUpload);
router.delete('/:id/payment-proof/upload/:uploadId', protect, cancelPaymentProofUpload);
router.get('/:id/payment-proof/chunk', protect, organizer, getPaymentProofChunk);
router.post('/:id/payment-proof', protect, uploadPaymentProof);
router.put('/:id/review', protect, organizer, reviewBooking);
router.get('/my', protect, getMyBookings);
router.delete('/:id', protect, cancelBooking);

export default router;
