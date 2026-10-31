import "./Footer.css";
import { Icon } from "@iconify/react";
import { useState } from "react";
import Logo from "../Logo/Logo";

/*
 * Third-party credits (Creative Commons BY 4.0 requires attribution).
 * To add another credit later, just add an object to this list.
 */
const CREDITS = [
  {
    title: "Modern Scientist in a Lab Coat",
    titleUrl:
      "https://sketchfab.com/3d-models/modern-scientist-in-a-lab-coat-e835a3b126a4463583727dbac2fedecc",
    author: "restore50",
    authorUrl: "https://sketchfab.com/restore50",
    licence: "CC BY 4.0",
    licenceUrl: "http://creativecommons.org/licenses/by/4.0/",
  },
  {
    title: "Young Scientist in a White Lab Coat",
    titleUrl: "https://skfb.ly/pIHW8",
    author: "restore50",
    authorUrl: "https://sketchfab.com/restore50",
    licence: "CC BY 4.0",
    licenceUrl: "http://creativecommons.org/licenses/by/4.0/",
  },
];

function Footer() {

  const [showCredits, setShowCredits] = useState(false);

  return (

    <footer className="footer">

      <div className="container">

        <div className="footer-top">

          {/* Logo */}

          <div className="footer-brand">

          <div className="logo logo-hover-trigger">

  <div className="logo logo-hover-trigger">

  <Logo />

</div>

</div>

            <p>

              Healthcare made simple through
              professional home laboratory services.

            </p>

            <div className="social-links">

              <a href="#">

                <Icon
                  icon="mdi:facebook"
                  width="22"
                />

              </a>

              <a href="#">

                <Icon
                  icon="mdi:instagram"
                  width="22"
                />

              </a>

              <a href="#">

                <Icon
                  icon="mdi:linkedin"
                  width="22"
                />

              </a>

              <a href="#">

                <Icon
                  icon="mdi:twitter"
                  width="22"
                />

              </a>

            </div>

          </div>


          {/* Patient */}

          <div className="footer-column">

            <h3>Patient</h3>

            <a href="#">Sign up</a>

            <a href="#">Cities</a>

            <a href="#">Help</a>

            <a href="#">Safety</a>

            <a href="#">Gift Cards</a>

            <a href="#">Donate</a>

          </div>


          {/* Lab */}

          <div className="footer-column">

            <h3>Lab scientist</h3>

            <a href="Login.jsx">Partner with Us</a>

            <a href="#">New MLS Guide</a>

            <a href="#">Earnings</a>

            <a href="#">Cities</a>

            <a href="#">Help</a>

            <a href="#">Safety</a>

            <a href="#">Application Requirements</a>

            <a href="#">Bonus</a>

            <a href="#">LABLY Rewards</a>

            <a href="#">Insurance</a>

          </div>


          {/* Apps */}

          <div className="footer-column">

            <h3>Apps</h3>

            <a href="Login.jsx">Lab scientist app</a>

            <a href="Login.jsx ">Patient app</a>

          </div>


          {/* Company */}

          <div className="footer-column">

            <h3>Company</h3>

            <a href="#">Terms</a>

            <a href="#">Privacy</a>

            <a href="#">Accessibility Statement</a>

            <a href="#">Your Privacy Choices</a>

          </div>

        </div>

        <div className="footer-bottom">

          <div className="language">

            <Icon
              icon="mdi:web"
              width="20"
            />

            EN

          </div>

          <p>

            © 2026 LABLY, Inc.
            CPUC ID No. TCP0032513-P

          </p>

          <button
            type="button"
            className="footer-credits-toggle"
            aria-expanded={showCredits}
            aria-controls="footer-credits-panel"
            onClick={() => setShowCredits((v) => !v)}
          >
            Credits
          </button>

        </div>

        <div
          id="footer-credits-panel"
          className={`footer-credits ${showCredits ? "is-open" : ""}`}
        >
          <div className="footer-credits-inner">

            <p className="footer-credits-heading">3D models</p>

            <ul>
              {CREDITS.map((c) => (
                <li key={c.title}>
                  <a href={c.titleUrl} target="_blank" rel="noopener noreferrer">
                    “{c.title}”
                  </a>
                  {" "}by{" "}
                  <a href={c.authorUrl} target="_blank" rel="noopener noreferrer">
                    {c.author}
                  </a>
                  {" "}·{" "}
                  <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer">
                    {c.licence}
                  </a>
                </li>
              ))}
            </ul>

            <p className="footer-credits-note">
              Simplified, rigged and animated for LABLY.
            </p>

          </div>
        </div>

      </div>

    </footer>

  );

}

export default Footer;