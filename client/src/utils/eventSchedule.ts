/** Menampilkan tanggal dan jam mulai serta selesai event dalam zona waktu lokal. */
export const formatEventSchedule = (startDate: string, endDate?: string | null): string => {
    const start = new Date(startDate);
    const formattedStart = start.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    if (!endDate) return formattedStart;

    const end = new Date(endDate);
    if (start.getTime() === end.getTime()) return formattedStart;
    return `${formattedStart} – ${end.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`;
};
