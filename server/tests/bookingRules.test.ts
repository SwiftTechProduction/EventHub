import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateDiscount,
    canApplyDiscountToTicket,
    getExpiredBookingStatus,
    planPointAllocations
} from '../utils/bookingRules';

/** Memastikan diskon tetap berada dalam rentang harga yang bisa dibayar. */
test('diskon persentase dan nominal tidak mengurangi harga di bawah nol', () => {
    assert.equal(calculateDiscount(300_000, 'percent', 10), 30_000);
    assert.equal(calculateDiscount(300_000, 'fixed', 400_000), 300_000);
    assert.equal(calculateDiscount(300_000, 'percent', 150), 300_000);
    assert.equal(calculateDiscount(0, 'fixed', 100_000), 0);
    assert.equal(canApplyDiscountToTicket(0, 0), false);
    assert.equal(canApplyDiscountToTicket(100_000, 0), false);
    assert.equal(canApplyDiscountToTicket(100_000, 100_000), true);
});

/** Memastikan transaksi hanya expired setelah melewati tenggat yang sesuai. */
test('status otomatis mengikuti tenggat pembayaran dan konfirmasi', () => {
    const now = Date.parse('2026-10-16T00:00:00.000Z');
    assert.equal(getExpiredBookingStatus('waiting_for_payment', '2026-10-15T23:00:00.000Z', null, now), 'expired');
    assert.equal(getExpiredBookingStatus('waiting_for_admin_confirmation', null, '2026-10-15T23:00:00.000Z', now), 'canceled');
    assert.equal(getExpiredBookingStatus('waiting_for_payment', '2026-10-16T01:00:00.000Z', null, now), null);
    assert.equal(getExpiredBookingStatus('done', null, null, now), null);
});

/** Memastikan poin menggunakan kredit yang paling dekat dengan masa habis. */
test('pemakaian poin mengambil kredit berurutan dan menolak saldo kurang', () => {
    assert.deepEqual(
        planPointAllocations([{ id: 10, remaining: 3000 }, { id: 11, remaining: 8000 }], 5000),
        [{ creditId: 10, amount: 3000 }, { creditId: 11, amount: 2000 }]
    );
    assert.throws(() => planPointAllocations([{ id: 10, remaining: 2 }], 3), /Saldo poin tidak mencukupi/);
    assert.throws(() => planPointAllocations([], -1), /bilangan bulat non-negatif/);
});
