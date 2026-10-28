import nodemailer from 'nodemailer';

export type OTPAction = 'account_verification' | 'event_booking' | 'password_reset';

/** Mengirim OTP melalui SMTP bila dikonfigurasi; di development kode OTP tetap dikembalikan API. */
export const sendOTPEmail = async (
    email: string,
    otp: string,
    action: OTPAction
): Promise<boolean> => {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return false;

    try {
        const transporter = nodemailer.createTransport({
            host,
            port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user, pass }
        });
        const subject = action === 'password_reset'
            ? 'EventHub - Kode reset password'
            : action === 'event_booking'
                ? 'EventHub - Kode booking event'
                : 'EventHub - Kode verifikasi akun';

        await transporter.sendMail({
            from: process.env.SMTP_FROM || user,
            to: email,
            subject,
            text: `Kode OTP EventHub Anda adalah: ${otp}. Kode berlaku selama 5 menit.`
        });
        return true;
    } catch (error) {
        console.error('Pengiriman OTP gagal:', error instanceof Error ? error.message : error);
        return false;
    }
};
