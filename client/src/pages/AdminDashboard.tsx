import React, { useEffect, useMemo, useState } from 'react';
import type { EventForm } from '../types';

const emptyForm: EventForm = {
    title: '', description: '', date: '', endDate: '', location: '',
    category: '', totalSeats: '', ticketPrice: '', image: '', ticketTypes: ''
};

/** Menyediakan panel organizer untuk event, transaksi, promosi, dan laporan. */
const AdminDashboard = () => {
  const [formData, setFormData] = useState<EventForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | string | null>(
    null,
  );
  const [showEventForm, setShowEventForm] = useState(false);
  const saveEvent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
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
  );
};

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

export default AdminDashboard;
