import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaTicketAlt } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';
import type { UserProfile } from '../types';
import { formatRupiah } from '../utils/currency';
import { markCouponsSeen } from '../utils/couponNotifications';

const Coupons = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        if (!['user', 'customer'].includes(user.role)) {
            navigate('/settings');
            return;
        }

        let isCurrent = true;
        api.get('/auth/profile')
            .then(({ data }) => {
                if (!isCurrent) return;
                setProfile(data);
                markCouponsSeen(user._id, data.coupons || []);
            })
            .catch((caught) => {
                if (isCurrent) setError(caught.response?.data?.message || 'Kupon belum dapat dimuat.');
            })
            .finally(() => {
                if (isCurrent) setLoading(false);
            });

        return () => { isCurrent = false; };
    }, [user, navigate]);

    if (loading) return <div className="page-message">Memuat kupon…</div>;

    return (
        <div className="mx-auto max-w-5xl">
            <header className="mb-7">
                <Link to="/dashboard" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-violet-700">
                    <FaArrowLeft /> Kembali ke dashboard
                </Link>
                <span className="eyebrow block">KEUNTUNGAN AKUN</span>
                <h1 className="mt-1 text-3xl font-extrabold text-slate-900">Kupon Saya</h1>
                <p className="mt-2 text-sm text-slate-500">Gunakan kode kupon saat checkout event.</p>
            </header>

            {error && <p role="alert" className="notice notice-error">{error}</p>}
            <section aria-label="Daftar kupon" className="space-y-3">
                {!profile?.coupons.length ? (
                    <div className="surface-card flex items-center gap-4 p-6">
                        <span className="metric-icon"><FaTicketAlt /></span>
                        <div>
                            <h2 className="font-bold text-slate-900">Belum ada kupon</h2>
                            <p className="mt-1 text-sm text-slate-500">Kupon referral yang Anda dapatkan akan tampil di sini.</p>
                        </div>
                    </div>
                ) : profile.coupons.map((coupon) => (
                    <article key={coupon.id} className="surface-card border-dashed border-violet-200 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <strong className="text-lg font-extrabold text-violet-900">{coupon.code}</strong>
                            <span className={`status-pill ${coupon.usedAt ? 'status-expired' : 'status-done'}`}>
                                {coupon.usedAt ? 'Sudah dipakai' : 'Belum dipakai'}
                            </span>
                        </div>
                        <p className="mt-2 text-sm text-violet-800">
                            Diskon {coupon.discountType === 'percent' ? `${coupon.discountValue}%` : formatRupiah(coupon.discountValue)}
                            {' · '}{coupon.usedAt ? `dipakai ${new Date(coupon.usedAt).toLocaleDateString('id-ID')}` : `berlaku sampai ${new Date(coupon.expiresAt).toLocaleDateString('id-ID')}`}
                        </p>
                    </article>
                ))}
            </section>
        </div>
    );
};

export default Coupons;