import { withTransaction } from '../db';

/** Membatalkan booking yang melewati batas waktu dan mengembalikan kursinya. */
export const expireStaleBookings = async (): Promise<number> => {
    return withTransaction(async (client) => {
        const stale = await client.query<{
            event_id: number | null;
            quantity: number;
        }>(`
            SELECT event_id, quantity
            FROM bookings
            WHERE seat_reserved = TRUE
              AND (
                (status = 'waiting_for_payment' AND payment_deadline IS NOT NULL AND payment_deadline <= NOW())
                OR (status = 'waiting_for_admin_confirmation' AND organizer_deadline IS NOT NULL AND organizer_deadline <= NOW())
              )
            FOR UPDATE
        `);

        if (!stale.rowCount) return 0;

        await client.query(`
            UPDATE bookings
            SET status = 'expired', seat_reserved = FALSE, updated_at = NOW()
            WHERE seat_reserved = TRUE
              AND (
                (status = 'waiting_for_payment' AND payment_deadline IS NOT NULL AND payment_deadline <= NOW())
                OR (status = 'waiting_for_admin_confirmation' AND organizer_deadline IS NOT NULL AND organizer_deadline <= NOW())
              )
        `);

        const restoredSeats = new Map<number, number>();
        for (const booking of stale.rows) {
            if (!booking.event_id) continue;
            restoredSeats.set(
                booking.event_id,
                (restoredSeats.get(booking.event_id) || 0) + booking.quantity
            );
        }

        for (const [eventId, quantity] of restoredSeats) {
            await client.query(`
                UPDATE events
                SET available_seats = LEAST(total_seats, available_seats + $2), updated_at = NOW()
                WHERE id = $1
            `, [eventId, quantity]);
        }

        return stale.rowCount;
    });
};
