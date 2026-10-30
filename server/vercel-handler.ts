import 'dotenv/config';
import type { Request, Response } from 'express';
import app from './app';
import { initializeDatabase } from './db';
import { expireStaleBookings } from './utils/bookingLifecycle';

const allowedOrigins = new Set([
    'https://eventvite.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    ...(process.env.CLIENT_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
]);

let initialization: Promise<void> | undefined;

const initialize = (): Promise<void> => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET must be configured before starting the server');
    }

    if (!initialization) {
        initialization = initializeDatabase()
            .then(async () => {
                await expireStaleBookings();
            })
            .catch((error: unknown) => {
                initialization = undefined;
                throw error;
            });
    }

    return initialization;
};

const setCorsHeaders = (req: Request, res: Response): void => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');

    if (origin && allowedOrigins.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
};

export default async (req: Request, res: Response): Promise<void> => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        res.setHeader('Access-Control-Max-Age', '86400');
        res.statusCode = 204;
        res.end();
        return;
    }

    try {
        await initialize();
    } catch (error) {
        console.error('Serverless API initialization failed:', error);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            message: 'Server initialization failed. Check DATABASE_URL and JWT_SECRET in the backend Vercel project settings.',
        }));
        return;
    }

    app(req, res);
};
