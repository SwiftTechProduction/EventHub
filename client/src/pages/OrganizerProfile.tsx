import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../utils/axios';
import type { EventItem } from '../types';
import { formatEventSchedule } from '../utils/eventSchedule';

interface OrganizerSummary {
    _id: number | string;
    name: string;
    profileImage: string;
    rating: number;
    reviewCount: number;
    eventCount: number;
}

/** Memperlihatkan reputasi organizer dan event publik yang diselenggarakan. */
const OrganizerProfile = () => {
    const { id } = useParams();
    const [organizer, setOrganizer] = useState<OrganizerSummary | null>(null);
    const [events, setEvents] = useState<EventItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!id) return;
        Promise.all([api.get(`/events/organizers/${id}`), api.get('/events')])
            .then(([organizerResponse, eventResponse]) => {
                setOrganizer(organizerResponse.data);
                setEvents(eventResponse.data.filter((event: EventItem) => String(event.organizer?._id) === id));
            })
            .catch((caught) => setError(caught.response?.data?.message || 'Profil organizer belum dapat dimuat.'))
            .finally(() => setLoading(false));
    }, [id]);

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
                <h2 className="mb-5 text-2xl font-extrabold text-slate-900">Event dari organizer ini</h2>
                {!events.length ? <p className="surface-card p-7 text-sm text-slate-500">Saat ini belum ada event mendatang.</p> :
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {events.map((event) => (
                            <Link to={`/events/${event._id}`} key={event._id} className="surface-card overflow-hidden transition hover:-translate-y-1 hover:shadow-lg">
                                <img src={event.image} alt="" className="h-44 w-full object-cover" />
                                <div className="p-5">
                                    <span className="eyebrow">{event.category}</span>
                                    <h3 className="mt-2 font-bold text-slate-900">{event.title}</h3>
                                    <p className="mt-2 text-sm text-slate-500">{formatEventSchedule(event.date, event.endDate)} · {event.location}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                }
            </section>
        </div>
    );
};

export default OrganizerProfile;
