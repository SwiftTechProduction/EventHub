import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { pool } from '../db';

/** Memvalidasi bearer token dan memuat identitas akun ke dalam request. */
export const protect = async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET is not configured');
        const decoded = jwt.verify(authorization.slice(7), secret) as JwtPayload & { id: number | string };
        const user = await pool.query(
            `SELECT id AS "_id", name, email, role, is_verified AS "isVerified"
             FROM users WHERE id = $1 AND is_deleted = FALSE`,
            [decoded.id]
        );
        if (!user.rowCount) return res.status(401).json({ message: 'Not authorized, user not found' });
        req.user = user.rows[0];
        req.user.id = req.user._id;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

/** Membatasi akses endpoint agar hanya dapat digunakan oleh admin. */
export const admin = (req, res, next) => {
    if (req.user && ['admin', 'it'].includes(req.user.role)) return next();
    res.status(403).json({ message: 'Not authorized as an admin' });
};

/** Mengizinkan akses manajemen event kepada organizer dan administrator. */
export const organizer = (req, res, next) => {
    if (req.user && ['organizer', 'admin', 'it'].includes(req.user.role)) return next();
    res.status(403).json({ message: 'Fitur ini hanya tersedia untuk organizer event.' });
};

/** Membatasi CRUD akun dan akses global khusus untuk role IT. */
export const it = (req, res, next) => {
    if (req.user && req.user.role === 'it') return next();
    res.status(403).json({ message: 'Fitur ini hanya tersedia untuk administrator IT.' });
};
