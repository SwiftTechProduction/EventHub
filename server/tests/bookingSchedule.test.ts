import assert from 'node:assert/strict';
import test from 'node:test';
import { findOverlappingEvents } from '../utils/bookingSchedule';

const candidate = {
    date: '2026-11-01T10:00:00.000Z',
    endDate: '2026-11-01T12:00:00.000Z'
};

test('jadwal yang beririsan ditemukan, termasuk yang mulai sebelum event baru', () => {
    const conflicts = findOverlappingEvents(candidate, [
        { title: 'Mulai lebih awal', date: '2026-11-01T09:30:00.000Z', endDate: '2026-11-01T10:30:00.000Z' },
        { title: 'Beririsan di akhir', date: '2026-11-01T11:30:00.000Z', endDate: '2026-11-01T13:00:00.000Z' },
        { title: 'Tidak bertabrakan', date: '2026-11-01T12:00:00.000Z', endDate: '2026-11-01T13:00:00.000Z' }
    ]);

    assert.deepEqual(conflicts.map((event) => event.title), ['Mulai lebih awal', 'Beririsan di akhir']);
});

test('tanggal yang sama tanpa jam bertabrakan tidak memicu warning', () => {
    const conflicts = findOverlappingEvents(candidate, [
        { title: 'Pagi', date: '2026-11-01T07:00:00.000Z', endDate: '2026-11-01T09:00:00.000Z' },
        { title: 'Malam', date: '2026-11-01T12:00:00.000Z', endDate: '2026-11-01T14:00:00.000Z' }
    ]);

    assert.deepEqual(conflicts, []);
});

test('event yang jadwalnya melewati tengah malam terdeteksi saat rentangnya bertabrakan', () => {
    const conflicts = findOverlappingEvents(
        { date: '2026-11-02T00:30:00.000Z', endDate: '2026-11-02T02:00:00.000Z' },
        [{ title: 'Event malam', date: '2026-11-01T23:00:00.000Z', endDate: '2026-11-02T01:00:00.000Z' }]
    );

    assert.equal(conflicts.length, 1);
});
