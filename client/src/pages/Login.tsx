import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';

type LoginStep = 'login' | 'verify' | 'request-reset' | 'reset';

/** Menangani login, OTP pendaftaran, dan pengaturan ulang password. */
const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [developmentOtp, setDevelopmentOtp] = useState('');
    const [step, setStep] = useState<LoginStep>('login');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, verifyOTP, resendVerificationOTP } = useAuth();
    const navigate = useNavigate();

    /** Menjalankan aksi yang sesuai dengan tahapan login atau reset password. */
    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');
        try {
            if (step === 'login') {
                const user = await login(email, password);
                navigate(['it', 'admin', 'organizer'].includes(user.role) ? '/admin' : '/dashboard');
            } else if (step === 'verify') {
                const user = await verifyOTP(email, otp);
                navigate(['it', 'admin', 'organizer'].includes(user.role) ? '/admin' : '/dashboard');
            } else if (step === 'request-reset') {
                const { data } = await api.post('/auth/forgot-password', { email });
                setDevelopmentOtp(data.developmentOtp || '');
                setStep('reset');
                setMessage(data.message);
            } else {
                await api.post('/auth/reset-password', { email, otp, password: newPassword });
                setStep('login');
                setOtp('');
                setDevelopmentOtp('');
                setMessage('Password berhasil diganti. Silakan masuk dengan password baru.');
            }
        } catch (caught: unknown) {
            const data = axios.isAxiosError(caught)
                ? caught.response?.data
                : caught && typeof caught === 'object' ? caught : null;
            if (data?.needsVerification) {
                setStep('verify');
                setDevelopmentOtp(data.developmentOtp || '');
                setMessage(data.message || 'Masukkan kode OTP yang dikirim ke email.');
            } else if (data?.message) {
                setError(data.message);
            } else {
                setError(caught instanceof Error ? caught.message : 'Permintaan gagal. Coba lagi.');
            }
        } finally {
            setLoading(false);
        }
    };

    const resendOTP = async () => {
        setLoading(true);
        setError('');
        setMessage('');
        try {
            const result = await resendVerificationOTP(email);
            setDevelopmentOtp(result.developmentOtp || '');
            setMessage(result.message);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Kode verifikasi belum dapat dikirim ulang.');
        } finally {
            setLoading(false);
        }
    };

    const titles: Record<LoginStep, string> = {
        login: 'Selamat datang kembali',
        verify: 'Verifikasi akun',
        'request-reset': 'Lupa password?',
        reset: 'Buat password baru'
    };

    return (
        <section className="auth-panel">
            <div className="mb-8 text-center">
                <span className="eyebrow">EVENTHUB ACCOUNT</span>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{titles[step]}</h1>
                <p className="mt-2 text-sm text-slate-500">Satu akun untuk event dan pengalaman favoritmu.</p>
            </div>

            {error && <p role="alert" className="notice notice-error">{error}</p>}
            {message && <p role="status" className="notice notice-success">{message}</p>}
            {developmentOtp && (
                <p className="notice notice-info">
                    Kode lokal: <strong className="tracking-[0.3em]">{developmentOtp}</strong>
                    <span className="mt-1 block text-xs">Kode ini hanya ditampilkan saat email SMTP belum diatur di development.</span>
                </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="field-label" htmlFor="login-email">Alamat email</label>
                    <input
                        id="login-email"
                        type="email"
                        required
                        autoComplete="email"
                        className="field-control"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                </div>

                {step === 'login' && (
                    <div>
                        <label className="field-label" htmlFor="login-password">Password</label>
                        <input
                            id="login-password"
                            type="password"
                            required
                            autoComplete="current-password"
                            className="field-control"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </div>
                )}
                {(step === 'verify' || step === 'reset') && (
                    <div>
                        <label className="field-label" htmlFor="login-otp">Kode OTP</label>
                        <input
                            id="login-otp"
                            type="text"
                            inputMode="numeric"
                            required
                            maxLength={6}
                            className="field-control text-center font-bold tracking-[0.4em]"
                            value={otp}
                            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                        />
                    </div>
                )}
                {step === 'reset' && (
                    <div>
                        <label className="field-label" htmlFor="new-password">Password baru</label>
                        <input
                            id="new-password"
                            type="password"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            className="field-control"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                        />
                    </div>
                )}

                <button type="submit" disabled={loading} className="button-primary w-full">
                    {loading ? 'Memproses…' : step === 'login' ? 'Masuk ke akun' :
                        step === 'verify' ? 'Verifikasi akun' :
                            step === 'request-reset' ? 'Kirim kode reset' : 'Simpan password baru'}
                </button>
            </form>

            {step === 'login' && (
                <button className="mt-4 w-full text-sm font-semibold text-violet-700 hover:text-violet-900" onClick={() => setStep('request-reset')}>
                    Lupa password?
                </button>
            )}
            {step === 'request-reset' && (
                <button className="mt-4 w-full text-sm font-semibold text-violet-700" onClick={() => setStep('login')}>
                    Kembali ke login
                </button>
            )}
            {step === 'verify' && (
                <button type="button" disabled={loading} onClick={() => void resendOTP()} className="mt-4 w-full text-sm font-semibold text-violet-700">
                    Kirim ulang OTP
                </button>
            )}
            <p className="mt-7 text-center text-sm text-slate-500">
                Belum punya akun? <Link to="/register" className="font-bold text-violet-700 hover:underline">Daftar sekarang</Link>
            </p>
        </section>
    );
};

export default Login;
