import { randomBytes, randomInt } from 'crypto';
import { pool, withTransaction } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendOTPEmail } from '../utils/email';
import { resolvePublicRegistrationRole } from '../utils/authRules';

/** Membuat kode verifikasi yang tidak mudah ditebak untuk OTP dan referral. */
const generateOTP = (): string => String(randomInt(100000, 1000000));
const generateReferralCode = (): string => `EH${randomBytes(4).toString('hex').toUpperCase()}`;
const issueAccountVerificationOTP = async (email: string) => {
    if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
        throw new Error('SMTP belum dikonfigurasi. Isi pengaturan SMTP di server/.env.');
    }
    const otp = generateOTP();
    await pool.query(
        `INSERT INTO otps (email, otp, action, expires_at)
         VALUES ($1, $2, 'account_verification', NOW() + INTERVAL '5 minutes')
         ON CONFLICT (email, action)
         DO UPDATE SET otp = EXCLUDED.otp, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
        [email, otp]
    );
    return { otp, emailSent: await sendOTPEmail(email, otp, 'account_verification') };
};

const userFields = `
    id AS "_id", name, email, role, is_verified AS "isVerified",
    referral_code AS "referralCode", profile_image AS "profileImage",
    created_at AS "createdAt", updated_at AS "updatedAt"
`;

/** Menandatangani token sesi dengan rahasia yang disediakan pada server. */
const generateToken = (id: number | string, role: string): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET must be configured before signing tokens');
    return jwt.sign({ id, role }, secret, { expiresIn: '30d' });
};

/** Mendaftarkan customer atau organizer sekaligus memberi bonus referral. */
export const register = async (req, res) => {
    try {
        const { name, email, password, role, referralCode } = req.body;
        const normalizedEmail = email?.trim().toLowerCase();
        const normalizedReferral = referralCode?.trim().toUpperCase();
        if (!name?.trim() || !normalizedEmail || !password) {
            return res.status(400).json({ message: 'Nama, email, dan password wajib diisi.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password minimal harus 8 karakter.' });
        }
        const publicRole = resolvePublicRegistrationRole(role);
        if (publicRole === 'admin' || publicRole === 'it') {
            return res.status(403).json({ message: 'Akun dengan hak istimewa tidak dapat dibuat melalui pendaftaran publik.' });
        }
        if (publicRole === 'invalid') {
            return res.status(400).json({ message: 'Peran akun tidak valid.' });
        }
        const existingUser = await pool.query(
            'SELECT is_verified FROM users WHERE email = $1 AND is_deleted = FALSE',
            [normalizedEmail]
        );
        if (existingUser.rowCount) {
            const needsVerification = !existingUser.rows[0].is_verified;
            return res.status(409).json({
                message: needsVerification
                    ? 'Email ini sudah terdaftar, tetapi akun belum diverifikasi. Kirim ulang kode OTP untuk melanjutkan.'
                    : 'Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.',
                ...(needsVerification ? { needsVerification: true, email: normalizedEmail } : {})
            });
        }
        if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
            return res.status(503).json({ message: 'SMTP belum dikonfigurasi. Isi pengaturan SMTP di server/.env.' });
        }

        const referral = normalizedReferral
            ? await pool.query('SELECT id FROM users WHERE referral_code = $1 AND is_deleted = FALSE', [normalizedReferral])
            : null;
        if (normalizedReferral && !referral?.rowCount) {
            return res.status(400).json({ message: 'Nomor referral tidak ditemukan.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await withTransaction(async (client) => {
            const newUser = await client.query(
                `INSERT INTO users (name, email, password, role, referral_code, referred_by)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING ${userFields}`,
                [
                    name.trim(),
                    normalizedEmail,
                    hashedPassword,
                    publicRole,
                    generateReferralCode(),
                    referral?.rows[0]?.id || null
                ]
            );
            const user = newUser.rows[0];

            if (referral?.rows[0]) {
                await client.query(
                    `INSERT INTO point_transactions (user_id, amount, expires_at, reason)
                     VALUES ($1, 10000, NOW() + INTERVAL '3 months', $2)`,
                    [referral.rows[0].id, `Referral akun ${user.email}`]
                );
                await client.query(
                    `INSERT INTO coupons (user_id, code, discount_type, discount_value, starts_at, expires_at)
                     VALUES ($1, $2, 'percent', 10, NOW(), NOW() + INTERVAL '3 months')`,
                    [user._id, `WELCOME-${user._id}-${randomBytes(3).toString('hex').toUpperCase()}`]
                );
            }

            const otp = generateOTP();
            await client.query(
                `INSERT INTO otps (email, otp, action, expires_at)
                 VALUES ($1, $2, 'account_verification', NOW() + INTERVAL '5 minutes')
                 ON CONFLICT (email, action)
                 DO UPDATE SET otp = EXCLUDED.otp, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
                [normalizedEmail, otp]
            );
            return { user, otp };
        });

        const emailSent = await sendOTPEmail(normalizedEmail, result.otp, 'account_verification');
        res.status(201).json({
            message: emailSent
                ? 'Kode verifikasi sudah dikirim ke email.'
                : 'Akun dibuat. Gunakan kode OTP lokal yang ditampilkan di layar.',
            email: result.user.email,
            ...(!emailSent && process.env.NODE_ENV !== 'production' ? { developmentOtp: result.otp } : {})
        });
    } catch (error) {
        if (error.code === '23505') {
            const existingUser = await pool.query(
                'SELECT is_verified FROM users WHERE email = $1',
                [req.body.email?.trim().toLowerCase()]
            );
            if (existingUser.rowCount) {
                const needsVerification = !existingUser.rows[0].is_verified;
                return res.status(409).json({
                    message: needsVerification
                        ? 'Email ini sudah terdaftar, tetapi akun belum diverifikasi. Kirim ulang kode OTP untuk melanjutkan.'
                        : 'Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.',
                    ...(needsVerification ? { needsVerification: true, email: req.body.email?.trim().toLowerCase() } : {})
                });
            }
        }
        console.error('Registration failed:', error);
        res.status(500).json({ message: error.message || 'Pendaftaran gagal karena masalah pada server.' });
    }
};

/** Mengirim ulang OTP akun tanpa membocorkan status email yang tidak ditemukan. */
export const resendVerificationOTP = async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();
        if (!email) return res.status(400).json({ message: 'Alamat email wajib diisi.' });
        const user = await pool.query(
            'SELECT is_verified FROM users WHERE email = $1 AND is_deleted = FALSE',
            [email]
        );
        if (!user.rowCount || user.rows[0].is_verified) {
            return res.json({ message: 'Jika akun belum diverifikasi, kode OTP akan dikirim ke email.' });
        }

        const { otp, emailSent } = await issueAccountVerificationOTP(email);
        res.json({
            message: emailSent ? 'Kode verifikasi baru sudah dikirim ke email.' : 'Kode verifikasi lokal siap digunakan.',
            ...(!emailSent && process.env.NODE_ENV !== 'production' ? { developmentOtp: otp } : {})
        });
    } catch (error) {
        console.error('Verification OTP resend failed:', error);
        res.status(500).json({ message: error.message || 'Server gagal mengirim ulang kode verifikasi.' });
    }
};

/** Memeriksa kata sandi, memverifikasi akun, lalu memberikan token sesi. */
export const login = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${userFields}, password FROM users WHERE email = $1 AND is_deleted = FALSE`,
            [req.body.email?.trim().toLowerCase()]
        );
        const user = result.rows[0];
        if (!user || !await bcrypt.compare(req.body.password || '', user.password)) {
            return res.status(400).json({ message: 'Email atau password tidak cocok.' });
        }

        if (!user.isVerified && !['admin', 'it'].includes(user.role)) {
            const { otp, emailSent } = await issueAccountVerificationOTP(user.email);
            return res.status(403).json({
                message: 'Akun sudah terdaftar, tetapi belum diverifikasi. Kode OTP baru sudah disiapkan untuk email Anda.',
                needsVerification: true,
                email: user.email,
                ...(!emailSent && process.env.NODE_ENV !== 'production' ? { developmentOtp: otp } : {})
            });
        }

        res.json({ ...user, token: generateToken(user._id, user.role) });
    } catch (error) {
        console.error('Login failed:', error);
        res.status(500).json({ message: 'Server gagal memproses login.' });
    }
};

/** Memastikan OTP pendaftaran benar sebelum akun dapat dipakai. */
export const verifyOTP = async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();
        const result = await withTransaction(async (client) => {
            const validOTP = await client.query(
                `SELECT id FROM otps
                 WHERE email = $1 AND otp = $2 AND action = 'account_verification'
                   AND expires_at > NOW()
                 FOR UPDATE`,
                [email, req.body.otp]
            );
            if (!validOTP.rowCount) return null;

            const user = await client.query(
                `UPDATE users SET is_verified = TRUE, updated_at = NOW()
                 WHERE email = $1 AND is_deleted = FALSE RETURNING ${userFields}`,
                [email]
            );
            await client.query('DELETE FROM otps WHERE id = $1', [validOTP.rows[0].id]);
            return user.rows[0] || null;
        });

        if (!result) return res.status(400).json({ message: 'Kode OTP salah atau sudah kedaluwarsa.' });
        res.json({ ...result, token: generateToken(result._id, result.role) });
    } catch (error) {
        console.error('OTP verification failed:', error);
        res.status(500).json({ message: 'Server gagal memverifikasi kode OTP.' });
    }
};

/** Mengambil profil, poin aktif, dan kupon yang dimiliki akun saat ini. */
export const getProfile = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${userFields},
                COALESCE((
                    SELECT SUM(p.amount - COALESCE((
                        SELECT SUM(a.amount) FROM point_allocations a WHERE a.credit_id = p.id
                    ), 0))
                    FROM point_transactions p
                    WHERE p.user_id = users.id AND p.expires_at > NOW()
                ), 0)::int AS points
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        const coupons = await pool.query(
            `SELECT id, code, discount_type AS "discountType", discount_value AS "discountValue",
                    expires_at AS "expiresAt", used_at AS "usedAt"
             FROM coupons WHERE user_id = $1 ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ ...result.rows[0], coupons: coupons.rows });
    } catch (error) {
        console.error('Profile lookup failed:', error);
        res.status(500).json({ message: 'Server gagal memuat profil.' });
    }
};

/** Memperbarui nama/foto profil atau mengganti password dengan password lama. */
export const updateProfile = async (req, res) => {
    try {
        const { name, profileImage, currentPassword, newPassword } = req.body;
        if (name !== undefined && !name.trim()) {
            return res.status(400).json({ message: 'Nama tidak boleh kosong.' });
        }
        if (profileImage && profileImage.length > 3_000_000) {
            return res.status(413).json({ message: 'Ukuran foto profil maksimal 2 MB.' });
        }

        await withTransaction(async (client) => {
            if (newPassword) {
                if (newPassword.length < 8 || !currentPassword) {
                    throw new Error('Masukkan password saat ini dan password baru minimal 8 karakter.');
                }
                const current = await client.query('SELECT password FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
                if (!await bcrypt.compare(currentPassword, current.rows[0].password)) {
                    throw new Error('Password saat ini tidak benar.');
                }
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                await client.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashedPassword, req.user.id]);
            }
            await client.query(
                `UPDATE users SET name = COALESCE($1, name), profile_image = COALESCE($2, profile_image),
                 updated_at = NOW() WHERE id = $3`,
                [name?.trim() || null, profileImage === undefined ? null : profileImage, req.user.id]
            );
        });
        res.json({ message: 'Profil berhasil diperbarui.' });
    } catch (error) {
        const clientMessage = /Password|password|Nama|foto/i.test(error.message);
        res.status(clientMessage ? 400 : 500).json({
            message: error.message || 'Server gagal memperbarui profil.'
        });
    }
};

/** Mengirim kode reset tanpa membocorkan apakah sebuah email terdaftar. */
export const requestPasswordReset = async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();
        const user = await pool.query(
            'SELECT id FROM users WHERE email = $1 AND is_deleted = FALSE',
            [email]
        );
        if (!user.rowCount) return res.json({ message: 'Jika email terdaftar, kode reset akan dikirim.' });
        if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
            return res.status(503).json({ message: 'SMTP belum dikonfigurasi untuk mengirim kode reset.' });
        }

        const otp = generateOTP();
        await pool.query(
            `INSERT INTO otps (email, otp, action, expires_at)
             VALUES ($1, $2, 'password_reset', NOW() + INTERVAL '5 minutes')
             ON CONFLICT (email, action)
             DO UPDATE SET otp = EXCLUDED.otp, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
            [email, otp]
        );
        const emailSent = await sendOTPEmail(email, otp, 'password_reset');
        res.json({
            message: emailSent ? 'Kode reset sudah dikirim.' : 'Kode reset lokal siap digunakan.',
            ...(!emailSent && process.env.NODE_ENV !== 'production' ? { developmentOtp: otp } : {})
        });
    } catch (error) {
        console.error('Password reset request failed:', error);
        res.status(500).json({ message: 'Server gagal menyiapkan reset password.' });
    }
};

/** Mengganti password hanya setelah OTP reset yang masih aktif tervalidasi. */
export const resetPassword = async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();
        const { otp, password } = req.body;
        if (!email || !otp || !password || password.length < 8) {
            return res.status(400).json({ message: 'Email, OTP, dan password baru minimal 8 karakter wajib diisi.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const updated = await withTransaction(async (client) => {
            const validOTP = await client.query(
                `SELECT id FROM otps
                 WHERE email = $1 AND otp = $2 AND action = 'password_reset' AND expires_at > NOW()
                 FOR UPDATE`,
                [email, otp]
            );
            if (!validOTP.rowCount) return false;
            const updatedUser = await client.query(
                'UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2 AND is_deleted = FALSE',
                [hashedPassword, email]
            );
            if (!updatedUser.rowCount) return false;
            await client.query('DELETE FROM otps WHERE id = $1', [validOTP.rows[0].id]);
            return true;
        });
        if (!updated) return res.status(400).json({ message: 'Kode reset salah atau sudah kedaluwarsa.' });
        res.json({ message: 'Password berhasil diatur ulang. Silakan login kembali.' });
    } catch (error) {
        console.error('Password reset failed:', error);
        res.status(500).json({ message: 'Server gagal mengatur ulang password.' });
    }
};
