import { Link, NavLink, useNavigate } from 'react-router-dom';
import { FaCalendarAlt, FaTicketAlt } from 'react-icons/fa';


/** Menyediakan navigasi responsif dan pintasan yang sesuai dengan peran akun. */
const Navbar = () => {
   
    const navigate = useNavigate();
    

    return (
        <header className="site-header">
            <div className="site-header-inner mx-auto w-full max-w-7xl px-4 sm:px-6">
                <Link to="/" className="brand-mark" aria-label="EventHub, beranda">
                    <span className="brand-icon"><FaTicketAlt /></span>
                    <span>Event<span className="text-violet-600">Hub</span></span>
                </Link>
                <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-7" aria-label="Navigasi utama">
                    
                </nav>
            </div>
        </header>
    );
};

export default Navbar;
