import cors from 'cors';

export const corsMiddleware = cors({
  origin: [
    'https://eventvite.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
});