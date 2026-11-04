import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';

const Settings = () => {
    const { user, updateUser } = useAuth();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [profileImage, setProfileImage] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        void loadProfile();
    }, [user, navigate]);

    const loadProfile = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/auth/profile');
            setName(data.name);
            setProfileImage(data.profileImage || '');
        } catch (caught) {
            setError(caught.response?.data?.message || 'Profil belum dapat dimuat.');
        } finally {
            setLoading(false);
        }
    };

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
            updateUser({ name, profileImage });
            setCurrentPassword('');
            setNewPassword('');
            setNotice('Profil berhasil diperbarui.');
            await loadProfile();
        } catch (caught) {
            setError(caught.response?.data?.message || 'Perubahan profil belum dapat disimpan.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="page-message">Memuat pengaturan…</div>;

    return (
        <div className="mx-auto max-w-6xl">
            <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <Link to={user && ['it', 'admin', 'organizer'].includes(user.role) ? '/admin' : '/dashboard'} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-violet-700">
                        <FaArrowLeft /> Kembali ke dashboard
                    </Link>
                    <span className="eyebrow block">AKUN EVENTHUB</span>
                    <h1 className="mt-1 text-3xl font-extrabold text-slate-900">Pengaturan</h1>
                    <p className="mt-2 text-sm text-slate-500">Kelola informasi dan keamanan akun Anda.</p>
                </div>
            </header>

            {error && <p role="alert" className="notice notice-error">{error}</p>}
            {notice && <p role="status" className="notice notice-success">{notice}</p>}

            <section className="surface-card max-w-4xl p-5 md:p-8">
                <div className="mb-6 border-b border-slate-100 pb-5">
                    <h2 className="text-xl font-extrabold text-slate-900">Profil dan Keamanan</h2>
                    <p className="mt-1 text-sm text-slate-500">Perbarui identitas dan kata sandi akun.</p>
                </div>
                <form onSubmit={saveProfile} className="max-w-2xl">
                                <div className="mb-6 flex items-center gap-4">
                                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-2xl font-bold text-violet-800">
                                        {profileImage ? <img src={profileImage} alt="Foto profil" className="h-full w-full object-cover" /> : name[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900">Foto profil</p>
                                        <p className="mt-1 text-xs text-slate-500">JPG, PNG, atau format gambar lain, maksimal 2 MB.</p>
                                        <label className="mt-2 inline-flex cursor-pointer text-sm font-bold text-violet-700 hover:underline">
                                            Unggah foto
                                            <input className="sr-only" type="file" accept="image/*" onChange={(event) => { handleAvatar(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                                        </label>
                                    </div>
                                </div>
                                <label className="field-label" htmlFor="settings-name">Nama</label>
                                <input id="settings-name" className="field-control mt-2" value={name} onChange={(event) => setName(event.target.value)} required />
                                <p className="mt-5 border-t border-slate-100 pt-5 text-sm font-bold text-slate-800">Ganti kata sandi</p>
                                <p className="mt-1 text-xs text-slate-500">Kosongkan jika tidak ingin mengganti kata sandi.</p>
                                <label className="field-label mt-4" htmlFor="settings-current-password">Kata sandi saat ini</label>
                                <input id="settings-current-password" className="field-control mt-2" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                                <label className="field-label mt-4" htmlFor="settings-new-password">Kata sandi baru</label>
                                <input id="settings-new-password" className="field-control mt-2" type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                                <button className="button-primary mt-6" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button>
                </form>
            </section>
        </div>
    );
};

export default Settings;