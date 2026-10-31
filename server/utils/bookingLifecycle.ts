import { withTransaction } from '../db';

/** Mengakhiri transaksi yang lewat batas waktu dan mengembalikan hak yang dipakai. */
export const expireStaleBookings = async (): Promise<number> => withTransaction(async (client) => {
    const expired = await client.query(
        `SELECT id, event_id, quantity, seat_reserved, coupon_id, voucher_id
         FROM bookings
         WHERE (status = 'waiting_for_payment' AND payment_deadline <= NOW())
            OR (status = 'waiting_for_admin_confirmation' AND organizer_deadline <= NOW())
         FOR UPDATE SKIP LOCKED`
    );

    for (const booking of expired.rows) {
        await client.query(
            `UPDATE bookings
             SET status = CASE WHEN status = 'waiting_for_payment' THEN 'expired' ELSE 'canceled' END,
                 updated_at = NOW()
             WHERE id = $1`,
            [booking.id]
        );
        if (booking.event_id && booking.seat_reserved) {
            await client.query(
                `UPDATE events
                 SET available_seats = LEAST(total_seats, available_seats + $1), updated_at = NOW()
                 WHERE id = $2`,
                [booking.quantity, booking.event_id]
            );
        }
        await client.query(
            'UPDATE point_allocations SET reversed_at = NOW() WHERE booking_id = $1 AND reversed_at IS NULL',
            [booking.id]
        );
        if (booking.coupon_id) {
            await client.query('UPDATE coupons SET used_at = NULL WHERE id = $1', [booking.coupon_id]);
        }
        if (booking.voucher_id) {
            await client.query(
                'UPDATE event_vouchers SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1',
                [booking.voucher_id]
            );
        }
    }

    return expired.rowCount || 0;
});
