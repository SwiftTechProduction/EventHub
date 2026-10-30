import 'dotenv/config';
import type { Request, Response } from 'express';
import app from './app';
import { initializeDatabase } from './db';
import { expireStaleBookings } from './utils/bookingLifecycle';

const allowedOrigins = new Set([
    'https://eventhub-purwadhika.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    ...(process.env.CLIENT_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
]);

let initialization: Promise<void> | undefined;

const getErrorCode = (error: unknown): string | undefined => {
    if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z0-9_]{1,32}$/.test(error.code)
    ) {
        return error.code;
    }

    return undefined;
};

const initialize = (): Promise<void> => {
    const missingVariables: string[] = [];
    if (!process.env.JWT_SECRET?.trim()) {
        missingVariables.push('JWT_SECRET');
    }
    if (!process.env.DATABASE_URL?.trim() && !process.env.PGHOST?.trim()) {
        missingVariables.push('DATABASE_URL');
    }
    if (missingVariables.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVariables.join(', ')}`);
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
        const errorCode = getErrorCode(error);
        const detail = error instanceof Error ? error.message : 'Unknown startup error';
        console.error('Serverless API initialization failed:', { errorCode });
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            message: detail.startsWith('Missing required environment variables:')
                ? `${detail}. Set them in the Vercel project that deploys the frontend and API, then redeploy.`
                : `Server initialization failed${errorCode ? ` (error code: ${errorCode})` : ''}. Check DATABASE_URL, database access, and JWT_SECRET in the Vercel project that deploys the frontend and API.`,
            ...(errorCode ? { errorCode } : {}),
        }));
        return;
    }

    app(req, res);
};
