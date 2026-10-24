import 'express-serve-static-core';

/** Menambahkan identitas pengguna hasil autentikasi ke objek request Express. */
declare module 'express-serve-static-core' {
    interface Request {
        user?: {
            _id: number | string;
            id: number | string;
            name: string;
            email: string;
            role: 'user' | 'customer' | 'organizer' | 'admin' | 'it';
            isVerified?: boolean;
        };
    }
}
