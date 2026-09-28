import "./TrustSection.css";

import TrustImage from "../../assets/svg/handshake.svg";

function TrustSection() {

    return (

        <section className="trust-section">

            <div className="container">

                <div className="trust-image">

                    <img
                        src={TrustImage}
                        alt="Scientist and patient shaking hands"
                    />

                </div>

                <div className="trust-content">

                    <h2>

                        We're reliable. We're quick.
                        And committed to earning your trust.

                    </h2>

                    <p>

                        Between work, family, and endless traffic,
                        finding time to visit a laboratory often
                        means delaying important health checks.

                        That's why we created a seamless
                        door-to-door healthcare service that
                        connects patients with certified
                        professionals who come directly to you.

                    </p>

                </div>

            </div>

        </section>

    );

}

export default TrustSection;