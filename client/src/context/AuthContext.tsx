import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import api from '../utils/axios';
import type { User } from '../types';

/** Mengubah error jaringan/API menjadi pesan yang bisa langsung ditindaklanjuti. */
const getApiErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError<{ message?: string }>(error)) {
        if (error.response?.data?.message) return error.response.data.message;
        if (!error.response) {
            return 'Tidak dapat terhubung ke server. Jalankan npm run dev dari folder proyek dan pastikan koneksi database di server/.env benar.';
        }
        if (error.response.status >= 500) {
            return 'Server gagal memproses pendaftaran. Pastikan backend berjalan dan DATABASE_URL Supabase di server/.env sudah memakai nilai asli, bukan teks contoh.';
        }
    }
    return error instanceof Error ? error.message : fallback;
};

interface RegisterResult {
    message: string;
    email: string;
    developmentOtp?: string;
}

interface VerificationResult {
    message: string;
    developmentOtp?: string;
}

interface AuthContextValue {
    user: User | null;
    login: (email: string, password: string) => Promise<User>;
    register: (
        name: string,
        email: string,
        password: string,
        role: 'user' | 'organizer',
        referralCode: string
    ) => Promise<RegisterResult>;
    resendVerificationOTP: (email: string) => Promise<VerificationResult>;
    verifyOTP: (email: string, otp: string) => Promise<User>;
    logout: () => void;
    loading: boolean;
}

/** Context autentikasi yang dibaca komponen-komponen React. */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Mengambil context autentikasi dan memberi error jelas jika provider belum dipasang. */
export const useAuth = (): AuthContextValue => {
    const context = React.useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth harus digunakan di dalam AuthProvider');
    }
    return context;
};

/** Menyimpan status login dan menyediakan aksi autentikasi untuk seluruh aplikasi. */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const userInfo = localStorage.getItem('userInfo');
        if (userInfo) {
            setUser(JSON.parse(userInfo));
        }
        setLoading(false);
    }, []);

    /** Mengirim kredensial ke API lalu menyimpan akun dan token sesi. */
    const login = async (email: string, password: string): Promise<User> => {
        try {
            const { data } = await api.post('/auth/login', { email, password });
            setUser(data);
            localStorage.setItem('userInfo', JSON.stringify(data));
            localStorage.setItem('token', data.token);
            return data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.data?.needsVerification) {
                throw error.response.data;
            }
            throw new Error(getApiErrorMessage(error, 'Login gagal. Coba lagi.'));
        }
    };

    /** Mendaftarkan akun baru dan meminta kode verifikasi OTP. */
    const register = async (
        name: string,
        email: string,
        password: string,
        role: 'user' | 'organizer',
        referralCode: string
    ): Promise<RegisterResult> => {
        try {
            const { data } = await api.post('/auth/register', { name, email, password, role, referralCode });
            return data; // API mengembalikan pesan sukses dan email yang didaftarkan.
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.data?.needsVerification) {
                throw error.response.data;
            }
            throw new Error(getApiErrorMessage(error, 'Pendaftaran gagal. Coba lagi.'));
        }
    };

    /** Meminta kode verifikasi baru untuk akun yang belum diaktifkan. */
    const resendVerificationOTP = async (email: string): Promise<VerificationResult> => {
        try {
            const { data } = await api.post('/auth/resend-verification', { email });
            return data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Kode verifikasi belum dapat dikirim ulang.'));
        }
    };

    /** Memverifikasi OTP lalu menyimpan akun dan token sesi. */
    const verifyOTP = async (email: string, otp: string): Promise<User> => {
        try {
            const { data } = await api.post('/auth/verify-otp', { email, otp });
            setUser(data);
            localStorage.setItem('userInfo', JSON.stringify(data));
            localStorage.setItem('token', data.token);
            return data;
        } catch (error) {
            throw new Error(getApiErrorMessage(error, 'Verifikasi OTP gagal. Coba lagi.'));
        }
    };

    /** Menghapus status login serta token dari memori dan penyimpanan browser. */
    const logout = () => {
        setUser(null);
        localStorage.removeItem('userInfo');
        localStorage.removeItem('token');
    };

    return (
        <AuthContext.Provider value={{ user, login, register, resendVerificationOTP, verifyOTP, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
