import express from 'express';
import {
    createManagedUser,
    getAllEvents,
    getManagedUsers,
    restoreEvent,
    softDeleteManagedUser,
    updateManagedUser
} from '../controllers/itController';
import { it, protect } from '../middleware/auth';

const router = express.Router();

router.use(protect, it);
router.get('/users', getManagedUsers);
router.post('/users', createManagedUser);
router.put('/users/:id', updateManagedUser);
router.delete('/users/:id', softDeleteManagedUser);
router.get('/events', getAllEvents);
router.post('/events/:id/restore', restoreEvent);

export default router;
