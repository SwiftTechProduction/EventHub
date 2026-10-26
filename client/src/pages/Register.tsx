import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

/** Menampilkan pendaftaran akun dan tahap verifikasi OTP melalui email. */
const Register = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'user' | 'organizer'>('user');
    const [referralCode, setReferralCode] = useState('');
    const [otp, setOtp] = useState('');
    const [developmentOtp, setDevelopmentOtp] = useState('');
    const [showOTP, setShowOTP] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);
    const [needsVerification, setNeedsVerification] = useState(false);

    const { register, resendVerificationOTP, verifyOTP } = useAuth();
    const navigate = useNavigate();

    /** Mendaftarkan akun atau mengonfirmasi OTP berdasarkan tahap form. */
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setNotice('');
        try {
            if (!showOTP) {
                const result = await register(name, email, password, role, referralCode);
                setShowOTP(true);
                setNeedsVerification(false);
                setDevelopmentOtp(result.developmentOtp || '');
            } else {
                const verifiedUser = await verifyOTP(email, otp);
                navigate(['it', 'admin', 'organizer'].includes(verifiedUser.role) ? '/admin' : '/dashboard');
            }
        } catch (err) {
            if (err && typeof err === 'object' && 'needsVerification' in err && err.needsVerification) {
                setNeedsVerification(true);
                setError('Email ini sudah terdaftar, tetapi akun belum diverifikasi. Kirim ulang OTP untuk melanjutkan.');
            } else if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
                setError(err.message);
            } else {
                setError('Pendaftaran gagal. Periksa koneksi server lalu coba lagi.');
            }
        } finally {
            setLoading(false);
        }
    };

    const resendOTP = async () => {
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const result = await resendVerificationOTP(email);
            setShowOTP(true);
            setNeedsVerification(false);
            setDevelopmentOtp(result.developmentOtp || '');
            setNotice(result.message);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Kode verifikasi belum dapat dikirim ulang.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="auth-panel">
            <div className="text-center mb-8">
                <span className="eyebrow">MULAI BERSAMA EVENTHUB</span>
                <h2 className="mt-3 text-3xl font-extrabold text-gray-900 mb-2">Buat akun</h2>
                <p className="text-gray-500">Daftar untuk mulai menggunakan EventHub</p>
            </div>

            {error && <div role="alert" className="notice notice-error">{error}</div>}
            {notice && <div role="status" className="notice notice-success">{notice}</div>}

            <form onSubmit={handleSubmit} className="space-y-5">
                {!showOTP ? (
                    <>
                        <div>
                            <label className="field-label mb-2">Nama lengkap</label>
                            <input
                                type="text"
                                required
                                className="field-control"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="field-label mb-2">Alamat email</label>
                            <input
                                type="email"
                                required
                                className="field-control"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="field-label mb-2">Password (minimal 8 karakter)</label>
                            <input
                                type="password"
                                required
                                className="field-control"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="field-label mb-2">Saya mendaftar sebagai</label>
                            <select
                                className="field-control"
                                value={role}
                                onChange={(e) => setRole(e.target.value as 'user' | 'organizer')}
                            >
                                <option value="user">Pelanggan — mencari dan membeli tiket</option>
                                <option value="organizer">Organizer — membuat dan mengelola event</option>
                            </select>
                        </div>
                        <div>
                            <label className="field-label mb-2">Kode referral (opsional)</label>
                            <input
                                type="text"
                                className="field-control uppercase"
                                value={referralCode}
                                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                                placeholder="Contoh: EH12AB34CD"
                            />
                            <p className="mt-1 text-xs text-gray-500">Pelanggan baru mendapat kupon; pemilik kode mendapat 10.000 poin.</p>
                        </div>
                    </>
                ) : (
                    <div>
                        <p className="notice notice-success">
                            {developmentOtp
                                ? 'Pendaftaran berhasil. Masukkan kode OTP lokal di bawah untuk mengaktifkan akun.'
                                : 'Kode OTP sudah dikirim ke email. Masukkan kode tersebut untuk mengaktifkan akun.'}
                        </p>
                        {developmentOtp && (
                            <p className="notice notice-info">
                                Kode OTP lokal: <strong className="tracking-widest">{developmentOtp}</strong>
                                <br />
                                <span className="text-xs">Kode ini hanya ditampilkan untuk menjalankan aplikasi di komputer Anda.</span>
                            </p>
                        )}
                        <label className="field-label mb-2">Kode verifikasi (OTP)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            required
                            placeholder="6-digit code"
                            className="field-control text-center text-lg font-bold tracking-widest"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                            maxLength={6}
                        />
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="button-primary w-full"
                >
                    {loading ? 'Memproses...' : (showOTP ? 'Verifikasi dan Selesai' : 'Daftar')}
                </button>
            </form>

            {needsVerification && !showOTP && (
                <button type="button" disabled={loading} onClick={() => void resendOTP()} className="button-primary mt-4 w-full">
                    {loading ? 'Mengirim kode…' : 'Kirim ulang kode verifikasi'}
                </button>
            )}
            {showOTP && (
                <button type="button" disabled={loading} onClick={() => void resendOTP()} className="mt-4 w-full text-sm font-semibold text-violet-700 hover:text-violet-900">
                    Kirim ulang OTP
                </button>
            )}

            {!showOTP && (
                <p className="text-center mt-6 text-gray-600">
                    Sudah punya akun? <Link to="/login" className="font-bold text-violet-700 hover:underline">Masuk</Link>
                </p>
            )}
        </section>
    );
};

export default Register;
