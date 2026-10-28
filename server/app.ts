import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import itRoutes from './routes/it';

const app = express();
app.use(cors());
app.use(express.json({ limit: '9mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/it', itRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

export default app;
