import "./Footer.css";
import { Icon } from "@iconify/react";

function Footer() {

  return (

    <footer className="footer">

      <div className="container">

        <div className="footer-top">

          {/* Logo */}

          <div className="footer-brand">

            <div className="logo">

              <div className="logo-icon">

                <span className="circle one"></span>
                <span className="circle two"></span>
                <span className="circle three"></span>
                <span className="circle four"></span>

              </div>

              <div className="logo-text">

                <span className="lab">
                  LABLY
                </span>

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

        </div>

      </div>

    </footer>

  );

}

export default Footer;