import 'dotenv/config';
import { initializeDatabase, pool } from './db';
import { expireStaleBookings } from './utils/bookingLifecycle';
import app from './app';

const PORT = process.env.PORT || 5000;

/** Memastikan konfigurasi valid, menyiapkan skema, lalu menjalankan API HTTP. */
const start = async () => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET must be configured before starting the server');
    }

    await initializeDatabase();
    await expireStaleBookings();
    const expirationTimer = setInterval(() => {
        expireStaleBookings()
            .then((count) => {
                if (count) console.info(`${count} transaksi kedaluwarsa dan sumber daya telah dikembalikan.`);
            })
            .catch((error) => console.error('Pemeriksaan batas waktu transaksi gagal:', error));
    }, 60_000);
    expirationTimer.unref();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start().catch(async (error) => {
    console.error('Server gagal dijalankan:', error.message || 'Kesalahan yang tidak diketahui.');
    if (error.code === 'XX000' || error.code === 'ENOTFOUND' || /DATABASE_URL/i.test(error.message || '')) {
        console.error(
            'Buka Supabase > Project Settings > Database > Connection string, pilih Session pooler, ' +
            'salin URL aslinya ke server/.env, lalu ganti username dan password contoh.'
        );
    }
    await pool.end();
    process.exitCode = 1;
});
