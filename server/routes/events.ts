/** Menghubungkan endpoint event publik dan operasi khusus admin. */
import express from 'express';
const router = express.Router();
import {
    createEvent,
    createEventReview,
    createVoucher,
    deleteEvent,
    getEventAttendees,
    getEventById,
    getEventReviews,
    getEventVouchers,
    getEvents,
    getManagedEvents,
    getOrganizerProfile,
    getOrganizerStats,
    updateEvent
} from '../controllers/eventController';
import { organizer, protect } from '../middleware/auth';

router.get('/', getEvents);
router.get('/organizer/stats', protect, organizer, getOrganizerStats);
router.get('/organizer/mine', protect, organizer, getManagedEvents);
router.get('/organizers/:id', getOrganizerProfile);
router.get('/:id', getEventById);
router.get('/:id/reviews', getEventReviews);
router.post('/:id/reviews', protect, createEventReview);
router.get('/:id/attendees', protect, organizer, getEventAttendees);
router.get('/:id/vouchers', protect, organizer, getEventVouchers);
router.post('/:id/vouchers', protect, organizer, createVoucher);
router.post('/', protect, organizer, createEvent);
router.put('/:id', protect, organizer, updateEvent);
router.delete('/:id', protect, organizer, deleteEvent);

export default router;
