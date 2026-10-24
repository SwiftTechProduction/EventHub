import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaArrowRight,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaSearch,
  FaTicketAlt,
} from "react-icons/fa";
import api from "../utils/axios";
import type { EventItem } from "../types";
import { formatRupiah } from "../utils/currency";

const categories = [
  { label: "Semua kategori", value: "" },
  { label: "Musik", value: "Musik" },
  { label: "Teknologi", value: "Teknologi" },
  { label: "Bisnis", value: "Bisnis" },
  { label: "Seni", value: "Seni" },
  { label: "Olahraga", value: "Olahraga" },
  { label: "Kuliner", value: "Kuliner" },
  { label: "Pendidikan", value: "Pendidikan" },
];

/** Menampilkan katalog EventHub dengan pencarian jeda, kategori, dan lokasi. */
const Home = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [searchInput, setSearchInput] = useState(""); //Menyimpan apa yang sedang di ketik di input box
  const [search, setSearch] = useState(""); //Menyimpan kata kunci yang dikirimkan ke API setelah jeda
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /** Menunda pencarian singkat agar API tidak dipanggil pada setiap ketikan. */
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  /** Meminta hasil event saat kata kunci, kategori, atau lokasi berubah. */
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/events", {
          params: {
            search,
            category: category || undefined,
            location: location.trim() || undefined,
          },
        });
        setEvents(data);
      } catch (caught) {
        setError(
          caught.response?.data?.message ||
            "Event belum dapat dimuat. Periksa koneksi server.",
        );
      } finally {
        setLoading(false);
      }
    };
    void fetchEvents();
  }, [search, category, location]);

  /** Menghitung jumlah event gratis untuk ringkasan hasil pencarian. */
  const freeEvents = useMemo(
    () => events.filter((event) => event.ticketPrice === 0).length,
    [events],
  );

  return (
    <div className="mx-auto max-w-7xl">
      {/*Menampung pencarian. */}
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#211c34] px-6 py-14 text-white shadow-2xl sm:px-10 md:py-20 lg:px-16">
        <div className="absolute -right-20 -top-36 -z-10 h-96 w-96 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 -z-10 h-96 w-96 rounded-full bg-violet-500/35 blur-3xl" />
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_350px]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold tracking-wide text-violet-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> TEMPAT
              CERITA BARU DIMULAI
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Temukan event yang bikin harimu{" "}
              <span className="text-fuchsia-300">berbeda.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 md:text-lg">
              Dari konser intim sampai ide-ide besar, jelajahi pengalaman seru
              yang mempertemukanmu dengan orang dan hal baru.
            </p>
            <a
              href="#daftar-event"
              className="mt-7 inline-flex items-center gap-2 font-bold text-white hover:text-fuchsia-200">
              Lihat event pilihan <FaArrowRight />
            </a>
          </div>
          <aside className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur-xl sm:p-6">
            <span className="eyebrow text-fuchsia-200">MULAI JELAJAHI</span>
            <label
              className="mt-4 block text-sm font-semibold text-white/80"
              htmlFor="search-events">
              Nama event atau topik
            </label>
            <div className="relative mt-2">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-violet-300" />
              <input
                id="search-events"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Misalnya: festival musik"
                className="w-full rounded-xl border border-white/15 bg-white/10 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-fuchsia-300"
              />
            </div>
            <label
              className="mt-4 block text-sm font-semibold text-white/80"
              htmlFor="search-location">
              Kota atau lokasi
            </label>
            <div className="relative mt-2">
              <FaMapMarkerAlt className="absolute left-4 top-1/2 -translate-y-1/2 text-violet-300" />
              <input
                id="search-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Cari berdasarkan lokasi"
                className="w-full rounded-xl border border-white/15 bg-white/10 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-fuchsia-300"
              />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-4 text-xs text-white/65">
              <span>{events.length} event ditemukan</span>
              <span>{freeEvents} event gratis</span>
            </div>
          </aside>
        </div>
      </section>

      {/* Kategori ditampilkan sebagai chip agar filter mudah digunakan di ponsel. */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">PILIH SUASANAMU</span>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
              Jelajahi kategori
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Cari sesuai minat dan waktumu.
          </p>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {categories.map(({ label, value }) => {
            const active = category === value;
            return (
              <button
                key={label}
                onClick={() => setCategory(value)}
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition ${active ? "bg-violet-700 text-white shadow-lg shadow-violet-200" : "border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Daftar event memprioritaskan foto, harga IDR, waktu, dan ketersediaan tiket. */}
      <section id="daftar-event" className="mt-8 scroll-mt-28">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="eyebrow">PILIHAN UNTUKMU</span>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
              Event mendatang
            </h2>
          </div>
          <span className="text-sm text-slate-500">{events.length} hasil</span>
        </div>
        {error && (
          <p role="alert" className="notice notice-error">
            {error}
          </p>
        )}
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="surface-card h-80 animate-pulse bg-slate-100"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="surface-card px-6 py-16 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-xl text-violet-600">
              <FaSearch />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">
              Belum ada event yang cocok
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Coba kata kunci lain atau hapus filter kategori dan lokasi.
            </p>
            <button
              onClick={() => {
                setSearchInput("");
                setCategory("");
                setLocation("");
              }}
              className="button-secondary mt-5">
              Hapus semua filter
            </button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <Link
                key={event._id}
                to={`/events/${event._id}`}
                className="surface-card group overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className="relative h-56 overflow-hidden bg-gradient-to-br from-violet-100 to-fuchsia-100">
                  {event.image ? (
                    <img
                      src={event.image}
                      alt={event.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-5xl font-black text-violet-300">
                      {event.category.slice(0, 1)}
                    </div>
                  )}
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-violet-800 backdrop-blur">
                    {event.category}
                  </span>
                  <span className="absolute bottom-4 right-4 rounded-xl bg-[#201a35]/90 px-3 py-2 text-sm font-extrabold text-white backdrop-blur">
                    {event.ticketPrice === 0
                      ? "GRATIS"
                      : formatRupiah(event.ticketPrice)}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="line-clamp-2 min-h-14 text-lg font-extrabold leading-7 text-slate-900">
                    {event.title}
                  </h3>
                  <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <FaCalendarAlt className="text-violet-500" />
                    {new Date(event.date).toLocaleDateString("id-ID", {
                      dateStyle: "medium",
                    })}
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    <FaMapMarkerAlt className="text-violet-500" />
                    {event.location}
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span
                      className={`text-xs font-semibold ${event.availableSeats < 10 ? "text-amber-700" : "text-slate-500"}`}>
                      <FaTicketAlt className="mr-1 inline" />
                      {event.availableSeats} tiket tersedia
                    </span>
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-violet-50 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white">
                      <FaArrowRight className="text-xs" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
