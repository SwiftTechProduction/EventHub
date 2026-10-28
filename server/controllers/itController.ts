import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { pool } from '../db';

const manageableRoles = ['user', 'customer', 'organizer'];
const managedUserFields = `
    id AS "_id", name, email, role, is_verified AS "isVerified",
    is_deleted AS "isDeleted", created_at AS "createdAt"
`;

/** Mengambil semua customer dan organizer, termasuk akun yang di-soft-delete. */
export const getManagedUsers = async (_req, res) => {
    try {
        const users = await pool.query(
            `SELECT ${managedUserFields} FROM users
             ORDER BY created_at DESC`
        );
        res.json(users.rows);
    } catch (error) {
        console.error('IT user list lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat daftar akun customer dan organizer.' });
    }
};

/** Mengambil seluruh event termasuk event soft-delete untuk audit dan pemulihan. */
export const getAllEvents = async (_req, res) => {
    try {
        const events = await pool.query(
            `SELECT e.id AS "_id", e.title, e.description, e.date, e.end_date AS "endDate",
                    e.location, e.category, e.total_seats AS "totalSeats",
                    e.available_seats AS "availableSeats", e.image, e.ticket_price AS "ticketPrice",
                    e.ticket_types AS "ticketTypes", e.is_deleted AS "isDeleted", e.created_at AS "createdAt",
                    CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
                        '_id', u.id, 'name', u.name, 'profileImage', u.profile_image
                    ) END AS organizer
             FROM events e LEFT JOIN users u ON u.id = e.created_by
             ORDER BY e.date DESC`
        );
        res.json(events.rows);
    } catch (error) {
        console.error('IT event list lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat seluruh event.' });
    }
};

/** Memulihkan event yang sebelumnya di-soft-delete. */
export const restoreEvent = async (req, res) => {
    try {
        const restored = await pool.query(
            `UPDATE events SET is_deleted = FALSE, updated_at = NOW()
             WHERE id = $1 AND is_deleted = TRUE RETURNING id`,
            [req.params.id]
        );
        if (!restored.rowCount) return res.status(404).json({ message: 'Event terhapus tidak ditemukan.' });
        res.json({ message: 'Event berhasil dipulihkan.' });
    } catch (error) {
        console.error('IT event restore failed:', error);
        res.status(500).json({ message: 'Server gagal memulihkan event.' });
    }
};

/** Membuat akun customer atau organizer terverifikasi dari panel IT. */
export const createManagedUser = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const role = req.body.role;
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 ||
            !manageableRoles.includes(role)) {
            return res.status(400).json({
                message: 'Nama, email valid, password minimal 8 karakter, dan role customer/organizer wajib diisi.'
            });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const created = await pool.query(
            `INSERT INTO users (name, email, password, role, is_verified, referral_code)
             VALUES ($1, $2, $3, $4, TRUE, $5)
             RETURNING ${managedUserFields}`,
            [name, email, hashedPassword, role, `EH${randomBytes(4).toString('hex').toUpperCase()}`]
        );
        res.status(201).json(created.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Email tersebut sudah digunakan, termasuk oleh akun yang sudah dihapus.' });
        }
        console.error('IT user creation failed:', error);
        res.status(500).json({ message: 'Server gagal membuat akun.' });
    }
};

/** Memperbarui profil/role atau memulihkan akun customer dan organizer. */
export const updateManagedUser = async (req, res) => {
    try {
        const id = req.params.id;
        const existing = await pool.query(
            `SELECT id, role FROM users
             WHERE id = $1 AND role IN ('user', 'customer', 'organizer')`,
            [id]
        );
        if (!existing.rowCount) return res.status(404).json({ message: 'Akun customer/organizer tidak ditemukan.' });

        const changes = req.body;
        if (changes.role !== undefined && !manageableRoles.includes(changes.role)) {
            return res.status(400).json({ message: 'Role hanya dapat diatur ke customer atau organizer.' });
        }
        const assignments: string[] = [];
        const values: unknown[] = [];
        if (changes.name !== undefined) {
            const name = String(changes.name).trim();
            if (!name) return res.status(400).json({ message: 'Nama tidak boleh kosong.' });
            values.push(name);
            assignments.push(`name = $${values.length}`);
        }
        if (changes.email !== undefined) {
            const email = String(changes.email).trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ message: 'Alamat email tidak valid.' });
            }
            values.push(email);
            assignments.push(`email = $${values.length}`);
        }
        if (changes.role !== undefined) {
            values.push(changes.role);
            assignments.push(`role = $${values.length}`);
        }
        if (changes.password !== undefined && changes.password !== '') {
            if (String(changes.password).length < 8) {
                return res.status(400).json({ message: 'Password minimal harus 8 karakter.' });
            }
            values.push(await bcrypt.hash(String(changes.password), 10));
            assignments.push(`password = $${values.length}`);
        }
        if (changes.isDeleted !== undefined) {
            if (typeof changes.isDeleted !== 'boolean') {
                return res.status(400).json({ message: 'Status penghapusan akun tidak valid.' });
            }
            values.push(changes.isDeleted);
            assignments.push(`is_deleted = $${values.length}`);
        }
        if (!assignments.length) {
            return res.status(400).json({ message: 'Tidak ada perubahan akun untuk disimpan.' });
        }
        assignments.push('updated_at = NOW()');
        values.push(id);
        const updated = await pool.query(
            `UPDATE users SET ${assignments.join(', ')}
             WHERE id = $${values.length} AND role IN ('user', 'customer', 'organizer')
             RETURNING ${managedUserFields}`,
            values
        );
        res.json(updated.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Alamat email tersebut sudah digunakan.' });
        }
        console.error('IT user update failed:', error);
        res.status(500).json({ message: 'Server gagal memperbarui akun.' });
    }
};

/** Menonaktifkan akun customer/organizer tanpa menghapus riwayat transaksi. */
export const softDeleteManagedUser = async (req, res) => {
    try {
        const deleted = await pool.query(
            `UPDATE users SET is_deleted = TRUE, updated_at = NOW()
             WHERE id = $1 AND role IN ('user', 'customer', 'organizer') AND is_deleted = FALSE
             RETURNING id`,
            [req.params.id]
        );
        if (!deleted.rowCount) return res.status(404).json({ message: 'Akun aktif customer/organizer tidak ditemukan.' });
        res.json({ message: 'Akun dinonaktifkan. Riwayat transaksi tetap tersimpan.' });
    } catch (error) {
        console.error('IT user deletion failed:', error);
        res.status(500).json({ message: 'Server gagal menonaktifkan akun.' });
    }
};
