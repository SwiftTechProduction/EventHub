/** Tipe data akun yang disimpan di browser setelah login. */
export interface User {
    _id: number | string;
    name: string;
    email: string;
    role: 'user' | 'customer' | 'organizer' | 'admin' | 'it';
    referralCode?: string;
    profileImage?: string;
    token?: string;
}

/** Akun yang dapat dikelola oleh administrator IT. */
export interface ManagedAccount {
    _id: number | string;
    name: string;
    email: string;
    role: 'user' | 'customer' | 'organizer' | 'admin' | 'it';
    isVerified: boolean;
    isDeleted: boolean;
    createdAt: string;
}

/** Bentuk ringkas event yang dikirim API ke aplikasi web. */
export interface EventItem {
    _id: number | string;
    title: string;
    description: string;
    date: string;
    endDate?: string;
    location: string;
    category: string;
    totalSeats: number;
    availableSeats: number;
    image: string;
    ticketPrice: number;
    isDeleted?: boolean;
    ticketTypes?: TicketType[];
    organizer?: { _id: number | string; name: string; profileImage?: string } | null;
}

/** Pilihan tiket dengan harga dan batas kapasitas khusus jika disediakan. */
export interface TicketType {
    name: string;
    price: number;
    capacity: number;
}

/** Informasi pengguna yang ditampilkan pada data pemesanan. */
export interface BookingUser {
    _id: number | string;
    name: string;
    email: string;
}

/** Informasi pemesanan yang dipakai dashboard pengguna dan admin. */
export interface Booking {
    _id: number | string;
    status:
        | 'waiting_for_payment'
        | 'waiting_for_admin_confirmation'
        | 'done'
        | 'rejected'
        | 'expired'
        | 'canceled';
    paymentStatus: 'paid' | 'not_paid';
    amount: number;
    quantity: number;
    ticketType: string;
    paymentProof?: string;
    paymentDeadline?: string | null;
    organizerDeadline?: string | null;
    pointsUsed?: number;
    discountAmount?: number;
    bookedAt: string;
    eventId: EventItem | null;
    userId: BookingUser | null;
}

/** Data input yang digunakan formulir pembuatan dan perubahan event. */
export interface EventForm {
    title: string;
    description: string;
    date: string;
    endDate: string;
    location: string;
    category: string;
    totalSeats: string;
    ticketPrice: string;
    image: string;
    ticketTypes: string;
}

/** Data poin dan kupon yang ditampilkan pada profil pelanggan. */
export interface UserProfile extends User {
    points: number;
    coupons: {
        id: number | string;
        code: string;
        discountType: 'percent' | 'fixed';
        discountValue: number;
        expiresAt: string;
        usedAt: string | null;
    }[];
}

/** Ringkasan penjualan organizer untuk grafik dan laporan berkala. */
export interface OrganizerStat {
    date: string;
    transactions: number;
    tickets: number;
    revenue: number;
}
