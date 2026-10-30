import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FaCalendarAlt, FaChair, FaMapMarkerAlt, FaStar } from 'react-icons/fa';
import api from '../utils/axios';
import { useAuth } from '../context/AuthContext';
import type { EventItem, TicketType } from '../types';
import { formatRupiah } from '../utils/currency';

interface EventReview {
    _id: number | string;
    rating: number;
    comment: string;
    createdAt: string;
    user: { name: string; profileImage?: string };
}

/** Menampilkan detail event, proses checkout, dan ulasan peserta. */
const EventDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [event, setEvent] = useState<EventItem | null>(null);
    const [reviews, setReviews] = useState<EventReview[]>([]);
    const [averageRating, setAverageRating] = useState(0);
    const [selectedTicket, setSelectedTicket] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [couponCode, setCouponCode] = useState('');
    const [voucherCode, setVoucherCode] = useState('');
    const [pointsToUse, setPointsToUse] = useState(0);
    const [pointsBalance, setPointsBalance] = useState(0);
    const [otp, setOtp] = useState('');
    const [showOTP, setShowOTP] = useState(false);
    const [developmentOtp, setDevelopmentOtp] = useState('');
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (!id) return;
        Promise.all([
            api.get(`/events/${id}`),
            api.get(`/events/${id}/reviews`)
        ]).then(([eventResponse, reviewResponse]) => {
            setEvent(eventResponse.data);
            setSelectedTicket(eventResponse.data.ticketTypes?.[0]?.name || 'General Admission');
            setReviews(reviewResponse.data.reviews);
            setAverageRating(Number(reviewResponse.data.average));
        }).catch((caught) => {
            setError(caught.response?.data?.message || 'Detail event belum dapat dimuat.');
        }).finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        if (!user) return;
        api.get('/auth/profile')
            .then(({ data }) => setPointsBalance(data.points))
            .catch((caught) => setError(caught.response?.data?.message || 'Saldo poin belum dapat dimuat.'));
    }, [user]);

    /** Memilih harga tiket sesuai jenis yang dipilih pelanggan. */
    const ticket: TicketType | undefined = useMemo(
        () => event?.ticketTypes?.find((item) => item.name === selectedTicket),
        [event, selectedTicket]
    );
    const unitPrice = ticket?.price ?? event?.ticketPrice ?? 0;
    const subtotal = unitPrice * quantity;

    /** Meminta OTP atau mengirim order beserta pilihan tiket dan diskonnya. */
    const handleCheckout = async () => {
        if (!user) {
            navigate('/login');
            return;
        }
        setBusy(true);
        setError('');
        setNotice('');
        try {
            if (!showOTP) {
                const { data } = await api.post('/bookings/send-otp');
                setDevelopmentOtp(data.developmentOtp || '');
                setShowOTP(true);
                setNotice(data.message);
            } else {
                const { data } = await api.post('/bookings', {
                    eventId: event?._id,
                    otp,
                    quantity,
                    ticketType: selectedTicket,
                    couponCode: couponCode.trim() || undefined,
                    voucherCode: voucherCode.trim() || undefined,
                    pointsToUse
                });
                setNotice(data.emailSent
                    ? `${data.message} Konfirmasi pesanan juga sudah dikirim ke email akun Anda.`
                    : `${data.message} Email konfirmasi belum terkirim; periksa konfigurasi SMTP.`);
                setShowOTP(false);
                window.setTimeout(() => navigate('/dashboard'), 1200);
            }
        } catch (caught) {
            setError(caught.response?.data?.message || 'Transaksi belum berhasil dibuat.');
        } finally {
            setBusy(false);
        }
    };

    /** Mengirim penilaian setelah event selesai dan transaksi telah diterima. */
    const submitReview = async (eventForm: React.FormEvent<HTMLFormElement>) => {
        eventForm.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api.post(`/events/${id}/reviews`, { rating: reviewRating, comment: reviewComment });
            const { data } = await api.get(`/events/${id}/reviews`);
            setReviews(data.reviews);
            setAverageRating(Number(data.average));
            setReviewComment('');
            setNotice('Terima kasih, ulasan Anda sudah tercatat.');
        } catch (caught) {
            setError(caught.response?.data?.message || 'Ulasan belum dapat disimpan.');
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <div className="page-message">Memuat detail event…</div>;
    if (!event) return <div className="page-message">{error || 'Event tidak ditemukan.'}</div>;

    const isSoldOut = event.availableSeats < 1;
    const isCustomer = user && ['user', 'customer'].includes(user.role);

    return (
        <div className="mx-auto max-w-6xl">
            {/* Sampul event menonjolkan foto, kategori, dan informasi penyelenggara. */}
            <section className="event-cover">
                {event.image && <img src={event.image} alt="" className="event-cover-image" />}
                <div className="event-cover-shade" />
                <div className="event-cover-content">
                    <span className="eyebrow text-white/75">{event.category}</span>
                    <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight text-white md:text-6xl">{event.title}</h1>
                    <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
                        <span><FaCalendarAlt className="mr-2 inline" />{new Date(event.date).toLocaleDateString('id-ID', { dateStyle: 'long' })}</span>
                        <span><FaMapMarkerAlt className="mr-2 inline" />{event.location}</span>
                    </p>
                    {event.organizer && (
                        <Link to={`/organizers/${event.organizer._id}`} className="mt-6 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur">
                            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/20 font-bold">
                                {event.organizer.profileImage
                                    ? <img src={event.organizer.profileImage} alt="" className="h-full w-full object-cover" />
                                    : event.organizer.name[0]}
                            </span>
                            Diselenggarakan oleh {event.organizer.name}
                        </Link>
                    )}
                </div>
            </section>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
                {/* Deskripsi dan ulasan dipisahkan dari panel checkout agar mudah dibaca. */}
                <section className="space-y-7">
                    <article className="surface-card p-6 md:p-8">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <span className="eyebrow">TENTANG EVENT</span>
                                <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Pengalaman yang menanti</h2>
                            </div>
                            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-700">
                                <FaStar className="mr-1 inline" /> <strong>{averageRating.toFixed(1)}</strong>
                                <span className="ml-1 text-xs">({reviews.length} ulasan)</span>
                            </div>
                        </div>
                        <p className="mt-5 whitespace-pre-line leading-7 text-slate-600">{event.description}</p>
                        <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-500">
                            <span className="rounded-xl bg-slate-50 px-4 py-3"><FaChair className="mr-2 inline text-violet-600" />{event.availableSeats} tiket tersedia</span>
                            {event.endDate && <span className="rounded-xl bg-slate-50 px-4 py-3">Berakhir {new Date(event.endDate).toLocaleDateString('id-ID')}</span>}
                        </div>
                    </article>

                    <article className="surface-card p-6 md:p-8">
                        <h2 className="text-2xl font-extrabold text-slate-900">Cerita dari peserta</h2>
                        {isCustomer && (
                            <form onSubmit={submitReview} className="mt-5 rounded-2xl bg-slate-50 p-5">
                                <label className="field-label" htmlFor="review-rating">Rating Anda</label>
                                <select id="review-rating" value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))} className="field-control">
                                    {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} bintang</option>)}
                                </select>
                                <label className="field-label mt-4" htmlFor="review-comment">Ulasan</label>
                                <textarea id="review-comment" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} className="field-control min-h-24" maxLength={1000} placeholder="Bagikan pengalaman setelah menghadiri event ini." />
                                <button className="button-primary mt-4" disabled={busy}>Kirim ulasan</button>
                            </form>
                        )}
                        <div className="mt-6 space-y-4">
                            {reviews.length === 0 ? (
                                <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Belum ada ulasan. Peserta dapat memberikan penilaian setelah event selesai.</p>
                            ) : reviews.map((review) => (
                                <div key={review._id} className="border-b border-slate-100 pb-4 last:border-0">
                                    <div className="flex items-center justify-between">
                                        <strong className="text-slate-800">{review.user.name}</strong>
                                        <span className="text-sm text-amber-500">{'★'.repeat(review.rating)}</span>
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{review.comment}</p>
                                </div>
                            ))}
                        </div>
                    </article>
                </section>

                {/* Panel checkout memvalidasi kuantitas, OTP, kupon, voucher, dan poin. */}
                <aside className="surface-card h-fit p-6 md:sticky md:top-24">
                    <span className="eyebrow">AMANKAN TEMPATMU</span>
                    <h2 className="mt-2 text-2xl font-extrabold text-slate-900">Pilih tiket</h2>
                    {event.ticketTypes?.length ? (
                        <label className="field-label mt-5" htmlFor="ticket-type">Jenis tiket</label>
                    ) : null}
                    {event.ticketTypes?.length ? (
                        <select id="ticket-type" value={selectedTicket} onChange={(e) => setSelectedTicket(e.target.value)} className="field-control">
                            {event.ticketTypes.map((item) => <option key={item.name} value={item.name}>{item.name} — {formatRupiah(item.price)}</option>)}
                        </select>
                    ) : (
                        <p className="mt-5 text-sm text-slate-500">Tiket umum · {event.availableSeats} kursi tersisa</p>
                    )}
                    <label className="field-label mt-5" htmlFor="ticket-quantity">Jumlah tiket</label>
                    <input id="ticket-quantity" type="number" min={1} max={Math.min(10, event.availableSeats)} value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value), 10, event.availableSeats)))}
                        className="field-control" />

                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <div>
                            <label className="field-label" htmlFor="coupon-code">Kupon referral</label>
                            <input id="coupon-code" className="field-control uppercase" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="WELCOME…" />
                        </div>
                        <div>
                            <label className="field-label" htmlFor="voucher-code">Voucher event</label>
                            <input id="voucher-code" className="field-control uppercase" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value.toUpperCase())} placeholder="KODE VOUCHER" />
                        </div>
                    </div>
                    {user && (
                        <div className="mt-4">
                            <label className="field-label" htmlFor="points-use">Poin (saldo {pointsBalance.toLocaleString('id-ID')})</label>
                            <input id="points-use" type="number" min={0} max={Math.min(pointsBalance, subtotal)} value={pointsToUse}
                                onChange={(e) => setPointsToUse(Math.max(0, Math.min(Number(e.target.value), pointsBalance, subtotal)))}
                                className="field-control" />
                        </div>
                    )}
                    <div className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-sm">
                        <div className="flex justify-between text-slate-500"><span>Subtotal ({quantity} tiket)</span><span>{formatRupiah(subtotal)}</span></div>
                        {pointsToUse > 0 && <div className="flex justify-between text-emerald-700"><span>Poin digunakan</span><span>−{formatRupiah(pointsToUse)}</span></div>}
                        <div className="flex justify-between pt-2 text-lg font-extrabold text-slate-900"><span>Total</span><span>{formatRupiah(Math.max(0, subtotal - pointsToUse))}</span></div>
                    </div>
                    {showOTP && (
                        <div className="mt-5">
                            <label className="field-label" htmlFor="checkout-otp">Kode OTP dari email</label>
                            <input id="checkout-otp" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="field-control text-center font-bold tracking-[0.4em]" />
                        </div>
                    )}
                    {developmentOtp && <p className="notice notice-info mt-4">Kode lokal: <strong className="tracking-widest">{developmentOtp}</strong></p>}
                    <button onClick={handleCheckout} disabled={busy || isSoldOut || (showOTP && otp.length !== 6)} className="button-primary mt-6 w-full">
                        {busy ? 'Memproses…' : showOTP ? 'Verifikasi & buat transaksi' : isSoldOut ? 'Tiket habis' : 'Lanjutkan pemesanan'}
                    </button>
                    {error && <p role="alert" className="notice notice-error mt-4">{error}</p>}
                    {notice && <p role="status" className="notice notice-success mt-4">{notice}</p>}
                    {subtotal - pointsToUse > 0 && <p className="mt-3 text-center text-xs leading-5 text-slate-400">Waktu unggah bukti pembayaran adalah 2 jam setelah transaksi dibuat.</p>}
                </aside>
            </div>
        </div>
    );
};

export default EventDetail;
