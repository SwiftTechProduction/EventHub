export interface ScheduledEvent {
    date: string | Date;
    endDate?: string | Date | null;
}

const getScheduleRange = (event: ScheduledEvent): [number, number] => {
    const start = new Date(event.date).getTime();
    const end = new Date(event.endDate || event.date).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        throw new Error('Jadwal event tidak valid.');
    }
    return [start, end];
};

/** Mengembalikan event yang rentang waktunya benar-benar beririsan. */
export const findOverlappingEvents = <T extends ScheduledEvent>(
    candidate: ScheduledEvent,
    events: T[]
): T[] => {
    const [candidateStart, candidateEnd] = getScheduleRange(candidate);
    return events.filter((event) => {
        const [eventStart, eventEnd] = getScheduleRange(event);
        return eventStart < candidateEnd && eventEnd > candidateStart;
    });
};
