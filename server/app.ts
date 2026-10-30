import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/auth';
import eventRoutes from './routes/events';
import bookingRoutes from './routes/bookings';
import itRoutes from './routes/it';
import { corsMiddleware } from './middleware/cors';

const app = express();
app.use(corsMiddleware);
app.use(express.json({ limit: '9mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/it', itRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

export default app;
