import "./Hero.css";
import HeroImage from "../../assets/svg/hero-illustration.svg";
import  { Link } from "react-router-dom";

function Hero() {
    return (

        <section className="hero-section">

            <div className="container">

                <div className="hero-layout">

                    {/* LEFT */}

                    <div className="hero-content">

                        <p className="hero-subtitle">
                            HEALTHCARE MADE SIMPLE
                        </p>

                        <h1 className="hero-title">

                            Helping You Get

                            <br />

                            <span>Quality Lab Tests</span>

                            <br />

                            At Home

                        </h1>

                        <p className="hero-description">

                            Book professional laboratory sample collection
                            from the comfort of your home. Fast, reliable
                            and secure healthcare services whenever
                            you need them.

                        </p>

                      <Link to="/signup" className="btn-primary">
                       Get Started
                      </Link>

                    </div>



                    {/* RIGHT */}

                    <div className="hero-image">

                        <img

                            src={HeroImage}

                            alt="Healthcare Illustration"

                        />

                    </div>

                </div>

            </div>

        </section>

    );
}

export default Hero;