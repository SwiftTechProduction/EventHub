import { Link, NavLink, useNavigate } from 'react-router-dom';
import { FaCalendarAlt, FaTicketAlt } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

/** Menyediakan navigasi responsif dan pintasan yang sesuai dengan peran akun. */
const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const dashboardPath = user && ['it', 'admin', 'organizer'].includes(user.role) ? '/admin' : '/dashboard';

    /** Mengakhiri sesi lokal sebelum mengembalikan pengguna ke halaman publik. */
    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <header className="site-header">
            <div className="site-header-inner mx-auto w-full max-w-7xl px-4 sm:px-6">
                <Link to="/" className="brand-mark" aria-label="EventHub, beranda">
                    <span className="brand-icon"><FaTicketAlt /></span>
                    <span>Event<span className="text-violet-600">Hub</span></span>
                </Link>
                <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-7" aria-label="Navigasi utama">
                    <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>Jelajahi</NavLink>
                    {user ? (
                        <>
                            <NavLink to={dashboardPath} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                                {['it', 'admin', 'organizer'].includes(user.role)
                                    ? <><FaCalendarAlt className="mr-1 inline" />{user.role === 'it' ? 'Dashboard IT' : 'Dashboard Organizer'}</>
                                    : 'Akun saya'}
                            </NavLink>
                            <button onClick={handleLogout} className="button-primary min-h-9 px-4 py-2 text-xs">Keluar</button>
                        </>
                    ) : (
                        <>
                            <NavLink to="/login" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>Masuk</NavLink>
                            <Link to="/register" className="button-primary min-h-9 px-4 py-2 text-xs">Mulai gratis</Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
};

export default Navbar;
