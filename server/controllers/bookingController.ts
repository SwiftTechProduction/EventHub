import { randomInt } from 'crypto';
import { pool, withTransaction } from '../db';
import { calculateDiscount, canApplyDiscountToTicket, planPointAllocations } from '../utils/bookingRules';
import { expireStaleBookings } from '../utils/bookingLifecycle';
import { findOverlappingEvents } from '../utils/bookingSchedule';
import { sendBookingCreatedEmail, sendOTPEmail, sendTransactionEmail } from '../utils/email';

const PAYMENT_PROOF_CHUNK_SIZE = 524_288;
const PAYMENT_PROOF_RESPONSE_CHUNK_SIZE = 524_288;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Membuat OTP acak enam digit untuk menjaga proses checkout tetap terverifikasi. */
const generateOTP = (): string => String(randomInt(100000, 1000000));

/** Menyediakan detail transaksi yang dibutuhkan dashboard pelanggan dan organizer. */
const bookingQuery = `
    SELECT b.id AS "_id", b.status, b.payment_status AS "paymentStatus",
           b.amount, b.quantity, b.ticket_type AS "ticketType",
           (NULLIF(b.payment_proof, '') IS NOT NULL) AS "hasPaymentProof",
           b.payment_deadline AS "paymentDeadline",
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
                    SELECT SUM(a.amount) FROM point_allocations a
                    WHERE a.credit_id = p.id AND a.reversed_at IS NULL
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
            Number(booking.rows[0].amount),
            booking.rows[0].status === 'waiting_for_payment'
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

/** Memulai unggah bukti pembayaran dalam potongan kecil agar kompatibel dengan batas serverless. */
export const startPaymentProofUpload = async (req, res) => {
    try {
        const { uploadId, mimeType } = req.body;
        const fileSize = Number(req.body.fileSize);
        const totalChunks = Number(req.body.totalChunks);
        if (!UUID_PATTERN.test(String(uploadId || '')) ||
            !PAYMENT_PROOF_MIME_TYPES.includes(mimeType) ||
            !Number.isInteger(fileSize) || fileSize < 1 || fileSize > 5_000_000 ||
            !Number.isInteger(totalChunks) ||
            totalChunks !== Math.ceil(fileSize / PAYMENT_PROOF_CHUNK_SIZE) ||
            totalChunks > 10) {
            return res.status(400).json({ message: 'File harus JPG, JPEG, PNG, WebP, atau PDF maksimal 5 MB.' });
        }

        await withTransaction(async (client) => {
            const booking = await client.query(
                `SELECT id FROM bookings
                 WHERE id = $1 AND user_id = $2 AND status = 'waiting_for_payment'
                   AND payment_deadline > NOW()
                 FOR UPDATE`,
                [req.params.id, req.user.id]
            );
            if (!booking.rowCount) return false;

            await client.query(
                `DELETE FROM payment_proof_uploads
                 WHERE created_at < NOW() - INTERVAL '24 hours'`
            );
            await client.query(
                `DELETE FROM payment_proof_uploads WHERE booking_id = $1 AND user_id = $2`,
                [req.params.id, req.user.id]
            );
            await client.query(
                `INSERT INTO payment_proof_uploads
                    (upload_id, booking_id, user_id, mime_type, file_size, total_chunks)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [uploadId, req.params.id, req.user.id, mimeType, fileSize, totalChunks]
            );
            return true;
        }).then((active) => {
            if (!active) {
                res.status(400).json({ message: 'Transaksi tidak ditemukan atau waktu unggah bukti sudah habis.' });
                return;
            }
            res.status(201).json({ uploadId, chunkSize: PAYMENT_PROOF_CHUNK_SIZE });
        });
    } catch (error) {
        console.error('Payment proof upload initialization failed:', error);
        res.status(500).json({ message: 'Server gagal memulai unggah bukti pembayaran.' });
    }
};

/** Menyimpan satu bagian Base64 yang ukurannya tetap di bawah batas payload serverless. */
export const uploadPaymentProofChunk = async (req, res) => {
    try {
        const { uploadId, content } = req.body;
        const chunkIndex = Number(req.body.chunkIndex);
        if (!UUID_PATTERN.test(String(uploadId || '')) ||
            !Number.isInteger(chunkIndex) ||
            typeof content !== 'string' ||
            content.length === 0 ||
            content.length > Math.ceil(PAYMENT_PROOF_CHUNK_SIZE / 3) * 4 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
            return res.status(400).json({ message: 'Bagian file tidak valid. Silakan pilih ulang bukti pembayaran.' });
        }

        const upload = await pool.query(
            `SELECT id, file_size, total_chunks
             FROM payment_proof_uploads
             WHERE upload_id = $1 AND booking_id = $2 AND user_id = $3
               AND created_at >= NOW() - INTERVAL '24 hours'`,
            [uploadId, req.params.id, req.user.id]
        );
        if (!upload.rowCount || chunkIndex < 0 || chunkIndex >= upload.rows[0].total_chunks) {
            return res.status(404).json({ message: 'Sesi unggah tidak ditemukan atau sudah kedaluwarsa. Pilih file lagi.' });
        }
        const expectedByteLength = Math.min(
            PAYMENT_PROOF_CHUNK_SIZE,
            upload.rows[0].file_size - chunkIndex * PAYMENT_PROOF_CHUNK_SIZE
        );
        const decoded = Buffer.from(content, 'base64');
        if (decoded.length !== expectedByteLength || decoded.toString('base64') !== content) {
            return res.status(400).json({ message: 'Ukuran bagian file tidak sesuai. Silakan ulangi unggah bukti.' });
        }

        await pool.query(
            `INSERT INTO payment_proof_upload_chunks (upload_id, chunk_index, content, byte_length)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (upload_id, chunk_index)
             DO UPDATE SET content = EXCLUDED.content, byte_length = EXCLUDED.byte_length`,
            [uploadId, chunkIndex, content, decoded.length]
        );
        res.json({ received: chunkIndex });
    } catch (error) {
        console.error('Payment proof chunk upload failed:', error);
        res.status(500).json({ message: 'Server gagal menerima bagian bukti pembayaran.' });
    }
};

/** Merangkai bagian file, menyimpan bukti pada transaksi, dan mengakhiri sesi unggah. */
export const completePaymentProofUpload = async (req, res) => {
    try {
        const { uploadId } = req.body;
        if (!UUID_PATTERN.test(String(uploadId || ''))) {
            return res.status(400).json({ message: 'Sesi unggah bukti pembayaran tidak valid.' });
        }

        const result = await withTransaction(async (client) => {
            const booking = await client.query(
                `SELECT id FROM bookings
                 WHERE id = $1 AND user_id = $2 AND status = 'waiting_for_payment'
                   AND payment_deadline > NOW()
                 FOR UPDATE`,
                [req.params.id, req.user.id]
            );
            if (!booking.rowCount) return { error: 'Transaksi tidak ditemukan atau waktu unggah bukti sudah habis.' };

            const upload = await client.query(
                `SELECT mime_type, file_size, total_chunks
                 FROM payment_proof_uploads
                 WHERE upload_id = $1 AND booking_id = $2 AND user_id = $3
                   AND created_at >= NOW() - INTERVAL '24 hours'
                 FOR UPDATE`,
                [uploadId, req.params.id, req.user.id]
            );
            if (!upload.rowCount) return { error: 'Sesi unggah tidak ditemukan atau sudah kedaluwarsa. Pilih file lagi.' };

            const chunks = await client.query(
                `SELECT chunk_index, content, byte_length
                 FROM payment_proof_upload_chunks
                 WHERE upload_id = $1 ORDER BY chunk_index`,
                [uploadId]
            );
            const metadata = upload.rows[0];
            const complete = chunks.rows.length === metadata.total_chunks &&
                chunks.rows.every((chunk, index) => chunk.chunk_index === index) &&
                chunks.rows.reduce((total, chunk) => total + chunk.byte_length, 0) === metadata.file_size;
            if (!complete) return { error: 'Unggah bukti belum lengkap. Silakan coba unggah kembali.' };

            const fileContent = Buffer.concat(chunks.rows.map((chunk) => Buffer.from(chunk.content, 'base64')));
            if (fileContent.length !== metadata.file_size) {
                return { error: 'Ukuran bukti pembayaran tidak sesuai. Silakan unggah ulang.' };
            }
            const paymentProof = `data:${metadata.mime_type};base64,${fileContent.toString('base64')}`;
            await client.query(
                `UPDATE bookings
                 SET payment_proof = $1, status = 'waiting_for_admin_confirmation',
                     organizer_deadline = NOW() + INTERVAL '3 days', updated_at = NOW()
                 WHERE id = $2 AND user_id = $3`,
                [paymentProof, req.params.id, req.user.id]
            );
            await client.query('DELETE FROM payment_proof_uploads WHERE upload_id = $1', [uploadId]);
            return { success: true };
        });

        if (result.error) return res.status(400).json({ message: result.error });
        res.json({ message: 'Bukti pembayaran diterima. Menunggu pemeriksaan organizer.' });
    } catch (error) {
        console.error('Payment proof upload completion failed:', error);
        res.status(500).json({ message: 'Server gagal menyelesaikan unggah bukti pembayaran.' });
    }
};

/** Menghapus sesi unggah yang dibatalkan atau gagal. */
export const cancelPaymentProofUpload = async (req, res) => {
    try {
        if (!UUID_PATTERN.test(String(req.params.uploadId || ''))) {
            return res.status(400).json({ message: 'Sesi unggah bukti pembayaran tidak valid.' });
        }
        await pool.query(
            `DELETE FROM payment_proof_uploads
             WHERE upload_id = $1 AND booking_id = $2 AND user_id = $3`,
            [req.params.uploadId, req.params.id, req.user.id]
        );
        res.status(204).end();
    } catch (error) {
        console.error('Payment proof upload cancellation failed:', error);
        res.status(500).json({ message: 'Server gagal membersihkan sesi unggah bukti.' });
    }
};

/** Mengirim satu bagian bukti agar file besar tidak melampaui batas respons serverless. */
export const getPaymentProofChunk = async (req, res) => {
    try {
        const chunkIndex = Number(req.query.index || 0);
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
            return res.status(400).json({ message: 'Bagian bukti pembayaran tidak valid.' });
        }

        const proofResult = await pool.query(
            `WITH stored_proof AS (
                SELECT b.payment_proof,
                       POSITION(';base64,' IN b.payment_proof) AS separator
                FROM bookings b
                JOIN events e ON e.id = b.event_id
                WHERE b.id = $1 AND b.payment_proof <> ''
                  AND ($2 IN ('admin', 'it') OR e.created_by = $3)
            )
            SELECT SUBSTRING(payment_proof FROM 1 FOR separator + 7) AS prefix,
                   SUBSTRING(payment_proof FROM separator + 8 + $4 * $5 FOR $5) AS content,
                   LENGTH(SUBSTRING(payment_proof FROM separator + 8))::int AS "contentLength"
            FROM stored_proof`,
            [req.params.id, req.user.role, req.user.id, chunkIndex, PAYMENT_PROOF_RESPONSE_CHUNK_SIZE]
        );
        if (!proofResult.rowCount) return res.status(404).json({ message: 'Bukti pembayaran tidak ditemukan.' });

        const { prefix, content, contentLength } = proofResult.rows[0];
        if (!prefix.startsWith('data:') || !prefix.endsWith(';base64,')) {
            return res.status(500).json({ message: 'Format bukti pembayaran pada transaksi tidak valid.' });
        }
        const totalChunks = Math.ceil(contentLength / PAYMENT_PROOF_RESPONSE_CHUNK_SIZE);
        if (chunkIndex >= totalChunks) return res.status(404).json({ message: 'Bagian bukti pembayaran tidak ditemukan.' });

        res.json({
            prefix,
            content,
            chunkIndex,
            totalChunks
        });
    } catch (error) {
        console.error('Payment proof chunk lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat bagian bukti pembayaran.' });
    }
};

/** Menyimpan bukti transfer dari klien lama lalu memulai batas waktu organizer. */
export const uploadPaymentProof = async (req, res) => {
    try {
        const proof = String(req.body.paymentProof || '');
        if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(proof)) {
            return res.status(400).json({ message: 'Pilih bukti berupa gambar PNG/JPG/WebP atau PDF.' });
        }
        if (proof.length > 7_000_000) {
            return res.status(413).json({ message: 'Bukti pembayaran maksimal 5 MB.' });
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
    await client.query(
        'UPDATE point_allocations SET reversed_at = NOW() WHERE booking_id = $1 AND reversed_at IS NULL',
        [booking.id]
    );
    if (booking.coupon_id) await client.query('UPDATE coupons SET used_at = NULL WHERE id = $1', [booking.coupon_id]);
    if (booking.voucher_id) {
        await client.query(
            'UPDATE event_vouchers SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1',
            [booking.voucher_id]
        );
    }
};
