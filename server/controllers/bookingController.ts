import { randomInt } from 'crypto';
import { pool, withTransaction } from '../db';
import { calculateDiscount, canApplyDiscountToTicket, planPointAllocations } from '../utils/bookingRules';
import { expireStaleBookings } from '../utils/bookingLifecycle';
import { findOverlappingEvents } from '../utils/bookingSchedule';
import { sendBookingCreatedEmail, sendOTPEmail, sendTransactionEmail } from '../utils/email';

/** Membuat OTP acak enam digit untuk menjaga proses checkout tetap terverifikasi. */
const generateOTP = (): string => String(randomInt(100000, 1000000));

/** Menyediakan detail transaksi yang dibutuhkan dashboard pelanggan dan organizer. */
const bookingQuery = `
    SELECT b.id AS "_id", b.status, b.payment_status AS "paymentStatus",
           b.amount, b.quantity, b.ticket_type AS "ticketType",
           b.payment_proof AS "paymentProof", b.payment_deadline AS "paymentDeadline",
           b.organizer_deadline AS "organizerDeadline", b.points_used AS "pointsUsed",
           b.discount_amount AS "discountAmount", b.booked_at AS "bookedAt",
           b.created_at AS "createdAt", b.updated_at AS "updatedAt",
           CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object(
               '_id', e.id, 'title', e.title, 'description', e.description, 'date', e.date,
               'endDate', e.end_date, 'location', e.location, 'category', e.category,
               'totalSeats', e.total_seats, 'availableSeats', e.available_seats,
               'image', e.image, 'ticketPrice', e.ticket_price, 'isDeleted', e.is_deleted
           ) END AS "eventId",
           CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
               '_id', u.id, 'name', u.name, 'email', u.email
           ) END AS "userId"
    FROM bookings b
    LEFT JOIN events e ON e.id = b.event_id
    LEFT JOIN users u ON u.id = b.user_id
`;

/** Mengirim OTP booking lewat SMTP atau mengembalikan kode lokal saat development. */
export const sendBookingOTP = async (req, res) => {
    try {
        const otp = generateOTP();
        await pool.query(
            `INSERT INTO otps (email, otp, action, expires_at)
             VALUES ($1, $2, 'event_booking', NOW() + INTERVAL '5 minutes')
             ON CONFLICT (email, action)
             DO UPDATE SET otp = EXCLUDED.otp, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
            [req.user.email, otp]
        );
        const emailSent = await sendOTPEmail(req.user.email, otp, 'event_booking');
        res.json({
            message: emailSent ? 'Kode OTP sudah dikirim ke email.' : 'Gunakan kode OTP lokal yang ditampilkan di halaman.',
            ...(!emailSent && process.env.NODE_ENV !== 'production' ? { developmentOtp: otp } : {})
        });
    } catch (error) {
        console.error('Booking OTP failed:', error);
        res.status(500).json({ message: error.message || 'Server gagal mengirim OTP.' });
    }
};

/** Membuat transaksi, memesan kursi, dan memakai diskon/poin secara atomik. */
export const bookEvent = async (req, res) => {
    try {
        await expireStaleBookings();
        const { eventId, otp } = req.body;
        const quantity = Number(req.body.quantity || 1);
        const pointsToUse = Number(req.body.pointsToUse || 0);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
            return res.status(400).json({ message: 'Jumlah tiket harus antara 1 dan 10.' });
        }
        if (!Number.isInteger(pointsToUse) || pointsToUse < 0) {
            return res.status(400).json({ message: 'Jumlah poin yang digunakan tidak valid.' });
        }

        const result = await withTransaction(async (client) => {
            const validOTP = await client.query(
                `SELECT id FROM otps
                 WHERE email = $1 AND otp = $2 AND action = 'event_booking' AND expires_at > NOW()
                 FOR UPDATE`,
                [req.user.email, otp]
            );
            if (!validOTP.rowCount) return { error: 'Kode OTP salah atau sudah expired.', status: 400 };

            const eventResult = await client.query(
                `SELECT id, title, date, end_date, ticket_price, ticket_types, available_seats
                FROM events WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
                [eventId]
            );
            if (!eventResult.rowCount) return { error: 'Event tidak ditemukan.', status: 404 };
            const event = eventResult.rows[0];
            if (new Date(event.end_date || event.date) < new Date()) {
                return { error: 'Pemesanan untuk event yang sudah lewat tidak tersedia.', status: 400 };
            }
            if (event.available_seats < quantity) return { error: 'Kursi yang tersedia tidak mencukupi.', status: 400 };

            const existing = await client.query(
                `SELECT id FROM bookings
                 WHERE user_id = $1 AND event_id = $2
                   AND status NOT IN ('canceled', 'rejected', 'expired')`,
                [req.user.id, eventId]
            );
            if (existing.rowCount) return { error: 'Anda sudah memiliki transaksi aktif untuk event ini.', status: 409 };

            if (req.body.allowScheduleConflict !== true) {
                const activeBookings = await client.query(
                    `SELECT e.id AS "_id", e.title, e.date, e.end_date AS "endDate"
                     FROM bookings b
                     JOIN events e ON e.id = b.event_id
                     WHERE b.user_id = $1 AND b.event_id <> $2
                       AND b.status NOT IN ('canceled', 'rejected', 'expired')`,
                    [req.user.id, eventId]
                );
                const conflicts = findOverlappingEvents(event, activeBookings.rows);
                if (conflicts.length) {
                    return {
                        error: 'Jadwal event ini bertabrakan dengan tiket yang sudah Anda pesan.',
                        status: 409,
                        code: 'EVENT_SCHEDULE_CONFLICT',
                        conflicts
                    };
                }
            }

            const ticketTypes = Array.isArray(event.ticket_types) ? event.ticket_types : [];
            const selectedType = ticketTypes.find((ticket) => ticket.name === req.body.ticketType);
            if (ticketTypes.length && !selectedType) return { error: 'Tipe tiket tidak ditemukan.', status: 400 };
            const ticketType = selectedType?.name || 'General Admission';
            const unitPrice = Number(selectedType?.price ?? event.ticket_price);
            if (selectedType?.capacity > 0) {
                const sold = await client.query(
                    `SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM bookings
                     WHERE event_id = $1 AND ticket_type = $2
                       AND status NOT IN ('canceled', 'rejected', 'expired')`,
                    [eventId, ticketType]
                );
                if (sold.rows[0].quantity + quantity > selectedType.capacity) {
                    return { error: 'Kapasitas untuk tipe tiket ini sudah habis.', status: 400 };
                }
            }

            const subtotal = unitPrice * quantity;
            const hasDiscountInput = Boolean(
                String(req.body.couponCode || '').trim() ||
                String(req.body.voucherCode || '').trim() ||
                pointsToUse > 0
            );
            if (hasDiscountInput && !canApplyDiscountToTicket(Number(event.ticket_price), unitPrice)) {
                return { error: 'Tiket gratis tidak dapat menggunakan diskon atau poin.', status: 400 };
            }

            let discountAmount = 0;
            let couponId: number | null = null;
            let voucherId: number | null = null;
            if (req.body.couponCode) {
                const coupon = await client.query(
                    `SELECT id, discount_type, discount_value
                     FROM coupons WHERE user_id = $1 AND code = $2 AND used_at IS NULL
                       AND starts_at <= NOW() AND expires_at > NOW()
                     FOR UPDATE`,
                    [req.user.id, String(req.body.couponCode).trim().toUpperCase()]
                );
                if (!coupon.rowCount) return { error: 'Kupon tidak valid, sudah dipakai, atau expired.', status: 400 };
                couponId = coupon.rows[0].id;
                const value = calculateDiscount(
                    subtotal - discountAmount,
                    coupon.rows[0].discount_type,
                    Number(coupon.rows[0].discount_value)
                );
                discountAmount += value;
            }
            if (req.body.voucherCode) {
                const voucher = await client.query(
                    `SELECT id, discount_type, discount_value FROM event_vouchers
                     WHERE event_id = $1 AND code = $2 AND starts_at <= NOW() AND ends_at > NOW()
                       AND used_count < max_uses FOR UPDATE`,
                    [eventId, String(req.body.voucherCode).trim().toUpperCase()]
                );
                if (!voucher.rowCount) return { error: 'Voucher event tidak valid atau kuotanya habis.', status: 400 };
                voucherId = voucher.rows[0].id;
                discountAmount += calculateDiscount(
                    subtotal - discountAmount,
                    voucher.rows[0].discount_type,
                    Number(voucher.rows[0].discount_value)
                );
            }

            const availablePoints = await client.query(
                `SELECT p.id, p.amount - COALESCE((
                    SELECT SUM(a.amount) FROM point_allocations a WHERE a.credit_id = p.id
                 ), 0)::int AS remaining
                 FROM point_transactions p
                 WHERE p.user_id = $1 AND p.expires_at > NOW()
                 ORDER BY p.expires_at, p.id FOR UPDATE`,
                [req.user.id]
            );
            const pointBalance = availablePoints.rows.reduce((sum, credit) => sum + Math.max(0, credit.remaining), 0);
            const beforePoints = Math.max(0, subtotal - discountAmount);
            if (pointsToUse > pointBalance || pointsToUse > beforePoints) {
                return { error: 'Poin melebihi saldo aktif atau jumlah yang harus dibayar.', status: 400 };
            }
            const pointAllocations = planPointAllocations(availablePoints.rows, pointsToUse);

            const amount = Math.max(0, subtotal - discountAmount - pointsToUse);
            const status = amount > 0 ? 'waiting_for_payment' : 'waiting_for_admin_confirmation';
            const created = await client.query(
                `INSERT INTO bookings
                    (user_id, event_id, status, payment_status, amount, quantity, ticket_type,
                     seat_reserved, payment_deadline, organizer_deadline, coupon_id, voucher_id, points_used, discount_amount)
                 VALUES ($1, $2, $3, $4, $5, $6, $7,
                         TRUE,
                         CASE WHEN $3 = 'waiting_for_payment' THEN NOW() + INTERVAL '2 hours' ELSE NULL END,
                         CASE WHEN $3 = 'waiting_for_admin_confirmation' THEN NOW() + INTERVAL '3 days' ELSE NULL END,
                         $8, $9, $10, $11)
                 RETURNING id`,
                [
                    req.user.id, eventId, status, amount === 0 ? 'paid' : 'not_paid',
                    amount, quantity, ticketType, couponId, voucherId, pointsToUse, discountAmount
                ]
            );
            const bookingId = created.rows[0].id;

            for (const allocation of pointAllocations) {
                await client.query(
                    'INSERT INTO point_allocations (credit_id, booking_id, amount) VALUES ($1, $2, $3)',
                    [allocation.creditId, bookingId, allocation.amount]
                );
            }
            if (couponId) await client.query('UPDATE coupons SET used_at = NOW() WHERE id = $1', [couponId]);
            if (voucherId) {
                await client.query('UPDATE event_vouchers SET used_count = used_count + 1 WHERE id = $1', [voucherId]);
            }
            await client.query(
                'UPDATE events SET available_seats = available_seats - $1, updated_at = NOW() WHERE id = $2',
                [quantity, eventId]
            );
            await client.query('DELETE FROM otps WHERE id = $1', [validOTP.rows[0].id]);
            return { id: bookingId, status, paymentDeadline: amount > 0 };
        });

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
                ...(result.code ? { code: result.code } : {}),
                ...(result.conflicts ? { conflicts: result.conflicts } : {})
            });
        }
        const booking = await pool.query(`${bookingQuery} WHERE b.id = $1`, [result.id]);
        const emailSent = await sendBookingCreatedEmail(
            booking.rows[0].userId.email,
            booking.rows[0].userId.name,
            booking.rows[0].eventId.title,
            result.id,
            Number(booking.rows[0].amount)
        );
        res.status(201).json({
            message: result.paymentDeadline
                ? 'Transaksi dibuat. Unggah bukti pembayaran dalam 2 jam.'
                : 'Pendaftaran gratis berhasil dikirim ke organizer untuk konfirmasi.',
            booking: booking.rows[0],
            emailSent
        });
    } catch (error) {
        console.error('Booking transaction failed:', error);
        res.status(500).json({ message: 'Server gagal membuat transaksi.' });
    }
};

/** Menyimpan bukti transfer lalu memulai batas waktu tiga hari bagi organizer. */
export const uploadPaymentProof = async (req, res) => {
    try {
        const proof = String(req.body.paymentProof || '');
        if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(proof)) {
            return res.status(400).json({ message: 'Pilih bukti berupa gambar PNG/JPG/WebP atau PDF.' });
        }
        if (proof.length > 7_000_000) {
            return res.status(413).json({ message: 'Ukuran bukti pembayaran maksimal 5 MB.' });
        }

        const updated = await pool.query(
            `UPDATE bookings
             SET payment_proof = $1, status = 'waiting_for_admin_confirmation',
                 organizer_deadline = NOW() + INTERVAL '3 days', updated_at = NOW()
             WHERE id = $2 AND user_id = $3 AND status = 'waiting_for_payment'
               AND payment_deadline > NOW()
             RETURNING id`,
            [proof, req.params.id, req.user.id]
        );
        if (!updated.rowCount) {
            return res.status(400).json({ message: 'Transaksi tidak ditemukan atau waktu unggah bukti sudah habis.' });
        }
        res.json({ message: 'Bukti pembayaran diterima. Menunggu pemeriksaan organizer.' });
    } catch (error) {
        console.error('Payment proof upload failed:', error);
        res.status(500).json({ message: 'Server gagal menyimpan bukti pembayaran.' });
    }
};

/** Menerima atau menolak transaksi dan membebaskan kursi/hak jika ditolak. */
export const reviewBooking = async (req, res) => {
    try {
        await expireStaleBookings();
        const decision = req.body.decision;
        if (!['accepted', 'rejected'].includes(decision)) {
            return res.status(400).json({ message: 'Pilih keputusan diterima atau ditolak.' });
        }
        const result = await withTransaction(async (client) => {
            const found = await client.query(
                `SELECT b.id, b.user_id, b.event_id, b.status, b.payment_proof, b.amount, b.quantity,
                        b.coupon_id, b.voucher_id, b.seat_reserved, e.created_by, e.title
                 FROM bookings b JOIN events e ON e.id = b.event_id
                 WHERE b.id = $1 FOR UPDATE OF b`,
                [req.params.id]
            );
            if (!found.rowCount) return { error: 'Transaksi tidak ditemukan.', status: 404 };
            const booking = found.rows[0];
            if (req.user.role !== 'admin' && String(booking.created_by) !== String(req.user.id)) {
                return { error: 'Transaksi ini bukan milik event yang Anda kelola.', status: 403 };
            }
            if (booking.status !== 'waiting_for_admin_confirmation') {
                return { error: 'Transaksi belum siap ditinjau atau sudah diproses.', status: 400 };
            }
            if (decision === 'accepted' && Number(booking.amount) > 0 && !booking.payment_proof) {
                return { error: 'Pelanggan belum mengunggah bukti pembayaran.', status: 400 };
            }

            if (decision === 'accepted') {
                await client.query(
                    `UPDATE bookings SET status = 'done', payment_status = 'paid', updated_at = NOW()
                     WHERE id = $1`,
                    [booking.id]
                );
            } else {
                await client.query(
                    `UPDATE bookings SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
                    [booking.id]
                );
                await releaseBookingResources(client, booking);
            }
            return { userId: booking.user_id, title: booking.title };
        });

        if (result.error) return res.status(result.status).json({ message: result.error });
        const customer = await pool.query('SELECT email, name FROM users WHERE id = $1', [result.userId]);
        const emailSent = await sendTransactionEmail(
            customer.rows[0].email,
            customer.rows[0].name,
            result.title,
            decision
        );
        res.json({
            message: decision === 'accepted' ? 'Transaksi berhasil diterima.' : 'Transaksi ditolak dan hak pelanggan dikembalikan.',
            emailSent
        });
    } catch (error) {
        console.error('Booking review failed:', error);
        res.status(500).json({ message: 'Server gagal memproses keputusan transaksi.' });
    }
};

/** Mengambil transaksi sendiri atau transaksi dari event organizer yang login. */
export const getMyBookings = async (req, res) => {
    try {
        await expireStaleBookings();
        let filter = 'WHERE b.user_id = $1';
        const values: unknown[] = [req.user.id];
        if (req.user.role === 'it') {
            filter = '';
            values.length = 0;
        } else if (['admin', 'organizer'].includes(req.user.role)) {
            filter = 'WHERE e.created_by = $1';
        }
        const bookings = await pool.query(
            `${bookingQuery} ${filter} ORDER BY b.created_at DESC`,
            values
        );
        res.json(bookings.rows);
    } catch (error) {
        console.error('Booking list lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat transaksi.' });
    }
};

/** Mengakhiri transaksi dan mengembalikan kursi, poin, kupon, serta voucher. */
export const cancelBooking = async (req, res) => {
    try {
        const result = await withTransaction(async (client) => {
            const found = await client.query(
                `SELECT                 b.id, b.user_id, b.event_id, b.status, b.quantity, b.seat_reserved, b.coupon_id, b.voucher_id,
                        e.created_by, e.date
                 FROM bookings b LEFT JOIN events e ON e.id = b.event_id
                 WHERE b.id = $1 FOR UPDATE OF b`,
                [req.params.id]
            );
            if (!found.rowCount) return { error: 'Transaksi tidak ditemukan.', status: 404 };
            const booking = found.rows[0];
            const isOwner = String(booking.user_id) === String(req.user.id);
            const managesEvent = ['admin', 'it'].includes(req.user.role) || String(booking.created_by) === String(req.user.id);
            if (!isOwner && !managesEvent) return { error: 'Anda tidak berhak mengubah transaksi ini.', status: 403 };
            if (['canceled', 'rejected', 'expired'].includes(booking.status)) {
                return { error: 'Transaksi ini sudah berakhir.', status: 400 };
            }
            if (booking.status === 'done' && new Date(booking.date) <= new Date()) {
                return { error: 'Transaksi tidak dapat dibatalkan setelah event dimulai.', status: 400 };
            }

            await client.query(
                `UPDATE bookings SET status = 'canceled', updated_at = NOW() WHERE id = $1`,
                [booking.id]
            );
            await releaseBookingResources(client, booking);
            return { id: booking.id };
        });
        if (result.error) return res.status(result.status).json({ message: result.error });
        res.json({ message: 'Transaksi dibatalkan; kursi, poin, dan diskon yang digunakan sudah dikembalikan.' });
    } catch (error) {
        console.error('Booking cancellation failed:', error);
        res.status(500).json({ message: 'Server gagal membatalkan transaksi.' });
    }
};

/** Mengembalikan kuota tiket dan semua poin/diskon yang terkait satu booking. */
const releaseBookingResources = async (client, booking) => {
    if (booking.event_id && booking.seat_reserved) {
        await client.query(
            `UPDATE events
             SET available_seats = LEAST(total_seats, available_seats + $1), updated_at = NOW()
             WHERE id = $2`,
            [booking.quantity, booking.event_id]
        );
    }
    await client.query('DELETE FROM point_allocations WHERE booking_id = $1', [booking.id]);
    if (booking.coupon_id) await client.query('UPDATE coupons SET used_at = NULL WHERE id = $1', [booking.coupon_id]);
    if (booking.voucher_id) {
        await client.query(
            'UPDATE event_vouchers SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1',
            [booking.voucher_id]
        );
    }
};
