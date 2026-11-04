import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import api from '../utils/axios';
import type { EventItem } from '../types';
import { formatEventSchedule } from '../utils/eventSchedule';

interface OrganizerSummary {
    _id: number | string;
    name: string;
    profileImage?: string;
    rating: number;
    reviewCount: number;
    eventCount: number;
    events: EventItem[];
    reviews: OrganizerReview[];
}

interface OrganizerReview {
    _id: number | string;
    rating: number;
    comment: string;
    createdAt: string;
    user: { name: string; profileImage?: string };
    event: { _id: number | string; title: string };
}

/** Memperlihatkan reputasi organizer dan event publik yang diselenggarakan. */
const OrganizerProfile = () => {
    const { id } = useParams();
    const [organizer, setOrganizer] = useState<OrganizerSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const eventsViewport = useRef<HTMLDivElement>(null);
    const [canScrollEventsBack, setCanScrollEventsBack] = useState(false);
    const [canScrollEventsForward, setCanScrollEventsForward] = useState(false);

    const updateEventScrollControls = () => {
        const viewport = eventsViewport.current;
        if (!viewport) return;
        setCanScrollEventsBack(viewport.scrollLeft > 1);
        setCanScrollEventsForward(viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1);
    };

    useEffect(() => {
        if (!id) return;
        let active = true;
        setLoading(true);
        setError('');
        api.get(`/events/organizers/${id}`)
            .then(({ data }) => {
                if (active) setOrganizer(data);
            })
            .catch((caught) => {
                if (active) setError(caught.response?.data?.message || 'Profil organizer belum dapat dimuat.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [id]);

    useEffect(() => {
        const viewport = eventsViewport.current;
        if (!viewport) return;

        updateEventScrollControls();
        const observer = new ResizeObserver(updateEventScrollControls);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [organizer?.events]);

    const scrollEvents = (direction: -1 | 1) => {
        const viewport = eventsViewport.current;
        if (viewport) viewport.scrollBy({ left: direction * viewport.clientWidth, behavior: 'smooth' });
    };

    if (loading) return <div className="page-message">Memuat profil organizer…</div>;
    if (!organizer) return <div className="page-message">{error || 'Organizer tidak ditemukan.'}</div>;

    return (
        <div className="mx-auto max-w-6xl">
            <section className="dashboard-hero">
                <div className="flex items-center gap-4">
                    <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-white/15 text-2xl font-bold text-white">
                        {organizer.profileImage ? <img src={organizer.profileImage} alt="" className="h-full w-full object-cover" /> : organizer.name[0]}
                    </div>
                    <div>
                        <span className="eyebrow text-white/70">PROFIL ORGANIZER</span>
                        <h1 className="mt-1 text-3xl font-extrabold text-white">{organizer.name}</h1>
                        <p className="mt-1 text-sm text-white/75">★ {Number(organizer.rating).toFixed(1)} · {organizer.reviewCount} ulasan · {organizer.eventCount} event</p>
                    </div>
                </div>
            </section>
            <section className="mt-8">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <h2 className="text-2xl font-extrabold text-slate-900">Event dari organizer ini</h2>
                    {(canScrollEventsBack || canScrollEventsForward) && (
                        <div className="flex shrink-0 gap-2">
                            <button
                                type="button"
                                onClick={() => scrollEvents(-1)}
                                disabled={!canScrollEventsBack}
                                aria-label="Event sebelumnya"
                                title="Event sebelumnya"
                                className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <FaChevronLeft aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => scrollEvents(1)}
                                disabled={!canScrollEventsForward}
                                aria-label="Event berikutnya"
                                title="Event berikutnya"
                                className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <FaChevronRight aria-hidden="true" />
                            </button>
                        </div>
                    )}
                </div>
                {!organizer.events.length ? <p className="surface-card p-7 text-sm text-slate-500">Organizer ini belum memiliki event aktif.</p> :
                    <div ref={eventsViewport} onScroll={updateEventScrollControls} className="organizer-events-viewport">
                        <div className="organizer-events-track">
                            {organizer.events.map((event) => (
                                <Link to={`/events/${event._id}`} key={event._id} className="organizer-event-card surface-card overflow-hidden transition hover:-translate-y-1 hover:shadow-lg">
                                    <img src={event.image} alt="" className="h-44 w-full object-cover" />
                                    <div className="p-5">
                                        <span className="eyebrow">{event.category}</span>
                                        <h3 className="mt-2 font-bold text-slate-900">{event.title}</h3>
                                        <p className="mt-2 text-sm text-slate-500">{formatEventSchedule(event.date, event.endDate)} · {event.location}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                }
            </section>
            <section className="mt-10">
                <h2 className="mb-5 text-2xl font-extrabold text-slate-900">Ulasan peserta</h2>
                {!organizer.reviews.length ? <p className="surface-card p-7 text-sm text-slate-500">Belum ada ulasan untuk event organizer ini.</p> :
                    <div className="space-y-4">
                        {organizer.reviews.map((review) => (
                            <article key={review._id} className="surface-card p-5 md:p-6">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <strong className="text-slate-900">{review.user.name}</strong>
                                        <p className="mt-1 text-sm text-slate-500">
                                            Untuk <Link to={`/events/${review.event._id}`} className="font-semibold text-violet-700 hover:underline">{review.event.title}</Link>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-amber-500" aria-label={`${review.rating} dari 5 bintang`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                                        <p className="mt-1 text-xs text-slate-400">{new Date(review.createdAt).toLocaleDateString('id-ID')}</p>
                                    </div>
                                </div>
                                {review.comment && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">{review.comment}</p>}
                            </article>
                        ))}
                    </div>
                }
            </section>
        </div>
    );
};

export default OrganizerProfile;
