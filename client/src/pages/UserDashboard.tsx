import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGift, FaTicketAlt, FaUserCircle } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';
import type { Booking, UserProfile } from '../types';
import { formatRupiah } from '../utils/currency';
import { formatEventSchedule } from '../utils/eventSchedule';

const PAYMENT_PROOF_CHUNK_SIZE = 524_288;
const MAX_PROOF_FILE_SIZE = 5_000_000;

interface PointStatementEntry {
    id: string;
    type: 'credit' | 'redemption' | 'return' | 'expiration';
    amount: number;
    createdAt: string;
    expiresAt: string | null;
    reason: string;
    referredUserName: string | null;
    event: string | null;
}

interface PointStatement {
    balance: number;
    expiredPoints: number;
    expiringPoints: number;
    nextExpiration: string | null;
    statement: PointStatementEntry[];
}

const readAsDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('File bukti pembayaran tidak dapat dibaca.'));
    reader.onerror = () => reject(new Error('File bukti pembayaran tidak dapat dibaca.'));
    reader.readAsDataURL(file);
});

const getPaymentProofMimeType = (file: File): string => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const declaredType = file.type.toLowerCase();
    const fallbackType = extension === 'pdf'
        ? 'application/pdf'
        : ['jpg', 'jpeg'].includes(extension || '')
            ? 'image/jpeg'
            : extension === 'png'
                ? 'image/png'
                : extension === 'webp'
                    ? 'image/webp'
                    : '';
    return ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'application/pdf'].includes(declaredType)
        ? declaredType
        : fallbackType;
};

/** Menampilkan transaksi, poin referral, kupon, dan pengaturan profil pelanggan. */
const UserDashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [name, setName] = useState('');
    const [profileImage, setProfileImage] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingProofId, setUploadingProofId] = useState<string | null>(null);
    const [pointStatement, setPointStatement] = useState<PointStatement | null>(null);
    const [showPointHistory, setShowPointHistory] = useState(false);
    const [pointHistoryLoading, setPointHistoryLoading] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        if (['it', 'admin', 'organizer'].includes(user.role)) {
            navigate('/admin');
            return;
        }
        void loadDashboard();
    }, [user, navigate]);

    useEffect(() => {
        if (!profile?.nextPointsExpiration) return;
        const expirationTime = new Date(profile.nextPointsExpiration).getTime();
        let expirationTimer = 0;
        const refreshAtExpiration = () => {
            const remaining = expirationTime - Date.now();
            if (remaining <= 0) {
                void loadDashboard();
                return;
            }
            expirationTimer = window.setTimeout(refreshAtExpiration, Math.min(remaining + 1000, 2_000_000_000));
        };
        refreshAtExpiration();
        return () => window.clearTimeout(expirationTimer);
    }, [profile?.nextPointsExpiration]);

    /** Memuat data profil dan transaksi agar saldo serta status terbaru terlihat. */
    const loadDashboard = async () => {
        setLoading(true);
        try {
            const [profileResponse, bookingResponse] = await Promise.all([
                api.get('/auth/profile'),
                api.get('/bookings/my')
            ]);
            setProfile(profileResponse.data);
            setName(profileResponse.data.name);
            setProfileImage(profileResponse.data.profileImage || '');
            setBookings(bookingResponse.data);
        } catch (caught) {
            setError(caught.response?.data?.message || 'Dashboard belum dapat dimuat.');
        } finally {
            setLoading(false);
        }
    };

    /** Mengunggah avatar kecil dari perangkat tanpa menambah layanan storage. */
    const handleAvatar = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 2_000_000) {
            setError('Pilih file gambar berukuran maksimal 2 MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setProfileImage(String(reader.result));
        reader.onerror = () => setError('Foto profil tidak dapat dibaca.');
        reader.readAsDataURL(file);
    };

    /** Menyimpan data profil atau password baru setelah konfirmasi pengguna. */
    const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!window.confirm('Simpan perubahan profil ini?')) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await api.put('/auth/profile', {
                name,
                profileImage,
                currentPassword: currentPassword || undefined,
                newPassword: newPassword || undefined
            });
            setCurrentPassword('');
            setNewPassword('');
            setNotice('Profil berhasil diperbarui.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Perubahan profil belum dapat disimpan.');
        } finally {
            setSaving(false);
        }
    };

    /** Membaca bukti pembayaran lokal lalu mengirimkannya pada transaksi aktif. */
    const uploadProof = async (bookingId: number | string, file?: File) => {
        if (!file) return;
        setError('');
        setUploadingProofId(String(bookingId));
        let uploadId = '';
        try {
            const mimeType = getPaymentProofMimeType(file);
            if (!['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType)) {
                throw new Error('Format bukti harus JPG, JPEG, PNG, WebP, atau PDF.');
            }
            if (file.size < 1 || file.size > MAX_PROOF_FILE_SIZE) {
                throw new Error('Ukuran bukti pembayaran harus lebih dari 0 dan maksimal 5 MB.');
            }
            const normalizedMimeType = ['image/jpg', 'image/pjpeg'].includes(mimeType) ? 'image/jpeg' : mimeType;
            const totalChunks = Math.ceil(file.size / PAYMENT_PROOF_CHUNK_SIZE);
            uploadId = crypto.randomUUID();
            await api.post(`/bookings/${bookingId}/payment-proof/start`, {
                uploadId,
                mimeType: normalizedMimeType,
                fileSize: file.size,
                totalChunks
            });

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
                const start = chunkIndex * PAYMENT_PROOF_CHUNK_SIZE;
                const chunk = file.slice(start, Math.min(start + PAYMENT_PROOF_CHUNK_SIZE, file.size));
                const dataUrl = await readAsDataUrl(chunk);
                const content = dataUrl.slice(dataUrl.indexOf(',') + 1);
                await api.post(`/bookings/${bookingId}/payment-proof/chunk`, {
                    uploadId,
                    chunkIndex,
                    content
                });
            }
            await api.post(`/bookings/${bookingId}/payment-proof/complete`, { uploadId });
            setNotice('Bukti diterima. Organizer akan memeriksa transaksi Anda.');
            await loadDashboard();
        } catch (caught) {
            if (uploadId) {
                try {
                    await api.delete(`/bookings/${bookingId}/payment-proof/upload/${uploadId}`);
                } catch (cleanupError) {
                    console.warn('Sesi unggah bukti pembayaran akan dibersihkan otomatis.', cleanupError);
                }
            }
            setError(caught.response?.data?.message ||
                (caught.message === 'Network Error'
                    ? 'Koneksi unggah terputus. Periksa koneksi ke server lalu coba unggah kembali.'
                    : caught.message || 'Bukti pembayaran belum dapat diunggah.'));
        } finally {
            setUploadingProofId(null);
        }
    };

    const showPoints = async () => {
        setShowPointHistory(true);
        setPointHistoryLoading(true);
        try {
            const { data } = await api.get('/auth/points');
            setPointStatement(data);
            setProfile((current) => current
                ? { ...current, points: data.balance, nextPointsExpiration: data.nextExpiration }
                : current);
        } catch (caught) {
            setError(caught.response?.data?.message || 'Riwayat poin belum dapat dimuat.');
            setShowPointHistory(false);
        } finally {
            setPointHistoryLoading(false);
        }
    };

    /** Membatalkan transaksi melalui dialog konfirmasi dan memuat saldo yang dikembalikan. */
    const cancelBooking = async (booking: Booking) => {
        if (!window.confirm('Batalkan transaksi? Kursi dan diskon yang digunakan akan dikembalikan.')) return;
        try {
            await api.delete(`/bookings/${booking._id}`);
            setNotice('Transaksi dibatalkan. Kursi dan manfaat yang digunakan telah dikembalikan.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Transaksi belum dapat dibatalkan.');
        }
    };

    if (loading) return <div className="page-message">Memuat dashboard…</div>;

    return (
        <div className="mx-auto max-w-6xl">
            {/* Header profil menunjukkan saldo, referral, dan pintasan logout. */}
            <section className="dashboard-hero">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/15 text-2xl font-bold">
                        {profile?.profileImage ? <img src={profile.profileImage} alt="" className="h-full w-full object-cover" /> : user?.name[0]}
                    </div>
                    <div>
                        <span className="eyebrow text-white/65">RUANG PELANGGAN</span>
                        <h1 className="mt-1 text-2xl font-extrabold text-white md:text-3xl">Halo, {user?.name}</h1>
                    </div>
                </div>
                <button onClick={() => { logout(); navigate('/login'); }} className="button-ghost">Keluar</button>
            </section>

            {error && <p role="alert" className="notice notice-error mt-5">{error}</p>}
            {notice && <p role="status" className="notice notice-success mt-5">{notice}</p>}

            <div className="mt-7 grid gap-5 md:grid-cols-3">
                <article className="metric-card">
                    <span className="metric-icon"><FaGift /></span>
                    <p className="metric-label">Poin tersedia</p>
                    <strong className="metric-value">{(profile?.points || 0).toLocaleString('id-ID')}</strong>
                    <p className="text-xs text-slate-500">Setiap poin bernilai Rp1 dan otomatis kedaluwarsa 3 bulan setelah diperoleh.</p>
                    <button type="button" className="mt-3 text-sm font-bold text-violet-700 hover:underline" onClick={() => void showPoints()}>
                        Lihat detail poin
                    </button>
                </article>
                <article className="metric-card">
                    <span className="metric-icon"><FaTicketAlt /></span>
                    <p className="metric-label">Transaksi</p>
                    <strong className="metric-value">{bookings.length}</strong>
                    <p className="text-xs text-slate-500">Lihat tenggat, bukti bayar, dan status setiap pesanan.</p>
                </article>
                <article className="metric-card">
                    <span className="metric-icon"><FaUserCircle /></span>
                    <p className="metric-label">Nomor referral</p>
                    <strong className="metric-value text-xl">{profile?.referralCode || '—'}</strong>
                    <p className="text-xs text-slate-500">Teman yang memakai kode ini mendapat kupon diskon 10%.</p>
                </article>
            </div>

            <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_340px]">
                {/* Kartu transaksi memaparkan status dan upload bukti sebelum batas waktu. */}
                <section>
                    <div className="mb-4 flex items-end justify-between gap-3">
                        <div>
                            <span className="eyebrow">PESANAN SAYA</span>
                            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Transaksi tiket</h2>
                        </div>
                        <Link to="/" className="text-sm font-bold text-violet-700 hover:underline">Jelajahi event</Link>
                    </div>
                    <div className="space-y-4">
                        {bookings.length === 0 ? (
                            <div className="surface-card p-8 text-center">
                                <p className="text-lg font-bold text-slate-800">Belum ada transaksi</p>
                                <p className="mt-2 text-sm text-slate-500">Event yang kamu pesan akan muncul di sini.</p>
                                <Link to="/" className="button-primary mt-5">Temukan event</Link>
                            </div>
                        ) : bookings.map((booking) => (
                            <article key={booking._id} className="surface-card overflow-hidden">
                                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                                    {booking.eventId?.image && <img src={booking.eventId.image} alt="" className="h-24 w-full rounded-xl object-cover sm:w-32" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h3 className="font-bold text-slate-900">{booking.eventId?.title || 'Event tidak tersedia'}</h3>
                                                <p className="mt-1 text-sm text-slate-500">{booking.quantity} × {booking.ticketType} · dipesan {new Date(booking.bookedAt).toLocaleString('id-ID')}</p>
                                                {booking.eventId && (
                                                    <p className="mt-1 text-sm text-slate-500">
                                                        {formatEventSchedule(booking.eventId.date, booking.eventId.endDate)}
                                                    </p>
                                                )}
                                            </div>
                                            <span className={`status-pill status-${booking.status}`}>{statusLabel(booking.status)}</span>
                                        </div>
                                        <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                                            <span className="text-slate-500">Total</span>
                                            <strong className="text-slate-900">{formatRupiah(booking.amount)}</strong>
                                        </div>
                                        {booking.status === 'waiting_for_payment' && booking.paymentDeadline && (
                                            <div className="mt-4 rounded-xl bg-amber-50 p-4">
                                                <PaymentCountdown deadline={booking.paymentDeadline} onExpire={() => void loadDashboard()} />
                                                <p className="text-sm font-semibold text-amber-900">
                                                    Unggah bukti sebelum {new Date(booking.paymentDeadline).toLocaleString('id-ID')}.
                                                </p>
                                                <p className="mt-1 text-xs text-amber-700">Transaksi akan expired otomatis saat hitung mundur habis.</p>
                                                <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg bg-amber-900 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800">
                                                    {uploadingProofId === String(booking._id) ? 'Mengunggah bukti…' : 'Pilih bukti pembayaran'}
                                                    <input className="sr-only" type="file" disabled={uploadingProofId !== null} accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { void uploadProof(booking._id, e.target.files?.[0]); e.currentTarget.value = ''; }} />
                                                </label>
                                                <p className="mt-2 text-xs text-amber-700">JPG, JPEG, PNG, WebP, atau PDF maksimal 5 MB.</p>
                                                {uploadingProofId === String(booking._id) && (
                                                    <p role="status" className="mt-2 text-xs font-semibold text-amber-900">Mengirim file dalam beberapa bagian, mohon tunggu…</p>
                                                )}
                                            </div>
                                        )}
                                        {booking.status === 'waiting_for_admin_confirmation' && (
                                            <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
                                                Bukti diterima. Organizer perlu memeriksa transaksi sebelum {booking.organizerDeadline ? new Date(booking.organizerDeadline).toLocaleString('id-ID') : '3 hari'}.
                                            </p>
                                        )}
                                        <div className="mt-4 flex flex-wrap gap-3">
                                            {booking.eventId && !booking.eventId.isDeleted && <Link to={`/events/${booking.eventId._id}`} className="text-sm font-semibold text-violet-700 hover:underline">Buka event</Link>}
                                            {['waiting_for_payment', 'waiting_for_admin_confirmation', 'done'].includes(booking.status) && (
                                                <button onClick={() => void cancelBooking(booking)} className="text-sm font-semibold text-rose-600 hover:underline">Batalkan transaksi</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                {/* Profil dan kupon dapat diperbarui tanpa menampilkan data sensitif. */}
                <aside className="space-y-6">
                    <form onSubmit={saveProfile} className="surface-card p-5">
                        <h2 className="text-lg font-extrabold text-slate-900">Profil & keamanan</h2>
                        <label className="field-label mt-4" htmlFor="profile-name">Nama</label>
                        <input id="profile-name" className="field-control" value={name} onChange={(e) => setName(e.target.value)} required />
                        <label className="field-label mt-4" htmlFor="profile-picture">Foto profil</label>
                        <input id="profile-picture" className="field-control" type="file" accept="image/*" onChange={(e) => handleAvatar(e.target.files?.[0])} />
                        <label className="field-label mt-4" htmlFor="current-password">Password saat ini (untuk mengganti password)</label>
                        <input id="current-password" className="field-control" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                        <label className="field-label mt-4" htmlFor="new-password">Password baru</label>
                        <input id="new-password" className="field-control" type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                        <button className="button-primary mt-5 w-full" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan profil'}</button>
                    </form>

                    <article className="surface-card p-5">
                        <h2 className="text-lg font-extrabold text-slate-900">Kupon saya</h2>
                        <p className="mt-1 text-xs text-slate-500">Masukkan kode kupon pada halaman checkout event.</p>
                        <div className="mt-4 space-y-3">
                            {!profile?.coupons.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada kupon referral.</p> :
                                profile.coupons.map((coupon) => (
                                    <div key={coupon.id} className="rounded-xl border border-dashed border-violet-200 bg-violet-50 p-4">
                                        <strong className="text-violet-900">{coupon.code}</strong>
                                        <p className="mt-1 text-sm text-violet-800">
                                            {coupon.discountType === 'percent' ? `${coupon.discountValue}%` : formatRupiah(coupon.discountValue)} ·
                                            {' '}{coupon.usedAt ? 'Sudah dipakai' : `berlaku sampai ${new Date(coupon.expiresAt).toLocaleDateString('id-ID')}`}
                                        </p>
                                    </div>
                                ))}
                        </div>
                    </article>
                </aside>
            </div>
            {showPointHistory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="point-history-title"
                        className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 md:p-7">
                            <div>
                                <span className="eyebrow">RIWAYAT SALDO</span>
                                <h2 id="point-history-title" className="mt-1 text-2xl font-extrabold text-slate-900">Statement poin</h2>
                            </div>
                            <button type="button" className="button-secondary" onClick={() => setShowPointHistory(false)}>Tutup</button>
                        </div>
                        {pointHistoryLoading ? (
                            <p className="p-8 text-center text-sm text-slate-500">Memuat riwayat poin…</p>
                        ) : pointStatement ? (
                            <div className="max-h-[calc(90vh-100px)] overflow-y-auto p-5 md:p-7">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-2xl bg-violet-50 p-4">
                                        <span className="text-xs font-semibold text-violet-700">Saldo aktif</span>
                                        <strong className="mt-1 block text-xl text-violet-950">{pointStatement.balance.toLocaleString('id-ID')} poin</strong>
                                    </div>
                                    <div className="rounded-2xl bg-amber-50 p-4">
                                        <span className="text-xs font-semibold text-amber-700">Kedaluwarsa 30 hari ke depan</span>
                                        <strong className="mt-1 block text-xl text-amber-950">{pointStatement.expiringPoints.toLocaleString('id-ID')} poin</strong>
                                        {pointStatement.nextExpiration && (
                                            <span className="mt-1 block text-xs text-amber-800">
                                                Berikutnya {new Date(pointStatement.nextExpiration).toLocaleString('id-ID')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="rounded-2xl bg-rose-50 p-4">
                                        <span className="text-xs font-semibold text-rose-700">Total poin hangus</span>
                                        <strong className="mt-1 block text-xl text-rose-950">{pointStatement.expiredPoints.toLocaleString('id-ID')} poin</strong>
                                    </div>
                                </div>
                                <h3 className="mb-3 mt-7 font-bold text-slate-900">Riwayat masuk dan keluar</h3>
                                {pointStatement.statement.length === 0 ? (
                                    <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Belum ada riwayat poin.</p>
                                ) : (
                                    <ol className="space-y-3">
                                        {pointStatement.statement.map((entry) => (
                                            <li key={`${entry.type}-${entry.id}`} className="rounded-2xl border border-slate-100 p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div>
                                                        <strong className="text-sm text-slate-900">
                                                            {entry.type === 'credit' ? 'Poin masuk' : entry.type === 'redemption' ? 'Poin digunakan' : entry.type === 'return' ? 'Poin dikembalikan' : 'Poin hangus'}
                                                        </strong>
                                                        <p className="mt-1 text-sm text-slate-600">{entry.reason}{entry.event ? ` · ${entry.event}` : ''}</p>
                                                        {entry.referredUserName && (
                                                            <p className="mt-1 text-sm text-violet-700">Referral digunakan oleh: {entry.referredUserName}</p>
                                                        )}
                                                    </div>
                                                    <strong className={`text-sm ${entry.amount > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                        {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString('id-ID')} poin
                                                    </strong>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                                                    <span>{new Date(entry.createdAt).toLocaleString('id-ID')}</span>
                                                    {entry.expiresAt && (
                                                        <span>{entry.type === 'expiration' ? 'Kedaluwarsa' : 'Berlaku sampai'} {new Date(entry.expiresAt).toLocaleString('id-ID')}</span>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>
                        ) : null}
                    </section>
                </div>
            )}
        </div>
    );
};

/** Menampilkan sisa waktu pembayaran hingga detik dan menyegarkan status saat habis. */
const PaymentCountdown = ({ deadline, onExpire }: { deadline: string; onExpire: () => void }) => {
    const [remaining, setRemaining] = useState(() => Math.max(0, new Date(deadline).getTime() - Date.now()));
    const expiryHandler = useRef(onExpire);
    const hasRefreshed = useRef(false);

    useEffect(() => {
        expiryHandler.current = onExpire;
    }, [onExpire]);

    useEffect(() => {
        const updateRemaining = () => {
            const next = Math.max(0, new Date(deadline).getTime() - Date.now());
            setRemaining(next);
            if (next === 0 && !hasRefreshed.current) {
                hasRefreshed.current = true;
                expiryHandler.current();
            }
        };
        updateRemaining();
        const timer = window.setInterval(updateRemaining, 1000);
        return () => window.clearInterval(timer);
    }, [deadline]);

    const totalSeconds = Math.ceil(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const formatted = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');

    return (
        <p role="timer" aria-live="off" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">
            <span>Sisa waktu pembayaran</span>
            <time className="font-mono text-lg tabular-nums">{formatted}</time>
        </p>
    );
};

/** Mengubah kode status API menjadi label yang mudah dipahami pelanggan. */
const statusLabel = (status: Booking['status']): string => ({
    waiting_for_payment: 'Menunggu pembayaran',
    waiting_for_admin_confirmation: 'Menunggu konfirmasi organizer',
    done: 'Selesai',
    rejected: 'Ditolak',
    expired: 'EXPIRED',
    canceled: 'Dibatalkan'
}[status]);

export default UserDashboard;
