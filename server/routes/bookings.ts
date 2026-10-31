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

const setBookingRouteParams = (req: express.Request, bookingId: string, uploadId?: string): void => {
    req.params.id = bookingId;
    if (uploadId) req.params.uploadId = uploadId;
};

router.post('/send-otp', protect, sendBookingOTP);
router.post('/', protect, (req, res) => {
    const action = req.query.proofAction;
    if (action === undefined) return bookEvent(req, res);
    if (typeof action !== 'string') {
        return res.status(400).json({ message: 'Aksi unggah bukti pembayaran tidak valid.' });
    }

    const bookingId = req.query.bookingId;
    if (typeof bookingId !== 'string' || !/^\d+$/.test(bookingId)) {
        return res.status(400).json({ message: 'Nomor transaksi untuk unggah bukti tidak valid.' });
    }
    setBookingRouteParams(req, bookingId);

    if (action === 'start') return startPaymentProofUpload(req, res);
    if (action === 'chunk') return uploadPaymentProofChunk(req, res);
    if (action === 'complete') return completePaymentProofUpload(req, res);
    return res.status(400).json({ message: 'Aksi unggah bukti pembayaran tidak dikenal.' });
});
router.get('/', protect, organizer, (req, res) => {
    if (req.query.proofAction !== 'read') {
        return res.status(400).json({ message: 'Aksi bukti pembayaran tidak dikenal.' });
    }
    const bookingId = req.query.bookingId;
    if (typeof bookingId !== 'string' || !/^\d+$/.test(bookingId)) {
        return res.status(400).json({ message: 'Nomor transaksi untuk melihat bukti tidak valid.' });
    }
    setBookingRouteParams(req, bookingId);
    return getPaymentProofChunk(req, res);
});
router.delete('/', protect, (req, res) => {
    if (req.query.proofAction !== 'cancel') {
        return res.status(400).json({ message: 'Aksi sesi unggah bukti tidak dikenal.' });
    }
    const bookingId = req.query.bookingId;
    const uploadId = req.query.uploadId;
    if (typeof bookingId !== 'string' || !/^\d+$/.test(bookingId) ||
        typeof uploadId !== 'string') {
        return res.status(400).json({ message: 'Data sesi unggah bukti tidak valid.' });
    }
    setBookingRouteParams(req, bookingId, uploadId);
    return cancelPaymentProofUpload(req, res);
});
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
