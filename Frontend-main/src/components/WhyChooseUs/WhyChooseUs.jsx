import "./WhyChooseUs.css";
import { Icon } from "@iconify/react";

const reasons = [
  {
    icon: "mdi:certificate-outline",
    title: "MLS-Led",
    description:
      "Every collection is guided or performed by qualified Medical Laboratory Scientists."
  },

  {
    icon: "mdi:map-marker-radius-outline",
    title: "Lagos Focused",
    description:
      "Fast response in Mainland, Island, Ikeja, Lekki, Ajah, Ikorodu and surrounding areas."
  },

  {
    icon: "mdi:shield-check-outline",
    title: "Clinical Standards",
    description:
      "Accurate, reliable results you can trust with your doctor."
  },

  {
    icon: "mdi:account-group-outline",
    title: "Convenience",
    description:
      "Perfect for families, professionals, corporates and elderly Nigerians."
  }
];

function WhyChooseUs() {
  return (
    <section className="why-choose-section">

      <div className="container">

        <h2 className="section-title">
          Why Choose Us?
        </h2>

        <div className="why-grid">

          {reasons.map((reason) => (

            <div
              className="why-card"
              key={reason.title}
            >

              <div className="why-icon">

                <Icon
                  icon={reason.icon}
                  width="42"
                />

              </div>

              <h3>
                {reason.title}
              </h3>

              <p>
                {reason.description}
              </p>

            </div>

          ))}

        </div>

        <div className="ceo-quote">

          <Icon
            icon="mdi:format-quote-open"
            width="55"
            className="quote-icon"
          />

          <p>

            Unlike regular delivery riders or basic home test kits,
            our service is led by trained and certified MLS professionals
            that ensures samples are collected properly, follows best
            practices for accuracy and reliability, professional handling
            that meets clinical standards and experts answers to your
            questions before, during and after collection.

          </p>

          <div className="quote-author">

            <strong>
              — Ehidiamen-Ton Talent
            </strong>

            <span>
              CEO Lably
            </span>

          </div>

        </div>

      </div>

    </section>
  );
}

export default WhyChooseUs;