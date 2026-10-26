export type PublicRegistrationRole = 'user' | 'organizer' | 'admin' | 'it' | 'invalid';

/** Mengklasifikasikan role agar endpoint publik dapat menolak role dengan hak istimewa. */
export const resolvePublicRegistrationRole = (role: unknown): PublicRegistrationRole => {
    if (role === undefined || role === 'user' || role === 'customer') return 'user';
    if (role === 'organizer') return 'organizer';
    if (role === 'admin') return 'admin';
    if (role === 'it') return 'it';
    return 'invalid';
};
