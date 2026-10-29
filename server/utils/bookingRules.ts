/** Status transaksi yang digunakan API, database, dan halaman dashboard. */
export const BOOKING_STATUSES = [
    'waiting_for_payment',
    'waiting_for_admin_confirmation',
    'done',
    'rejected',
    'expired',
    'canceled'
] as const;

/** Menghitung diskon tanpa membiarkan harga akhir menjadi angka negatif. */
export const calculateDiscount = (
    subtotal: number,
    discountType: 'percent' | 'fixed',
    discountValue: number
): number => {
    if (!Number.isFinite(subtotal) || subtotal <= 0 || !Number.isFinite(discountValue) || discountValue <= 0) {
        return 0;
    }
    const discount = discountType === 'percent'
        ? subtotal * Math.min(discountValue, 100) / 100
        : discountValue;
    return Math.min(Math.round(discount * 100) / 100, subtotal);
};

/** Memecah pemakaian poin dari kredit terdekat kedaluwarsa agar refund tepat. */
export const planPointAllocations = (
    credits: Array<{ id: number | string; remaining: number }>,
    amount: number
): Array<{ creditId: number | string; amount: number }> => {
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Jumlah poin harus bilangan bulat non-negatif.');
    let unallocated = amount;
    const allocations: Array<{ creditId: number | string; amount: number }> = [];
    for (const credit of credits) {
        if (!Number.isFinite(credit.remaining) || credit.remaining <= 0) continue;
        const allocated = Math.min(unallocated, credit.remaining);
        if (allocated > 0) allocations.push({ creditId: credit.id, amount: allocated });
        unallocated -= allocated;
        if (!unallocated) break;
    }
    if (unallocated > 0) throw new RangeError('Saldo poin tidak mencukupi.');
    return allocations;
};

/** Memilih status akhir transaksi yang melewati batas pembayaran atau konfirmasi. */
export const getExpiredBookingStatus = (
    status: string,
    paymentDeadline: Date | string | null,
    organizerDeadline: Date | string | null,
    now = Date.now()
): 'expired' | 'canceled' | null => {
    if (
        status === 'waiting_for_payment' &&
        paymentDeadline &&
        new Date(paymentDeadline).getTime() <= now
    ) {
        return 'expired';
    }
    if (
        status === 'waiting_for_admin_confirmation' &&
        organizerDeadline &&
        new Date(organizerDeadline).getTime() <= now
    ) {
        return 'canceled';
    }
    return null;
};
