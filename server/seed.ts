import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, initializeDatabase, withTransaction } from './db';

const users = [
    { name: 'Admin User', email: 'admin@eventhub.test', role: 'admin' },
    { name: 'Demo User', email: 'user@eventhub.test', role: 'user' },
    { name: 'Alice Smith', email: 'alice@eventhub.test', role: 'user' },
    { name: 'Bob Johnson', email: 'bob@eventhub.test', role: 'user' },
    { name: 'Charlie Dave', email: 'charlie@eventhub.test', role: 'user' },
    { name: 'Diana Prince', email: 'diana@eventhub.test', role: 'user' },
    { name: 'Ethan Hunt', email: 'ethan@eventhub.test', role: 'user' },
    { name: 'Fiona Gallagher', email: 'fiona@eventhub.test', role: 'user' },
    { name: 'George Miller', email: 'george@eventhub.test', role: 'user' },
    { name: 'Hannah Montana', email: 'hannah@eventhub.test', role: 'user' }
];

const events = [
    {
        title: 'React & Node.js Developer Retreat',
        description: 'Join us for a 3-day deep dive into modern full-stack web development. Perfect for developers looking to take their skills to the next level.',
        days: 10,
        location: 'Silicon Valley Innovation Center, CA',
        category: 'Technology',
        totalSeats: 200,
        ticketPrice: 0,
        image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Neon Nights EDM Festival',
        description: 'Experience an unforgettable night of EDM, techno, and dazzling light shows with top DJs from around the globe.',
        days: 20,
        location: 'Grand Arena, New York',
        category: 'Music',
        totalSeats: 500,
        ticketPrice: 350_000,
        image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Global Leaders Business Summit',
        description: 'A premium gathering of CEOs, founders, and investors discussing the future of global commerce and AI integration.',
        days: 15,
        location: 'The Ritz-Carlton, London',
        category: 'Business',
        totalSeats: 150,
        ticketPrice: 250_000,
        image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Modern Art Expo 2024',
        description: 'Discover breathtaking contemporary and modern arts from underground and trending artists this season.',
        days: 5,
        location: 'Downtown Art Museum',
        category: 'Art',
        totalSeats: 300,
        ticketPrice: 100_000,
        image: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Startup Pitch & Pitch Competition',
        description: 'Watch 25 startups pitch for 1 million dollars in seed funding. Great networking for entrepreneurs and angel investors.',
        days: 30,
        location: 'Convention Center, Miami',
        category: 'Business',
        totalSeats: 250,
        ticketPrice: 150_000,
        image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800'
    },
    {
        title: 'Cloud Computing Architecture Seminar',
        description: 'A purely technical breakdown of scalable cloud solutions, multi-region routing, and serverless compute processing.',
        days: 12,
        location: 'Tech Hub, Seattle',
        category: 'Technology',
        totalSeats: 100,
        ticketPrice: 125_000,
        image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800'
    }
];

/** Mengisi akun, event, dan booking contoh tanpa menghapus data yang sudah ada. */
const seedDatabase = async () => {
    try {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Seed demo hanya boleh dijalankan di development, bukan production.');
        }
        await initializeDatabase();
        await withTransaction(async (client) => {
            const password = await bcrypt.hash('password123', 10);
            const createdUsers = [];
            for (const user of users) {
                const result = await client.query(
                    `INSERT INTO users (name, email, password, role, is_verified)
                     VALUES ($1, $2, $3, $4, TRUE)
                     ON CONFLICT (email) DO NOTHING
                     RETURNING id, role`,
                    [user.name, user.email, password, user.role]
                );
                if (result.rows[0]) {
                    createdUsers.push(result.rows[0]);
                    continue;
                }

                const existing = await client.query(
                    `UPDATE users
                     SET name = $1, password = $2, role = $3, is_verified = TRUE, updated_at = NOW()
                     WHERE email = $4
                     RETURNING id, role`,
                    [user.name, password, user.role, user.email]
                );
                createdUsers.push(existing.rows[0]);
            }

            const adminUser = createdUsers.find((user) => user.role === 'admin');
            const normalUsers = createdUsers.filter((user) => user.role === 'user');
            const eventRows = [];
            for (const event of events) {
                const existing = await client.query(
                    'SELECT id FROM events WHERE title = $1 AND is_deleted = FALSE ORDER BY id LIMIT 1',
                    [event.title]
                );
                const created = existing.rowCount
                    ? await client.query(
                        'UPDATE events SET ticket_price = $1 WHERE id = $2 RETURNING id',
                        [event.ticketPrice, existing.rows[0].id]
                    )
                    : await client.query(
                    `INSERT INTO events
                        (title, description, date, end_date, location, category, total_seats,
                         available_seats, ticket_price, image, created_by)
                     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'),
                             NOW() + ($3 * INTERVAL '1 day') + INTERVAL '1 day',
                             $4, $5, $6, $6, $7, $8, $9)
                     RETURNING id`,
                    [
                        event.title, event.description, event.days, event.location,
                        event.category, event.totalSeats, event.ticketPrice, event.image, adminUser.id
                    ]
                );
                eventRows.push({ id: created.rows[0].id, event });
            }

            for (const [eventIndex, { id: eventId, event }] of eventRows.entries()) {
                for (const [userIndex, user] of normalUsers.slice(0, 3).entries()) {
                    const existingBooking = await client.query(
                        'SELECT id FROM bookings WHERE user_id = $1 AND event_id = $2 LIMIT 1',
                        [user.id, eventId]
                    );
                    if (existingBooking.rowCount) continue;

                    const status = userIndex === 2 ? 'waiting_for_payment' : 'done';
                    const paymentStatus = status === 'done' ? 'paid' : 'not_paid';
                    const booking = await client.query(
                        `INSERT INTO bookings
                            (user_id, event_id, status, payment_status, amount, seat_reserved, payment_deadline)
                         SELECT $1, $2, $3, $4, $5, TRUE,
                                CASE WHEN $3 = 'waiting_for_payment' THEN NOW() + INTERVAL '2 hours' ELSE NULL END
                         WHERE EXISTS (SELECT 1 FROM events WHERE id = $2 AND available_seats > 0)
                         RETURNING id`,
                        [user.id, eventId, status, paymentStatus, event.ticketPrice]
                    );
                    if (booking.rowCount) {
                        await client.query(
                            'UPDATE events SET available_seats = GREATEST(available_seats - 1, 0) WHERE id = $1',
                            [eventId]
                        );
                    }
                }
            }
        });

        console.log('EventHub demo data added. Existing bookings and non-demo data were preserved.');
        console.log('Admin: admin@eventhub.test');
        console.log('User:  user@eventhub.test');
        console.log('Password for all users: password123');
    } catch (error) {
        console.error('Error seeding PostgreSQL database:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
};

seedDatabase();
