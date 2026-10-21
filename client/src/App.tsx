import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import EventDetail from './pages/EventDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentFailed from './pages/PaymentFailed';
import OrganizerProfile from './pages/OrganizerProfile';

/** Mengatur routing utama untuk halaman publik, akun, dashboard, dan pembayaran. */
function App() {
    return (
        <Router>
            <div className="min-h-screen flex flex-col">
                <Navbar />
                <main className="flex-grow px-4 py-7 sm:px-6 lg:px-8">
                    <Routes>
                        <Route path="/" element={<Home />} />
                    </Routes>
                </main>
                <footer className="site-footer px-4 py-7 text-center text-sm text-slate-500">
                    EventHub · Temukan pengalaman berikutnya, bersama komunitasmu.
                </footer>
            </div>
        </Router>
    );
}

export default App;
