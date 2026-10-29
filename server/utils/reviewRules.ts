interface ReviewBooking {
    status: string;
    hasAttended: boolean;
}

/** Hanya booking selesai untuk event yang telah berakhir yang dapat menulis ulasan. */
export const canReviewEvent = (bookings: ReviewBooking[]): boolean =>
    bookings.some((booking) => booking.status === 'done' && booking.hasAttended);
