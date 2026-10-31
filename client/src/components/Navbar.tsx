import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { FaBars, FaCalendarAlt, FaTicketAlt, FaTimes } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

/** Menyediakan navigasi responsif dan pintasan yang sesuai dengan peran akun. */
const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const dashboardPath = user && ['it', 'admin', 'organizer'].includes(user.role) ? '/admin' : '/dashboard';

    /** Mengakhiri sesi lokal sebelum mengembalikan pengguna ke halaman publik. */
    const handleLogout = () => {
        setMenuOpen(false);
        logout();
        navigate('/');
    };

    const closeMenu = () => setMenuOpen(false);

    return (
        <header className="site-header">
            <div className="site-header-inner mx-auto w-full max-w-7xl px-4 sm:px-6">
                <Link to="/" className="brand-mark" aria-label="EventHub, beranda" onClick={closeMenu}>
                    <span className="brand-icon"><FaTicketAlt /></span>
                    <span>Event<span className="text-violet-600">Hub</span></span>
                </Link>
                <button
                    type="button"
                    className="mobile-menu-toggle"
                    aria-label={menuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
                    aria-expanded={menuOpen}
                    aria-controls="primary-navigation"
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    {menuOpen ? <FaTimes /> : <FaBars />}
                </button>
                <nav
                    id="primary-navigation"
                    className={`primary-navigation${menuOpen ? ' primary-navigation-open' : ''}`}
                    aria-label="Navigasi utama"
                >
                    <NavLink to="/" end onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>Jelajahi</NavLink>
                    {user ? (
                        <>
                            <NavLink to={dashboardPath} onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                                {['it', 'admin', 'organizer'].includes(user.role)
                                    ? <><FaCalendarAlt className="mr-1 inline" />{user.role === 'it' ? 'Dashboard IT' : 'Dashboard Organizer'}</>
                                    : 'Akun saya'}
                            </NavLink>
                            <button onClick={handleLogout} className="button-primary min-h-9 px-4 py-2 text-xs">Keluar</button>
                        </>
                    ) : (
                        <>
                            <NavLink to="/login" onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>Masuk</NavLink>
                            <Link to="/register" onClick={closeMenu} className="button-primary min-h-9 px-4 py-2 text-xs">Mulai gratis</Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
};

export default Navbar;
