import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaBars, FaCalendarAlt, FaTicketAlt, FaTimes } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';
import { countUnseenCoupons } from '../utils/couponNotifications';

/** Menyediakan navigasi responsif dan pintasan yang sesuai dengan peran akun. */
const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [unseenCoupons, setUnseenCoupons] = useState(0);
    const dashboardPath = user && ['it', 'admin', 'organizer'].includes(user.role) ? '/admin' : '/dashboard';
    const isCustomer = user?.role === 'user' || user?.role === 'customer';

    useEffect(() => {
        if (!user || !isCustomer) {
            setUnseenCoupons(0);
            return;
        }

        const refreshCoupons = async () => {
            try {
                const { data } = await api.get('/auth/profile');
                setUnseenCoupons(countUnseenCoupons(user._id, data.coupons || []));
            } catch {
                // Keep the last known badge count when the API is temporarily unavailable.
            }
        };
        const handleCouponsSeen = (event: Event) => {
            const eventUserId = (event as CustomEvent<{ userId: string }>).detail.userId;
            if (eventUserId === String(user._id)) setUnseenCoupons(0);
        };

        void refreshCoupons();
        const refreshTimer = window.setInterval(() => void refreshCoupons(), 60_000);
        window.addEventListener('focus', refreshCoupons);
        window.addEventListener('eventhub:coupons-seen', handleCouponsSeen);
        return () => {
            window.clearInterval(refreshTimer);
            window.removeEventListener('focus', refreshCoupons);
            window.removeEventListener('eventhub:coupons-seen', handleCouponsSeen);
        };
    }, [user?._id, isCustomer, location.pathname]);

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
                            <NavLink to="/settings" onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                                Pengaturan
                            </NavLink>
                            {isCustomer && (
                                <NavLink to="/coupons" onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
                                    <span className="inline-flex items-center gap-2">
                                        Kupon Saya
                                        {unseenCoupons > 0 && <span className="coupon-notification-badge" aria-label={`${unseenCoupons} kupon baru`}>{unseenCoupons > 9 ? '9+' : unseenCoupons}</span>}
                                    </span>
                                </NavLink>
                            )}
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
