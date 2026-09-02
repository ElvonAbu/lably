import { useState, useRef, useEffect } from "react";
import "./Navbar.css";
import { Link } from "react-router-dom";

function Navbar({ hideGetStarted = false }) {

    const [menuOpen, setMenuOpen] = useState(false);

    const navRef = useRef(null);

    useEffect(() => {

        function handleClickOutside(e) {

            if (navRef.current && !navRef.current.contains(e.target)) {

                setMenuOpen(false);

            }

        }

        if (menuOpen) {

            document.addEventListener("mousedown", handleClickOutside);

        }

        return () => {

            document.removeEventListener("mousedown", handleClickOutside);

        };

    }, [menuOpen]);

    return (

        <header className="navbar" ref={navRef}>


            <div className={hideGetStarted ? "navbar-container navbar-container--no-cta" : "navbar-container"}>


                {/* LOGO */}

                <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>


                    <div className="navbar-logo-icon">

                        <span className="logo-circle circle-one"></span>
                        <span className="logo-circle circle-two"></span>
                        <span className="logo-circle circle-three"></span>
                        <span className="logo-circle circle-four"></span>

                    </div>


                    <div className="navbar-logo-text">

                        <span className="logo-lab">
                            LABLY
                        </span>

                    </div>


                </Link>




                {/* DESKTOP NAVIGATION */}

                <nav 
                    className={
                        menuOpen 
                        ? "navbar-links active"
                        : "navbar-links"
                    }
                >

                    <a href="/" onClick={() => setMenuOpen(false)}>
                        Home
                    </a>

                    <a href="#" onClick={() => setMenuOpen(false)}>
                        About Us
                    </a>

                    <a href="#" onClick={() => setMenuOpen(false)}>
                        Testimonials
                    </a>

                </nav>





                {/* DESKTOP BUTTON */}

                {!hideGetStarted && (

                    <Link to="/signup" className="navbar-btn">
                       Get Started
                     </Link>

                )}





                {/* MOBILE MENU BUTTON */}

                <button

                    className={
                        menuOpen
                        ? "navbar-toggle active"
                        : "navbar-toggle"
                    }

                    onClick={()=>
                        setMenuOpen(!menuOpen)
                    }

                    aria-label="Toggle navigation menu"

                    aria-expanded={menuOpen}

                >

                    <span></span>
                    <span></span>
                    <span></span>


                </button>



            </div>


        </header>

    );
}


export default Navbar;