import nodemailer from 'nodemailer';

type OtpType = 'account_verification' | 'event_booking' | 'password_reset';
type BookingDecision = 'accepted' | 'rejected';

/** Menyediakan koneksi SMTP dari .env agar aplikasi dapat memakai sandbox email. */
const createMailer = () => {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host) return null;
    const sender = process.env.MAIL_FROM || 'EventHub <eventhub.jp@gmail.com>';

    return {
        sender,
        mailer: nodemailer.createTransport({
            host,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === 'true',
            ...(user && pass ? { auth: { user, pass } } : {})
        })
    };
};

/** Menjaga nama dan judul event agar tidak ditafsirkan sebagai markup email. */
const escapeHtml = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatRupiah = (amount: number): string => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
}).format(amount);

/** Mengirim OTP melalui SMTP atau menampilkan kode hanya dalam mode development. */
export const sendOTPEmail = async (userEmail: string, otp: string, type: OtpType): Promise<boolean> => {
    const mailer = createMailer();
    if (!mailer) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('SMTP atau MAIL_FROM belum dikonfigurasi. Periksa server/.env dan gunakan alamat pengirim yang diizinkan provider.');
        }
        console.info(`[EventHub development] Email belum diatur. OTP untuk ${userEmail}: ${otp}`);
        return false;
    }

    const titles: Record<OtpType, string> = {
        account_verification: 'Verifikasi akun EventHub',
        event_booking: 'Verifikasi transaksi EventHub',
        password_reset: 'Atur ulang kata sandi EventHub'
    };

    try {
        await mailer.mailer.sendMail({
            from: mailer.sender,
            to: userEmail,
            subject: titles[type],
            text: `Kode Anda: ${otp}. Kode ini berlaku selama 5 menit.`,
            html: `<main style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#172033">
                <h1 style="font-size:24px">${titles[type]}</h1>
                <p>Masukkan kode berikut pada halaman EventHub. Kode berlaku selama 5 menit.</p>
                <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#6c4cf1">${otp}</p>
                <p style="color:#64748b">Jika Anda tidak meminta kode ini, abaikan email ini.</p>
            </main>`
        });
        return true;
    } catch (error) {
        console.error('Gagal mengirim OTP melalui SMTP:', error);
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Email OTP gagal dikirim. Periksa koneksi SMTP dan alamat MAIL_FROM di server/.env.');
        }
        console.info(`[EventHub development] OTP untuk ${userEmail}: ${otp}`);
        return false;
    }
};

/** Mengirim konfirmasi email setelah pesanan tiket berhasil dibuat. */
export const sendBookingCreatedEmail = async (
    userEmail: string,
    userName: string,
    eventTitle: string,
    bookingId: number | string,
    amount: number,
    paymentRequired: boolean
): Promise<boolean> => {
    const mailer = createMailer();
    if (!mailer) {
        console.warn(`Konfirmasi pesanan ${bookingId} untuk ${userEmail} tidak terkirim karena SMTP belum dikonfigurasi.`);
        return false;
    }

    const safeName = escapeHtml(userName);
    const safeEventTitle = escapeHtml(eventTitle);
    const formattedAmount = formatRupiah(amount);
    const subject = paymentRequired
        ? `Konfirmasi pesanan (menunggu pembayaran): ${eventTitle}`
        : `Konfirmasi pesanan tiket: ${eventTitle}`;
    const paymentInstructions = paymentRequired
        ? 'Silakan lakukan pembayaran dan unggah bukti pembayaran melalui dashboard EventHub dalam 2 jam. Pesanan akan dibatalkan otomatis jika bukti belum diunggah sebelum tenggat.'
        : 'Tiket Anda tidak memerlukan pembayaran. Pesanan sedang menunggu konfirmasi organizer; pantau statusnya melalui dashboard EventHub.';
    const safePaymentInstructions = escapeHtml(paymentInstructions);
    try {
        await mailer.mailer.sendMail({
            from: mailer.sender,
            to: userEmail,
            subject,
            text: `Halo ${userName}, pesanan tiket Anda untuk ${eventTitle} sudah tercatat. Total: ${formattedAmount}. ${paymentInstructions}`,
            html: `<main style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#172033">
                <h1 style="font-size:24px">${paymentRequired ? 'Pesanan dikonfirmasi — menunggu pembayaran' : 'Pesanan tiket berhasil dibuat'}</h1>
                <p>Halo ${safeName},</p>
                <p>Pesanan Anda untuk <strong>${safeEventTitle}</strong> sudah tercatat.</p>
                <p>Total pesanan: <strong>${formattedAmount}</strong></p>
                <p>Nomor pesanan: <strong>${escapeHtml(String(bookingId))}</strong></p>
                <p>${safePaymentInstructions}</p>
            </main>`
        });
        return true;
    } catch (error) {
        console.error('Gagal mengirim email konfirmasi pesanan:', error);
        return false;
    }
};

/** Memberi tahu pelanggan setelah organizer menerima atau menolak transaksinya. */
export const sendTransactionEmail = async (
    userEmail: string,
    userName: string,
    eventTitle: string,
    decision: BookingDecision
): Promise<boolean> => {
    const mailer = createMailer();
    if (!mailer) {
        console.warn(`Notifikasi ${decision} untuk ${userEmail} tidak terkirim karena SMTP belum dikonfigurasi.`);
        return false;
    }

    const accepted = decision === 'accepted';
    const safeName = escapeHtml(userName);
    const safeEventTitle = escapeHtml(eventTitle);
    try {
        await mailer.mailer.sendMail({
            from: mailer.sender,
            to: userEmail,
            subject: accepted ? `Transaksi event diterima: ${eventTitle}` : `Transaksi event ditolak: ${eventTitle}`,
            text: `Halo ${userName}, transaksi Anda untuk ${eventTitle} ${accepted ? 'telah diterima' : 'ditolak'}.`,
            html: `<main style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#172033">
                <h1 style="font-size:24px">${accepted ? 'Pembayaran diterima' : 'Transaksi ditolak'}</h1>
                <p>Halo ${safeName},</p>
                <p>Transaksi Anda untuk <strong>${safeEventTitle}</strong> ${accepted ? 'telah diterima oleh organizer.' : 'tidak dapat diterima oleh organizer.'}</p>
                <p>Buka dashboard EventHub untuk melihat status terbaru.</p>
            </main>`
        });
        return true;
    } catch (error) {
        console.error(`Gagal mengirim email pemberitahuan transaksi ${decision}:`, error);
        return false;
    }
};
