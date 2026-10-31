import cors from 'cors';

const allowedOrigins = new Set([
  'https://eventhub-purwadhika.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
]);

export const corsMiddleware = cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
});