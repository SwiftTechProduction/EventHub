import { Pool } from 'pg';
import type { PoolClient } from 'pg';

const SCHEMA_MIGRATION_ADVISORY_LOCK_ID = 7324186251901;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false } 
    //ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
});

/** Membuat tabel serta indeks PostgreSQL yang dibutuhkan aplikasi saat startup. */
export const initializeDatabase = async () => {
    const databaseUrl = process.env.DATABASE_URL || '';
    if (/xxxx|PROJECT_REF|YOUR_DB_PASSWORD|PASSWORD_KAMU/i.test(databaseUrl)) {
        throw new Error(
            'DATABASE_URL masih berisi teks contoh. Buka Supabase > Project Settings > Database, ' +
            'salin connection string Session pooler yang asli, lalu simpan di server/.env.'
        );
    }
    if (!databaseUrl && !process.env.PGHOST) {
        throw new Error(
            'DATABASE_URL belum diatur. Salin connection string Session pooler Supabase ke server/.env.'
        );
    }

    const client = await pool.connect();
    let discardClient = false;
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_MIGRATION_ADVISORY_LOCK_ID]);
        await client.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            is_verified BOOLEAN NOT NULL DEFAULT FALSE,
            referral_code TEXT UNIQUE,
            referred_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
            profile_image TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        ALTER TABLE users ADD CONSTRAINT users_role_check
            CHECK (role IN ('user', 'customer', 'organizer', 'admin', 'it'));
        UPDATE users
        SET referral_code = 'EH' || UPPER(SUBSTRING(MD5(id::text), 1, 8))
        WHERE referral_code IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code);

        CREATE TABLE IF NOT EXISTS events (
            id BIGSERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            date TIMESTAMPTZ NOT NULL,
            end_date TIMESTAMPTZ,
            location TEXT NOT NULL,
            category TEXT NOT NULL,
            total_seats INTEGER NOT NULL CHECK (total_seats >= 0),
            available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
            image TEXT NOT NULL DEFAULT '',
            ticket_price DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (ticket_price >= 0),
            ticket_types JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (available_seats <= total_seats)
        );

        ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_types JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
        UPDATE events SET end_date = date WHERE end_date IS NULL;

        CREATE TABLE IF NOT EXISTS coupons (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code TEXT NOT NULL UNIQUE,
            discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
            discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
            starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS event_vouchers (
            id BIGSERIAL PRIMARY KEY,
            event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            organizer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code TEXT NOT NULL UNIQUE,
            discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
            discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
            starts_at TIMESTAMPTZ NOT NULL,
            ends_at TIMESTAMPTZ NOT NULL,
            max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
            used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (ends_at > starts_at),
            CHECK (used_count <= max_uses)
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id),
            event_id BIGINT REFERENCES events(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'waiting_for_payment',
            payment_status TEXT NOT NULL DEFAULT 'not_paid' CHECK (payment_status IN ('paid', 'not_paid')),
            amount DOUBLE PRECISION NOT NULL CHECK (amount >= 0),
            quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
            ticket_type TEXT NOT NULL DEFAULT 'General Admission',
            seat_reserved BOOLEAN NOT NULL DEFAULT FALSE,
            payment_proof TEXT NOT NULL DEFAULT '',
            payment_deadline TIMESTAMPTZ,
            organizer_deadline TIMESTAMPTZ,
            coupon_id BIGINT REFERENCES coupons(id) ON DELETE SET NULL,
            voucher_id BIGINT REFERENCES event_vouchers(id) ON DELETE SET NULL,
            points_used INTEGER NOT NULL DEFAULT 0 CHECK (points_used >= 0),
            discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
            booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'General Admission';
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seat_reserved BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_proof TEXT NOT NULL DEFAULT '';
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_deadline TIMESTAMPTZ;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS organizer_deadline TIMESTAMPTZ;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_id BIGINT REFERENCES coupons(id) ON DELETE SET NULL;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_id BIGINT REFERENCES event_vouchers(id) ON DELETE SET NULL;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS points_used INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
        ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
        UPDATE bookings SET seat_reserved = TRUE WHERE status = 'confirmed';
        UPDATE bookings SET status = CASE
            WHEN status = 'confirmed' THEN 'done'
            WHEN status = 'cancelled' THEN 'canceled'
            WHEN status = 'pending' THEN 'waiting_for_payment'
            WHEN status = 'waiting_for_confirmation' THEN 'waiting_for_admin_confirmation'
            ELSE status
        END;
        UPDATE bookings SET payment_deadline = created_at + INTERVAL '2 hours'
        WHERE status = 'waiting_for_payment' AND payment_deadline IS NULL;
        UPDATE bookings SET organizer_deadline = created_at + INTERVAL '3 days'
        WHERE status = 'waiting_for_admin_confirmation' AND organizer_deadline IS NULL;
        ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
            CHECK (status IN ('waiting_for_payment', 'waiting_for_admin_confirmation', 'done', 'rejected', 'expired', 'canceled'));

        CREATE TABLE IF NOT EXISTS point_transactions (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            referred_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
            amount INTEGER NOT NULL CHECK (amount > 0),
            expires_at TIMESTAMPTZ NOT NULL,
            reason TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS referred_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
        UPDATE point_transactions p
        SET referred_user_id = u.id
        FROM users u
        WHERE p.referred_user_id IS NULL
          AND p.reason LIKE 'Referral akun %'
          AND LOWER(u.email) = LOWER(SUBSTRING(p.reason FROM LENGTH('Referral akun ') + 1));

        CREATE TABLE IF NOT EXISTS point_allocations (
            id BIGSERIAL PRIMARY KEY,
            credit_id BIGINT NOT NULL REFERENCES point_transactions(id) ON DELETE CASCADE,
            booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL CHECK (amount > 0),
            reversed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE point_allocations ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS payment_proof_uploads (
            upload_id UUID PRIMARY KEY,
            booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
            file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5000000),
            total_chunks INTEGER NOT NULL CHECK (total_chunks > 0 AND total_chunks <= 10),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (booking_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS payment_proof_upload_chunks (
            upload_id UUID NOT NULL REFERENCES payment_proof_uploads(upload_id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
            content TEXT NOT NULL,
            byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 524288),
            PRIMARY KEY (upload_id, chunk_index)
        );

        CREATE TABLE IF NOT EXISTS event_reviews (
            id BIGSERIAL PRIMARY KEY,
            event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            comment TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (event_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS otps (
            id BIGSERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            action TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (email, action)
        );

        ALTER TABLE otps DROP CONSTRAINT IF EXISTS otps_action_check;
        ALTER TABLE otps ADD CONSTRAINT otps_action_check
            CHECK (action IN ('account_verification', 'event_booking', 'password_reset'));

        CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON bookings(user_id);
        CREATE INDEX IF NOT EXISTS bookings_event_id_idx ON bookings(event_id);
        CREATE INDEX IF NOT EXISTS events_category_idx ON events(category);
        CREATE INDEX IF NOT EXISTS events_location_idx ON events(location);
        CREATE INDEX IF NOT EXISTS point_transactions_user_expiry_idx ON point_transactions(user_id, expires_at);
        CREATE INDEX IF NOT EXISTS point_transactions_referred_user_idx ON point_transactions(referred_user_id);
        CREATE INDEX IF NOT EXISTS event_vouchers_event_idx ON event_vouchers(event_id, starts_at, ends_at);
        CREATE INDEX IF NOT EXISTS event_reviews_event_idx ON event_reviews(event_id, created_at DESC);
        `);
        await client.query('COMMIT');
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            discardClient = true;
            const rollbackCode = rollbackError && typeof rollbackError === 'object' &&
                'code' in rollbackError && typeof rollbackError.code === 'string'
                ? rollbackError.code
                : undefined;
            console.error('Database schema migration rollback failed:', { errorCode: rollbackCode });
        }
        throw error;
    } finally {
        client.release(discardClient);
    }
};

/** Menjalankan sejumlah query dalam transaksi agar perubahan terkait tetap konsisten. */
export const withTransaction = async <T,>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
