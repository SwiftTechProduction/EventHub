import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChartLine, FaTicketAlt } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';
import type { Booking, EventForm, EventItem, ManagedAccount, OrganizerStat } from '../types';
import { formatRupiah } from '../utils/currency';

const emptyForm: EventForm = {
    title: '', description: '', date: '', endDate: '', location: '',
    category: '', totalSeats: '', ticketPrice: '', image: '', ticketTypes: ''
};

interface Attendee {
    _id: number | string;
    name: string;
    email: string;
    quantity: number;
    totalPaid: number;
}

interface VoucherForm {
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: string;
    startsAt: string;
    endsAt: string;
    maxUses: string;
}

interface ManagedAccountUpdate extends Partial<ManagedAccount> {
    password?: string;
}

/** Menyediakan panel organizer untuk event, transaksi, promosi, dan laporan. */
const AdminDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [events, setEvents] = useState<EventItem[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [managedUsers, setManagedUsers] = useState<ManagedAccount[]>([]);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' as 'user' | 'organizer' });
    const [stats, setStats] = useState<OrganizerStat[]>([]);
    const [period, setPeriod] = useState<'year' | 'month' | 'day'>('month');
    const [showEventForm, setShowEventForm] = useState(false);
    const [editingEventId, setEditingEventId] = useState<number | string | null>(null);
    const [formData, setFormData] = useState<EventForm>(emptyForm);
    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [attendeeEvent, setAttendeeEvent] = useState<string | null>(null);
    const [voucherEvent, setVoucherEvent] = useState<string | null>(null);
    const [voucherForm, setVoucherForm] = useState<VoucherForm>({
        code: '', discountType: 'percent', discountValue: '10',
        startsAt: '', endsAt: '', maxUses: '20'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (!user || !['it', 'admin', 'organizer'].includes(user.role)) {
            navigate('/login');
            return;
        }
        void loadDashboard();
    }, [user, navigate, period]);

    /** Memuat event, transaksi, dan statistik sesuai peran organizer. */
    const loadDashboard = async () => {
        setLoading(true);
        try {
            const [eventsResponse, bookingsResponse, statsResponse, usersResponse] = await Promise.all([
                user?.role === 'it' ? api.get('/it/events') : api.get('/events/organizer/mine'),
                api.get('/bookings/my'),
                api.get(`/events/organizer/stats?period=${period}&year=${new Date().getFullYear()}`),
                user?.role === 'it' ? api.get('/it/users') : Promise.resolve({ data: [] })
            ]);
            setEvents(eventsResponse.data);
            setBookings(bookingsResponse.data);
            setStats(statsResponse.data);
            setManagedUsers(usersResponse.data);
        } catch (caught) {
            setError(caught.response?.data?.message || 'Dashboard organizer belum dapat dimuat.');
        } finally {
            setLoading(false);
        }
    };

    const createAccount = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!window.confirm(`Buat akun ${newUser.role === 'organizer' ? 'organizer' : 'customer'} ini?`)) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await api.post('/it/users', newUser);
            setNewUser({ name: '', email: '', password: '', role: 'user' });
            setNotice('Akun berhasil dibuat.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Akun belum dapat dibuat.');
        } finally {
            setSaving(false);
        }
    };

    const updateAccount = async (account: ManagedAccount, changes: ManagedAccountUpdate) => {
        setError('');
        try {
            await api.put(`/it/users/${account._id}`, changes);
            setNotice('Akun berhasil diperbarui.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Akun belum dapat diperbarui.');
        }
    };

    const deleteAccount = async (account: ManagedAccount) => {
        if (!window.confirm(`Nonaktifkan akun ${account.email}? Riwayat transaksi tidak akan dihapus.`)) return;
        setError('');
        try {
            await api.delete(`/it/users/${account._id}`);
            setNotice('Akun dinonaktifkan. Riwayat transaksi tetap tersimpan.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Akun belum dapat dinonaktifkan.');
        }
    };

    /** Mengubah baris jenis tiket sederhana menjadi data yang diterima API. */
    const parseTicketTypes = (lines: string) => lines.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [name, price, capacity] = line.split('|').map((part) => part.trim());
        return { name, price: Number(price), capacity: Number(capacity || 0) };
    });

    /** Memastikan perubahan disetujui organizer sebelum dikirim ke server. */
    const saveEvent = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const action = editingEventId ? 'Simpan perubahan pada event ini?' : 'Terbitkan event baru?';
        if (!window.confirm(action)) return;
        setSaving(true);
        setError('');
        try {
            const payload = {
                ...formData,
                totalSeats: Number(formData.totalSeats),
                ticketPrice: Number(formData.ticketPrice),
                ticketTypes: parseTicketTypes(formData.ticketTypes)
            };
            if (editingEventId) await api.put(`/events/${editingEventId}`, payload);
            else await api.post('/events', payload);
            setShowEventForm(false);
            setEditingEventId(null);
            setFormData(emptyForm);
            setNotice(editingEventId ? 'Event berhasil diperbarui.' : 'Event berhasil diterbitkan.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Event belum dapat disimpan. Periksa format tipe tiket.');
        } finally {
            setSaving(false);
        }
    };

    /** Mengisi form dengan data event yang dipilih untuk diedit. */
    const editEvent = (event: EventItem) => {
        setEditingEventId(event._id);
        setFormData({
            title: event.title,
            description: event.description,
            date: new Date(event.date).toISOString().slice(0, 16),
            endDate: new Date(event.endDate || event.date).toISOString().slice(0, 16),
            location: event.location,
            category: event.category,
            totalSeats: String(event.totalSeats),
            ticketPrice: String(event.ticketPrice),
            image: event.image,
            ticketTypes: (event.ticketTypes || []).map((ticket) => `${ticket.name}|${ticket.price}|${ticket.capacity}`).join('\n')
        });
        setShowEventForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /** Menghapus event setelah dialog memastikan tindakan ini memang disengaja. */
    const deleteEvent = async (event: EventItem) => {
        if (!window.confirm(`Hapus event “${event.title}”? Transaksi yang sudah selesai tetap tersimpan.`)) return;
        try {
            await api.delete(`/events/${event._id}`);
            setNotice('Event berhasil dihapus.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Event belum dapat dihapus.');
        }
    };

    const restoreEvent = async (event: EventItem) => {
        if (!window.confirm(`Pulihkan event “${event.title}” agar tampil kembali?`)) return;
        try {
            await api.post(`/it/events/${event._id}/restore`);
            setNotice('Event berhasil dipulihkan.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Event belum dapat dipulihkan.');
        }
    };

    /** Menyetujui atau menolak transaksi setelah memeriksa bukti pembayaran. */
    const reviewBooking = async (booking: Booking, decision: 'accepted' | 'rejected') => {
        const confirmation = decision === 'accepted'
            ? 'Terima bukti pembayaran dan selesaikan transaksi?'
            : 'Tolak transaksi? Kursi, poin, dan diskon akan dikembalikan.';
        if (!window.confirm(confirmation)) return;
        try {
            const { data } = await api.put(`/bookings/${booking._id}/review`, { decision });
            setNotice(data.emailSent
                ? 'Keputusan tersimpan dan email pemberitahuan sudah dikirim.'
                : 'Keputusan tersimpan. Email belum terkirim; periksa konfigurasi SMTP.');
            await loadDashboard();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Keputusan transaksi belum dapat disimpan.');
        }
    };

    /** Membuka daftar peserta untuk satu event yang dikelola. */
    const showAttendees = async (eventId: number | string) => {
        if (attendeeEvent === String(eventId)) {
            setAttendeeEvent(null);
            return;
        }
        try {
            const { data } = await api.get(`/events/${eventId}/attendees`);
            setAttendees(data);
            setAttendeeEvent(String(eventId));
        } catch (caught) {
            setError(caught.response?.data?.message || 'Daftar peserta belum dapat dimuat.');
        }
    };

    /** Menerbitkan kode diskon yang hanya berlaku untuk event yang dipilih. */
    const createVoucher = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!voucherEvent || !window.confirm('Buat voucher ini untuk event terpilih?')) return;
        try {
            await api.post(`/events/${voucherEvent}/vouchers`, {
                ...voucherForm,
                discountValue: Number(voucherForm.discountValue),
                maxUses: Number(voucherForm.maxUses)
            });
            setVoucherEvent(null);
            setVoucherForm({ ...voucherForm, code: '' });
            setNotice('Voucher event berhasil dibuat.');
        } catch (caught) {
            setError(caught.response?.data?.message || 'Voucher belum dapat dibuat.');
        }
    };

    const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!window.confirm('Ganti password akun ini?')) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await api.put('/auth/profile', { currentPassword, newPassword });
            setCurrentPassword('');
            setNewPassword('');
            setNotice('Password akun berhasil diperbarui.');
        } catch (caught) {
            setError(caught.response?.data?.message || 'Password belum dapat diperbarui.');
        } finally {
            setSaving(false);
        }
    };

    /** Menentukan tinggi batang laporan relatif terhadap nilai terbesar. */
    const maxRevenue = useMemo(() => Math.max(...stats.map((item) => Number(item.revenue)), 1), [stats]);
    const revenue = bookings.filter((booking) => booking.status === 'done').reduce((sum, booking) => sum + booking.amount, 0);
    const pending = bookings.filter((booking) => booking.status === 'waiting_for_admin_confirmation').length;

    if (loading) return <div className="page-message">Memuat panel organizer…</div>;

    return (
        <div className="mx-auto max-w-7xl">
            {/* Header memperkenalkan ringkasan dan tindakan utama organizer. */}
            <section className="dashboard-hero">
                <div>
                    <span className="eyebrow text-white/65">{user?.role === 'it' ? 'ADMINISTRATOR IT' : user?.role === 'admin' ? 'ADMINISTRATOR' : 'EVENT ORGANIZER'}</span>
                    <h1 className="mt-2 text-3xl font-extrabold text-white md:text-4xl">{user?.role === 'it' ? 'Panel IT' : 'Studio Event'}</h1>
                    <p className="mt-2 text-sm text-white/70">{user?.role === 'it' ? 'Akses global: kelola customer, organizer, event, dan transaksi.' : 'Kelola acara, periksa pembayaran, dan lihat perkembangan penjualan.'}</p>
                </div>
                <button onClick={() => { setEditingEventId(null); setFormData(emptyForm); setShowEventForm(!showEventForm); }} className="button-light">
                    {showEventForm ? 'Tutup formulir' : '+ Buat event'}
                </button>
            </section>
            {error && <p role="alert" className="notice notice-error mt-5">{error}</p>}
            {notice && <p role="status" className="notice notice-success mt-5">{notice}</p>}

            {/* Kartu metrik menggunakan nominal IDR dan menghitung antrean organizer. */}
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
                <Metric label="Event dikelola" value={String(events.length)} hint="Event mendatang dan lampau" />
                <Metric label="Pendapatan selesai" value={formatRupiah(revenue)} hint="Total transaksi berstatus selesai" />
                <Metric label="Menunggu konfirmasi" value={String(pending)} hint="Bukti pembayaran perlu diperiksa" />
            </div>

            {user?.role === 'it' && (
                <section className="surface-card mt-7 p-5 md:p-7">
                    <div>
                        <span className="eyebrow">AKSES KHUSUS IT</span>
                        <h2 className="mt-1 text-xl font-extrabold text-slate-900">Customer & organizer</h2>
                        <p className="mt-1 text-sm text-slate-500">Kelola akun dan role. Penghapusan menonaktifkan akun tanpa menghapus transaksinya.</p>
                    </div>
                    <form onSubmit={createAccount} className="mt-5 grid gap-3 md:grid-cols-5">
                        <Field label="Nama" value={newUser.name} onChange={(value) => setNewUser({ ...newUser, name: value })} required />
                        <Field label="Email" type="email" value={newUser.email} onChange={(value) => setNewUser({ ...newUser, email: value })} required />
                        <Field label="Password (min. 8 karakter)" type="password" value={newUser.password} onChange={(value) => setNewUser({ ...newUser, password: value })} required />
                        <label className="field-label">Role
                            <select className="field-control mt-2" value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as 'user' | 'organizer' })}>
                                <option value="user">Customer</option>
                                <option value="organizer">Organizer</option>
                            </select>
                        </label>
                        <div className="flex items-end">
                            <button className="button-primary w-full" disabled={saving}>{saving ? 'Menyimpan…' : 'Buat akun'}</button>
                        </div>
                    </form>
                    <div className="mt-5 space-y-3">
                        {!managedUsers.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada akun customer atau organizer.</p> :
                            managedUsers.map((account) => (
                                <ManagedAccountRow
                                    key={account._id}
                                    account={account}
                                    onSave={(changes) => void updateAccount(account, changes)}
                                    onDelete={() => void deleteAccount(account)}
                                />
                            ))}
                    </div>
                </section>
            )}

            <section className="surface-card mt-7 p-5 md:p-7">
                <h2 className="text-xl font-extrabold text-slate-900">Keamanan akun</h2>
                <p className="mt-1 text-sm text-slate-500">Ganti password akun ini menggunakan password saat ini.</p>
                <form onSubmit={changePassword} className="mt-5 grid gap-4 md:grid-cols-3">
                    <label className="field-label">Password saat ini
                        <input className="field-control mt-2" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                    </label>
                    <label className="field-label">Password baru (minimal 8 karakter)
                        <input className="field-control mt-2" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                    </label>
                    <div className="flex items-end">
                        <button className="button-primary w-full" disabled={saving}>{saving ? 'Menyimpan…' : 'Ganti password'}</button>
                    </div>
                </form>
            </section>

            {showEventForm && (
                <section className="surface-card mt-7 p-5 md:p-7">
                    <h2 className="text-xl font-extrabold text-slate-900">{editingEventId ? 'Perbarui event' : 'Rancang event baru'}</h2>
                    <p className="mt-1 text-sm text-slate-500">Isi informasi utama, harga Rupiah, dan kapasitas tiket.</p>
                    <form onSubmit={saveEvent} className="mt-5 grid gap-4 md:grid-cols-2">
                        <Field label="Nama event" value={formData.title} onChange={(value) => setFormData({ ...formData, title: value })} required />
                        <Field label="Kategori" value={formData.category} onChange={(value) => setFormData({ ...formData, category: value })} required />
                        <label className="field-label">Mulai<input className="field-control mt-2" type="datetime-local" required value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} /></label>
                        <label className="field-label">Selesai<input className="field-control mt-2" type="datetime-local" required value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} /></label>
                        <Field label="Lokasi" value={formData.location} onChange={(value) => setFormData({ ...formData, location: value })} required />
                        <Field label="Jumlah tiket tersedia" type="number" value={formData.totalSeats} onChange={(value) => setFormData({ ...formData, totalSeats: value })} required />
                        <Field label="Harga tiket umum (IDR; 0 = gratis)" type="number" value={formData.ticketPrice} onChange={(value) => setFormData({ ...formData, ticketPrice: value })} required />
                        <Field label="URL gambar sampul (opsional)" value={formData.image} onChange={(value) => setFormData({ ...formData, image: value })} />
                        <label className="field-label md:col-span-2">Deskripsi<textarea className="field-control mt-2 min-h-28" required value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></label>
                        <label className="field-label md:col-span-2">
                            Jenis tiket tambahan (opsional)
                            <textarea className="field-control mt-2 min-h-24 font-mono text-sm" value={formData.ticketTypes} onChange={(e) => setFormData({ ...formData, ticketTypes: e.target.value })} placeholder={'VIP|250000|20\nReguler|100000|100'} />
                            <span className="mt-1 block text-xs font-normal text-slate-500">Satu baris per tiket: Nama|Harga IDR|Kapasitas. Kapasitas 0 berarti mengikuti kapasitas event.</span>
                        </label>
                        <div className="flex flex-wrap gap-3 md:col-span-2">
                            <button className="button-primary" disabled={saving}>{saving ? 'Menyimpan…' : editingEventId ? 'Simpan perubahan' : 'Terbitkan event'}</button>
                            <button type="button" onClick={() => { setShowEventForm(false); setEditingEventId(null); setFormData(emptyForm); }} className="button-secondary">Batal</button>
                        </div>
                    </form>
                </section>
            )}

            {/* Grafik sederhana tetap terbaca pada layar kecil tanpa library tambahan. */}
            <section className="surface-card mt-7 p-5 md:p-7">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <span className="eyebrow">LAPORAN PENJUALAN</span>
                        <h2 className="mt-1 text-xl font-extrabold text-slate-900"><FaChartLine className="mr-2 inline text-violet-600" />Performa event</h2>
                    </div>
                    <label className="text-sm font-semibold text-slate-600">Lihat per
                        <select className="field-control ml-2 inline-block w-auto" value={period} onChange={(e) => setPeriod(e.target.value as 'year' | 'month' | 'day')}>
                            <option value="year">tahun</option>
                            <option value="month">bulan</option>
                            <option value="day">hari (bulan ini)</option>
                        </select>
                    </label>
                </div>
                {stats.length === 0 ? <p className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Belum ada transaksi selesai untuk periode ini.</p> :
                    <div className="mt-7 flex h-56 items-end gap-3 overflow-x-auto border-b border-slate-200 pb-2">
                        {stats.map((item) => (
                            <div key={item.date} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2">
                                <span className="text-[10px] font-bold text-slate-500">{formatRupiah(Number(item.revenue))}</span>
                                <div className="w-full min-w-7 rounded-t-xl bg-gradient-to-t from-violet-700 to-fuchsia-400 transition-all" style={{ height: `${Math.max(8, Number(item.revenue) / maxRevenue * 130)}px` }} title={`${item.tickets} tiket`} />
                                <span className="text-[10px] text-slate-500">{new Date(item.date).toLocaleDateString('id-ID', { month: 'short', day: period === 'day' ? 'numeric' : undefined, year: period === 'year' ? 'numeric' : undefined })}</span>
                            </div>
                        ))}
                    </div>
                }
            </section>

            <div className="mt-7 grid gap-7 xl:grid-cols-[1fr_1fr]">
                {/* Daftar event menyediakan aksi pengelolaan, voucher, dan peserta. */}
                <section>
                    <SectionTitle icon={<FaTicketAlt />} title="Event yang dikelola" count={events.length} />
                    <div className="space-y-3">
                        {!events.length ? <div className="surface-card p-7 text-center text-sm text-slate-500">Belum ada event. Buat event pertama melalui tombol di atas.</div> :
                            events.map((event) => (
                                <article key={event._id} className="surface-card overflow-hidden">
                                    <div className="flex flex-col gap-4 p-4 sm:flex-row">
                                        {event.image && <img src={event.image} alt="" className="h-28 w-full rounded-xl object-cover sm:w-36" />}
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-bold text-slate-900">{event.title}</h3>
                                            {event.isDeleted && <span className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-800">Soft-delete</span>}
                                            <p className="mt-1 text-xs text-slate-500">{new Date(event.date).toLocaleString('id-ID')} · {event.location}</p>
                                            <p className="mt-2 text-sm font-semibold text-violet-700">{event.availableSeats}/{event.totalSeats} tiket tersisa · {formatRupiah(event.ticketPrice)}</p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {event.isDeleted && user?.role === 'it'
                                                    ? <button className="button-small" onClick={() => void restoreEvent(event)}>Pulihkan event</button>
                                                    : !event.isDeleted && <>
                                                        <button className="button-small" onClick={() => editEvent(event)}>Edit</button>
                                                        <button className="button-small" onClick={() => setVoucherEvent(String(event._id))}>Buat voucher</button>
                                                        <button className="button-small" onClick={() => void showAttendees(event._id)}>{attendeeEvent === String(event._id) ? 'Tutup peserta' : 'Daftar peserta'}</button>
                                                        <button className="button-small button-danger" onClick={() => void deleteEvent(event)}>Hapus</button>
                                                    </>}
                                            </div>
                                        </div>
                                    </div>
                                    {attendeeEvent === String(event._id) && (
                                        <div className="border-t border-slate-100 bg-slate-50 p-4">
                                            <h4 className="font-bold text-slate-800">Peserta terkonfirmasi</h4>
                                            {!attendees.length ? <p className="mt-2 text-sm text-slate-500">Belum ada transaksi selesai.</p> :
                                                <ul className="mt-3 divide-y divide-slate-200">
                                                    {attendees.map((attendee) => (
                                                        <li key={attendee._id} className="flex justify-between gap-3 py-2 text-sm">
                                                            <span>{attendee.name} · {attendee.quantity} tiket</span>
                                                            <strong>{formatRupiah(Number(attendee.totalPaid))}</strong>
                                                        </li>
                                                    ))}
                                                </ul>}
                                        </div>
                                    )}
                                </article>
                            ))
                        }
                    </div>
                </section>

                {/* Panel transaksi menampilkan bukti bayar dan hanya menyediakan aksi yang sesuai status. */}
                <section>
                    <SectionTitle title="Periksa transaksi" count={bookings.length} />
                    <div className="space-y-3">
                        {!bookings.length ? <div className="surface-card p-7 text-center text-sm text-slate-500">Belum ada transaksi pelanggan.</div> :
                            bookings.map((booking) => (
                                <article key={booking._id} className="surface-card p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h3 className="font-bold text-slate-900">{booking.eventId?.title || 'Event dihapus'}</h3>
                                            <p className="mt-1 text-sm text-slate-500">{booking.userId?.name} · {booking.quantity} × {booking.ticketType}</p>
                                            <p className="text-xs text-slate-400">{booking.userId?.email}</p>
                                        </div>
                                        <span className={`status-pill status-${booking.status}`}>{statusLabel(booking.status)}</span>
                                    </div>
                                    <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
                                        <span className="text-slate-500">{new Date(booking.bookedAt).toLocaleString('id-ID')}</span>
                                        <strong>{formatRupiah(booking.amount)}</strong>
                                    </div>
                                    {booking.paymentProof && (
                                        <a href={booking.paymentProof} download={`bukti-${booking._id}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-bold text-violet-700 hover:underline">
                                            Lihat bukti pembayaran
                                        </a>
                                    )}
                                    {booking.status === 'waiting_for_admin_confirmation' && (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button className="button-primary flex-1" onClick={() => void reviewBooking(booking, 'accepted')}>Terima transaksi</button>
                                            <button className="button-small button-danger flex-1" onClick={() => void reviewBooking(booking, 'rejected')}>Tolak & kembalikan hak</button>
                                        </div>
                                    )}
                                </article>
                            ))
                        }
                    </div>
                </section>
            </div>

            {/* Dialog voucher menyimpan promosi berbatas waktu untuk event tertentu. */}
            {voucherEvent && (
                <div className="modal-backdrop" role="presentation" onClick={() => setVoucherEvent(null)}>
                    <form className="surface-card modal-panel space-y-4 p-6" onSubmit={createVoucher} onClick={(event) => event.stopPropagation()}>
                        <h2 className="text-xl font-extrabold text-slate-900">Promosi event</h2>
                        <p className="text-sm text-slate-500">Voucher ini hanya bisa digunakan untuk event yang dipilih.</p>
                        <Field label="Kode voucher" value={voucherForm.code} onChange={(value) => setVoucherForm({ ...voucherForm, code: value.toUpperCase() })} required />
                        <label className="field-label">Jenis diskon<select className="field-control mt-2" value={voucherForm.discountType} onChange={(e) => setVoucherForm({ ...voucherForm, discountType: e.target.value as 'percent' | 'fixed' })}><option value="percent">Persentase</option><option value="fixed">Potongan Rupiah</option></select></label>
                        <Field label="Nilai diskon" type="number" value={voucherForm.discountValue} onChange={(value) => setVoucherForm({ ...voucherForm, discountValue: value })} required />
                        <label className="field-label">Mulai<input className="field-control mt-2" type="datetime-local" required value={voucherForm.startsAt} onChange={(e) => setVoucherForm({ ...voucherForm, startsAt: e.target.value })} /></label>
                        <label className="field-label">Berakhir<input className="field-control mt-2" type="datetime-local" required value={voucherForm.endsAt} onChange={(e) => setVoucherForm({ ...voucherForm, endsAt: e.target.value })} /></label>
                        <Field label="Jumlah pemakaian" type="number" value={voucherForm.maxUses} onChange={(value) => setVoucherForm({ ...voucherForm, maxUses: value })} required />
                        <div className="flex gap-3"><button className="button-primary flex-1">Buat voucher</button><button type="button" className="button-secondary" onClick={() => setVoucherEvent(null)}>Batal</button></div>
                    </form>
                </div>
            )}
        </div>
    );
};

/** Membagi 3 Grid dengan Metric dan label yang seragam pada dashboard. */
const Metric = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
    <article className="metric-card">
        <p className="metric-label">{label}</p>
        <strong className="metric-value">{value}</strong>
        <p className="text-xs text-slate-500">{hint}</p>
    </article>
);

/** Merender input teks/angka dengan label yang terhubung dan aksesibel. */
const Field = ({ label, value, onChange, type = 'text', required = false }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    required?: boolean;
}) => (
    <label className="field-label">{label}
        <input className="field-control mt-2" type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
);

/** Menampilkan judul Event yang di kelola dan Periksa Transaksi dan jumlah item pada masing-masing panel dashboard. */
const ManagedAccountRow = ({ account, onSave, onDelete }: {
    account: ManagedAccount;
    onSave: (changes: ManagedAccountUpdate) => void;
    onDelete: () => void;
}) => {
    const [name, setName] = useState(account.name);
    const [email, setEmail] = useState(account.email);
    const [role, setRole] = useState<ManagedAccount['role']>(account.role);
    const [password, setPassword] = useState('');

    if (account.role === 'admin' || account.role === 'it') {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                    <strong className="text-slate-900">{account.name}</strong>
                    <p className="text-sm text-slate-500">{account.email}</p>
                </div>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold uppercase text-slate-700">{account.role}</span>
            </div>
        );
    }

    return (
        <form
            className={`grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1.2fr_1fr_1fr_auto] ${account.isDeleted ? 'border-rose-200 bg-rose-50' : 'border-slate-200'}`}
            onSubmit={(event) => {
                event.preventDefault();
                onSave({ name, email, role, ...(password ? { password } : {}) });
                setPassword('');
            }}
        >
            <label className="field-label">Nama<input className="field-control mt-2" required value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="field-label">Email<input className="field-control mt-2" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label className="field-label">Role
                <select className="field-control mt-2" value={role} onChange={(event) => setRole(event.target.value as ManagedAccount['role'])}>
                    <option value="user">Customer</option>
                    <option value="customer">Customer (legacy)</option>
                    <option value="organizer">Organizer</option>
                </select>
            </label>
            <label className="field-label">Password baru (opsional)
                <input className="field-control mt-2" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <div className="flex items-end gap-2">
                <button type="submit" className="button-small">Simpan</button>
                {account.isDeleted
                    ? <button type="button" className="button-small" onClick={() => onSave({ isDeleted: false })}>Pulihkan</button>
                    : <button type="button" className="button-small button-danger" onClick={onDelete}>Nonaktifkan</button>}
            </div>
            <p className="text-xs text-slate-500 md:col-span-5">
                {account.isDeleted ? 'Akun dinonaktifkan' : account.isVerified ? 'Terverifikasi' : 'Belum verifikasi OTP'}
                {' · dibuat '}{new Date(account.createdAt).toLocaleDateString('id-ID')}
            </p>
        </form>
    );
};

const SectionTitle = ({ title, count, icon }: { title: string; count: number; icon?: React.ReactNode }) => (
    <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold text-slate-900">
        {icon && <span className="text-violet-600">{icon}</span>}{title}
        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{count}</span>
    </h2>
);

/** Menerjemahkan enam status transaksi menjadi teks dashboard. */
const statusLabel = (status: Booking['status']): string => ({
    waiting_for_payment: 'Menunggu pembayaran',
    waiting_for_admin_confirmation: 'Menunggu konfirmasi organizer',
    done: 'Selesai',
    rejected: 'Ditolak',
    expired: 'Kedaluwarsa',
    canceled: 'Dibatalkan'
}[status]);

export default AdminDashboard;
