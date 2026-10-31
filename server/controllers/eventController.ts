import { pool, withTransaction } from '../db';
import { canReviewEvent } from '../utils/reviewRules';

/** Mengemas field dan organizer agar seluruh halaman menerima bentuk data yang sama. */
const eventFields = `
    e.id AS "_id", e.title, e.description, e.date, e.end_date AS "endDate",
    e.location, e.category, e.total_seats AS "totalSeats",
    e.available_seats AS "availableSeats", e.image,
    e.ticket_price AS "ticketPrice", e.ticket_types AS "ticketTypes",
    e.created_at AS "createdAt",
    CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
        '_id', u.id, 'name', u.name, 'profileImage', u.profile_image
    ) END AS organizer
`;
const eventQuery = `SELECT ${eventFields} FROM events e LEFT JOIN users u ON u.id = e.created_by`;
const categoryAliases: Record<string, string[]> = {
    musik: ['music', 'musik'],
    teknologi: ['technology', 'teknologi'],
    bisnis: ['business', 'bisnis'],
    seni: ['art', 'seni'],
    olahraga: ['sports', 'olahraga'],
    kuliner: ['food', 'kuliner'],
    pendidikan: ['education', 'pendidikan']
};

/** Memeriksa apakah event milik organizer yang sedang masuk atau admin. */
const canManageEvent = async (eventId: string, user: { id: number | string; role: string }) => {
    const result = await pool.query('SELECT created_by FROM events WHERE id = $1 AND is_deleted = FALSE', [eventId]);
    return result.rowCount > 0 && (['admin', 'it'].includes(user.role) || String(result.rows[0].created_by) === String(user.id));
};

/** Menormalkan tipe tiket dan menolak harga atau kapasitas yang tidak masuk akal. */
const normalizeTicketTypes = (ticketTypes: unknown) => {
    if (ticketTypes === undefined || ticketTypes === null) return [];
    if (!Array.isArray(ticketTypes)) throw new Error('Tipe tiket harus berbentuk daftar.');
    return ticketTypes.map((item) => {
        const name = String(item?.name || '').trim();
        const price = Number(item?.price);
        const capacity = Number(item?.capacity || 0);
        if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(capacity) || capacity < 0) {
            throw new Error('Nama, harga, atau kapasitas tipe tiket tidak valid.');
        }
        return { name, price, capacity };
    });
};

/** Menampilkan event mendatang dengan pencarian serta filter kategori dan lokasi. */
export const getEvents = async (req, res) => {
    try {
        const values: unknown[] = [];
        const filters = ['COALESCE(e.end_date, e.date) >= NOW()', 'e.is_deleted = FALSE'];
        for (const [key, column] of [['category', 'e.category'], ['location', 'e.location']] as const) {
            const value = String(req.query[key] || '').trim();
            if (value) {
                if (key === 'category') {
                    const terms = categoryAliases[value.toLowerCase()] || [value];
                    values.push(terms.map((term) => `%${term}%`));
                    filters.push(`${column} ILIKE ANY($${values.length}::text[])`);
                } else {
                    values.push(`%${value}%`);
                    filters.push(`${column} ILIKE $${values.length}`);
                }
            }
        }
        const search = String(req.query.search || '').trim();
        if (search) {
            values.push(`%${search}%`);
            filters.push(`(e.title ILIKE $${values.length} OR e.description ILIKE $${values.length})`);
        }
        const events = await pool.query(
            `${eventQuery} WHERE ${filters.join(' AND ')} ORDER BY e.date ASC`,
            values
        );
        res.json(events.rows);
    } catch (error) {
        console.error('Event list lookup failed:', error);
        const errorCode = typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : undefined;
        res.status(500).json({
            message: 'Server gagal memuat daftar event.',
            ...(errorCode ? { errorCode } : {})
        });
    }
};

/** Mengambil rincian satu event yang dipilih dari katalog. */
export const getEventById = async (req, res) => {
    try {
        const event = await pool.query(`${eventQuery} WHERE e.id = $1 AND e.is_deleted = FALSE`, [req.params.id]);
        if (!event.rowCount) return res.status(404).json({ message: 'Event tidak ditemukan.' });
        res.json(event.rows[0]);
    } catch (error) {
        console.error('Event detail lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat detail event.' });
    }
};

/** Mengambil seluruh event milik organizer agar event lampau tetap dapat dikelola. */
export const getManagedEvents = async (req, res) => {
    try {
        const events = req.user.role === 'it'
            ? await pool.query(`${eventQuery} WHERE e.is_deleted = FALSE ORDER BY e.date DESC`)
            : await pool.query(`${eventQuery} WHERE e.created_by = $1 AND e.is_deleted = FALSE ORDER BY e.date DESC`, [req.user.id]);
        res.json(events.rows);
    } catch (error) {
        console.error('Managed event lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat event yang dikelola.' });
    }
};

/** Membuat event baru atas nama organizer yang sedang membuat pengumuman. */
export const createEvent = async (req, res) => {
    try {
        const { title, description, date, endDate, location, category, totalSeats, ticketPrice, image, ticketTypes } = req.body;
        const seats = Number(totalSeats);
        const price = Number(ticketPrice || 0);
        const end = endDate || date;
        if (!title?.trim() || !description?.trim() || !date || !end || !location?.trim() || !category?.trim()) {
            return res.status(400).json({ message: 'Lengkapi nama, deskripsi, jadwal, lokasi, dan kategori event.' });
        }
        if (!Number.isInteger(seats) || seats < 0 || !Number.isFinite(price) || price < 0) {
            return res.status(400).json({ message: 'Jumlah tiket dan harga harus berupa angka yang valid.' });
        }
        const normalizedTypes = normalizeTicketTypes(ticketTypes);
        const created = await pool.query(
            `INSERT INTO events
                (title, description, date, end_date, location, category, total_seats,
                 available_seats, ticket_price, image, ticket_types, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
                title.trim(), description.trim(), date, end, location.trim(), category.trim(),
                seats, price, image || '', JSON.stringify(normalizedTypes), req.user.id
            ]
        );
        const event = await pool.query(`${eventQuery} WHERE e.id = $1`, [created.rows[0].id]);
        res.status(201).json(event.rows[0]);
    } catch (error) {
        const invalidInput = /tipe tiket|tidak valid/i.test(error.message);
        if (invalidInput) return res.status(400).json({ message: error.message });
        console.error('Event creation failed:', error);
        res.status(500).json({ message: 'Server gagal membuat event.' });
    }
};

/** Menyimpan perubahan event jika dibuat oleh organizer yang berwenang. */
export const updateEvent = async (req, res) => {
    try {
        if (!await canManageEvent(req.params.id, req.user)) {
            return res.status(404).json({ message: 'Event tidak ditemukan atau bukan milik Anda.' });
        }
        const fields: Record<string, string> = {
            title: 'title',
            description: 'description',
            date: 'date',
            endDate: 'end_date',
            location: 'location',
            category: 'category',
            totalSeats: 'total_seats',
            ticketPrice: 'ticket_price',
            image: 'image',
            ticketTypes: 'ticket_types'
        };
        const changes = { ...req.body };
        if (Object.prototype.hasOwnProperty.call(changes, 'ticketTypes')) {
            changes.ticketTypes = JSON.stringify(normalizeTicketTypes(changes.ticketTypes));
        }
        const values: unknown[] = [];
        const assignments: string[] = [];
        for (const [key, column] of Object.entries(fields)) {
            if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
            if (key === 'totalSeats' || key === 'ticketPrice') {
                const numericValue = Number(changes[key]);
                if (!Number.isFinite(numericValue) || numericValue < 0 || (key === 'totalSeats' && !Number.isInteger(numericValue))) {
                    return res.status(400).json({ message: 'Jumlah tiket atau harga tidak valid.' });
                }
                changes[key] = numericValue;
            }
            values.push(changes[key]);
            assignments.push(key === 'ticketTypes'
                ? `${column} = $${values.length}::jsonb`
                : `${column} = $${values.length}`);
        }
        if (!assignments.length) return res.status(400).json({ message: 'Tidak ada perubahan untuk disimpan.' });

        if (Object.prototype.hasOwnProperty.call(changes, 'totalSeats')) {
            const reserved = await pool.query(
                'SELECT total_seats - available_seats AS seats FROM events WHERE id = $1',
                [req.params.id]
            );
            if (Number(changes.totalSeats) < reserved.rows[0].seats) {
                return res.status(400).json({ message: 'Jumlah tiket tidak boleh kurang dari kursi yang sudah dipesan.' });
            }
            assignments.push(`available_seats = $${values.length + 1} - (total_seats - available_seats)`);
            values.push(changes.totalSeats);
        }
        assignments.push('updated_at = NOW()');
        values.push(req.params.id);
        const updated = await pool.query(
            `UPDATE events SET ${assignments.join(', ')} WHERE id = $${values.length} AND is_deleted = FALSE RETURNING id`,
            values
        );
        if (!updated.rowCount) return res.status(404).json({ message: 'Event tidak ditemukan.' });
        const event = await pool.query(`${eventQuery} WHERE e.id = $1 AND e.is_deleted = FALSE`, [updated.rows[0].id]);
        res.json(event.rows[0]);
    } catch (error) {
        if (/tipe tiket|tidak valid/i.test(error.message)) return res.status(400).json({ message: error.message });
        console.error('Event update failed:', error);
        res.status(500).json({ message: 'Server gagal menyimpan perubahan event.' });
    }
};

/** Menyembunyikan event tanpa menghapus transaksi dan riwayat ulasannya. */
export const deleteEvent = async (req, res) => {
    try {
        if (!await canManageEvent(req.params.id, req.user)) {
            return res.status(404).json({ message: 'Event tidak ditemukan atau bukan milik Anda.' });
        }
        const deleted = await pool.query(
            'UPDATE events SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE RETURNING id',
            [req.params.id]
        );
        if (!deleted.rowCount) return res.status(404).json({ message: 'Event tidak ditemukan.' });
        res.json({ message: 'Event berhasil dihapus.' });
    } catch (error) {
        console.error('Event deletion failed:', error);
        res.status(500).json({ message: 'Server gagal menghapus event.' });
    }
};

/** Membuat voucher khusus event dengan jadwal dan batas penggunaan. */
export const createVoucher = async (req, res) => {
    try {
        const { code, discountType, discountValue, startsAt, endsAt, maxUses } = req.body;
        const discount = Number(discountValue);
        const uses = Number(maxUses || 1);
        if (!await canManageEvent(req.params.id, req.user)) {
            return res.status(404).json({ message: 'Event tidak ditemukan atau bukan milik Anda.' });
        }
        const event = await pool.query(
            'SELECT ticket_price FROM events WHERE id = $1 AND is_deleted = FALSE',
            [req.params.id]
        );
        if (!event.rowCount) return res.status(404).json({ message: 'Event tidak ditemukan atau bukan milik Anda.' });
        if (Number(event.rows[0].ticket_price) <= 0) {
            return res.status(400).json({ message: 'Voucher tidak tersedia untuk event gratis.' });
        }
        if (!code?.trim() || !['percent', 'fixed'].includes(discountType) ||
            !Number.isFinite(discount) || discount <= 0 || !startsAt || !endsAt ||
            new Date(endsAt) <= new Date(startsAt) || !Number.isInteger(uses) || uses < 1 ||
            (discountType === 'percent' && discount > 100)) {
            return res.status(400).json({ message: 'Periksa kode, potongan, jumlah pemakaian, dan masa aktif voucher.' });
        }
        const voucher = await pool.query(
            `INSERT INTO event_vouchers
                (event_id, organizer_id, code, discount_type, discount_value, starts_at, ends_at, max_uses)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, code, discount_type AS "discountType", discount_value AS "discountValue",
                       starts_at AS "startsAt", ends_at AS "endsAt", max_uses AS "maxUses"`,
            [req.params.id, req.user.id, code.trim().toUpperCase(), discountType, discount, startsAt, endsAt, uses]
        );
        res.status(201).json(voucher.rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Kode voucher sudah digunakan.' });
        console.error('Voucher creation failed:', error);
        res.status(500).json({ message: 'Server gagal membuat voucher.' });
    }
};

/** Menampilkan daftar voucher yang dikelola organizer pada event tertentu. */
export const getEventVouchers = async (req, res) => {
    try {
        if (!await canManageEvent(req.params.id, req.user)) {
            return res.status(404).json({ message: 'Event tidak ditemukan atau bukan milik Anda.' });
        }
        const vouchers = await pool.query(
            `SELECT id, code, discount_type AS "discountType", discount_value AS "discountValue",
                    starts_at AS "startsAt", ends_at AS "endsAt", max_uses AS "maxUses",
                    used_count AS "usedCount"
             FROM event_vouchers WHERE event_id = $1 ORDER BY created_at DESC`,
            [req.params.id]
        );
        res.json(vouchers.rows);
    } catch (error) {
        console.error('Voucher lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat voucher.' });
    }
};

/** Menyajikan ringkasan penjualan per tahun, bulan, atau hari untuk organizer. */
export const getOrganizerStats = async (req, res) => {
    try {
        const period = ['year', 'month', 'day'].includes(req.query.period) ? req.query.period : 'month';
        const year = Number(req.query.year || new Date().getFullYear());
        const rows = await pool.query(
            `SELECT date_trunc($1, b.created_at)::date AS date,
                    COUNT(*)::int AS transactions, SUM(b.quantity)::int AS tickets,
                    COALESCE(SUM(b.amount), 0)::numeric AS revenue
             FROM bookings b JOIN events e ON e.id = b.event_id
             WHERE b.status = 'done' AND ($2 = 0 OR EXTRACT(YEAR FROM b.created_at) = $2)
               AND ($3 = 0 OR EXTRACT(MONTH FROM b.created_at) = $3)
               AND ($4 = TRUE OR e.created_by = $5)
             GROUP BY date_trunc($1, b.created_at)::date
             ORDER BY date ASC`,
            [period, year, Number(req.query.month || 0), req.user.role === 'it', req.user.id]
        );
        res.json(rows.rows);
    } catch (error) {
        console.error('Organizer statistics lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat statistik organizer.' });
    }
};

/** Menampilkan pembeli dan total pembayaran pada event yang dikelola. */
export const getEventAttendees = async (req, res) => {
    try {
        if (!await canManageEvent(req.params.id, req.user)) {
            return res.status(404).json({ message: 'Event tidak ditemukan atau bukan milik Anda.' });
        }
        const attendees = await pool.query(
            `SELECT u.id AS "_id", u.name, u.email, SUM(b.quantity)::int AS quantity,
                    SUM(b.amount)::numeric AS "totalPaid"
             FROM bookings b JOIN users u ON u.id = b.user_id
             WHERE b.event_id = $1 AND b.status = 'done'
             GROUP BY u.id, u.name, u.email ORDER BY u.name`,
            [req.params.id]
        );
        res.json(attendees.rows);
    } catch (error) {
        console.error('Attendee list lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat daftar peserta.' });
    }
};

/** Mengambil rating dan ulasan publik pada event yang dipilih. */
export const getEventReviews = async (req, res) => {
    const eventId = req.params.id || String(req.query.eventId);
    try {
        const reviews = await pool.query(
            `SELECT r.id AS "_id", r.rating, r.comment, r.created_at AS "createdAt",
                    json_build_object('_id', u.id, 'name', u.name, 'profileImage', u.profile_image) AS user
             FROM event_reviews r JOIN users u ON u.id = r.user_id
             JOIN events e ON e.id = r.event_id AND e.is_deleted = FALSE
             WHERE r.event_id = $1 ORDER BY r.created_at DESC`,
            [eventId]
        );
        const rating = await pool.query(
            `SELECT COALESCE(AVG(r.rating), 0)::numeric(3,2) AS average, COUNT(r.id)::int AS count
             FROM events e LEFT JOIN event_reviews r ON r.event_id = e.id
             WHERE e.id = $1 AND e.is_deleted = FALSE`,
            [eventId]
        );
        res.json({ reviews: reviews.rows, ...rating.rows[0] });
    } catch (error) {
        console.error('Event reviews lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat ulasan event.' });
    }
};

/** Menyimpan ulasan hanya dari peserta yang transaksinya selesai setelah event. */
export const createEventReview = async (req, res) => {
    const eventId = req.params.id || String(req.query.eventId);
    try {
        const rating = Number(req.body.rating);
        const comment = String(req.body.comment || '').trim();
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Nilai rating harus antara 1 sampai 5.' });
        }
        const result = await withTransaction(async (client) => {
            const event = await client.query(
                'SELECT id FROM events WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
                [eventId]
            );
            if (!event.rowCount) return { error: 'Event tidak ditemukan.', status: 404 };
            const attendee = await client.query(
                `SELECT b.id, b.status, (COALESCE(e.end_date, e.date) <= NOW()) AS "hasAttended"
                 FROM bookings b JOIN events e ON e.id = b.event_id
                 WHERE b.user_id = $1 AND b.event_id = $2
                 FOR UPDATE OF b`,
                [req.user.id, eventId]
            );
            if (!attendee.rowCount) {
                return { error: 'Anda belum pernah memesan tiket event ini. Pesan tiket dan hadiri event sebelum menulis ulasan.', status: 403 };
            }
            if (!canReviewEvent(attendee.rows)) {
                return { error: 'Ulasan hanya dapat ditulis setelah event selesai dan Anda hadir.', status: 403 };
            }
            const review = await client.query(
                `INSERT INTO event_reviews (event_id, user_id, rating, comment)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id AS "_id", rating, comment, created_at AS "createdAt"`,
                [eventId, req.user.id, rating, comment]
            );
            return { review: review.rows[0] };
        });
        if (result.error) return res.status(result.status).json({ message: result.error });
        res.status(201).json(result.review);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Anda sudah memberi ulasan untuk event ini.' });
        console.error('Event review creation failed:', error);
        res.status(500).json({ message: 'Server gagal menyimpan ulasan.' });
    }
};

/** Menampilkan profil organizer beserta rating dari event yang dikelolanya. */
export const getOrganizerProfile = async (req, res) => {
    try {
        const organizer = await pool.query(
            `SELECT u.id AS "_id", u.name, u.profile_image AS "profileImage",
                    COALESCE(AVG(r.rating), 0)::numeric(3,2) AS rating,
                    COUNT(DISTINCT r.id)::int AS "reviewCount",
                    COUNT(DISTINCT e.id)::int AS "eventCount"
             FROM users u              LEFT JOIN events e ON e.created_by = u.id AND e.is_deleted = FALSE
             LEFT JOIN event_reviews r ON r.event_id = e.id
             WHERE u.id = $1 AND u.role IN ('organizer', 'admin', 'it') AND u.is_deleted = FALSE
             GROUP BY u.id`,
            [req.params.id]
        );
        if (!organizer.rowCount) return res.status(404).json({ message: 'Organizer tidak ditemukan.' });
        res.json(organizer.rows[0]);
    } catch (error) {
        console.error('Organizer profile lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat profil organizer.' });
    }
};
