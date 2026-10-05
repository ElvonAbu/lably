import { useState, useRef, useEffect } from "react";

import "./FloatingButtons.css";
import { Icon } from "@iconify/react";
// import TestTubeIcon from "../../icons/TestTubeIcon"; // reserved for later use elsewhere

function FloatingButtons({ variant = "home", onBack, onMenu, menuItems = [] }) {

    const [menuOpen, setMenuOpen] = useState(false);

    const wrapperRef = useRef(null);

    useEffect(() => {

        function handleClickOutside(event) {

            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target)
            ) {

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

    const handleHamburgerClick = () => {

        if (menuItems.length > 0) {

            setMenuOpen((prev) => !prev);

            return;

        }

        if (onMenu) onMenu();

    };

    return (

        <>

            {variant === "search" && (

                <button
                    className="map-floating-btn map-back-btn"
                    aria-label="Go back"
                    onClick={onBack}
                >

                    <Icon
                        icon="mdi:arrow-left"
                        width="22"
                    />

                </button>

            )}

            <div className="fb-menu-wrapper" ref={wrapperRef}>

                <button

                    className={
                        menuOpen
                            ? "map-floating-btn map-logo-btn fb-hamburger active"
                            : "map-floating-btn map-logo-btn fb-hamburger"
                    }

                    aria-label="Menu"

                    aria-expanded={menuOpen}

                    onClick={handleHamburgerClick}

                >

                    <Icon
                        icon={menuOpen ? "mdi:close" : "material-symbols:menu-rounded"}
                        width="24"
                        className="fb-hamburger-icon"
                    />

                </button>

                {menuOpen && menuItems.length > 0 && (

                    <div className="fb-menu-panel">

                        <ul className="fb-menu-list">

                            {menuItems.map((item, index) => (

                                <li key={index}>

                                    <button

                                        type="button"

                                        className="fb-menu-item"

                                        disabled={item.disabled}

                                        onClick={() => {

                                            item.onClick?.();

                                            setMenuOpen(false);

                                        }}

                                    >

                                        {item.disabled && item.loadingLabel
                                            ? item.loadingLabel
                                            : item.label}

                                    </button>

                                </li>

                            ))}

                        </ul>

                    </div>

                )}

            </div>

        </>

    );

}

export default FloatingButtons;