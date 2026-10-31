import "./AuthFeatures.css";

import SearchSvg from "../../assets/svg/search.svg";
import CarSvg from "../../assets/svg/car.svg";
import PhoneSvg from "../../assets/svg/phone.svg";

const features = [
  {
    icon: SearchSvg,
    title: "Accurate Results",
    text: "Guided by certified Medical laboratory Scientists for precise, clinical grade testing every time."
  },
  {
    icon: CarSvg,
    title: "Accessible",
    text: "Professional lab testing now within reach for every Home, no queues, no barriers, just quality care."
  },
  {
    icon: PhoneSvg,
    title: "At Home",
    text: "Certified Medical Laboratory Scientists come to your doorstep for convenient, stress free samples collection and reliable results."
  }
];

function Features(){
  return (
    <section className="features section">

      <div className="container features__grid">

        {features.map((f) => (
          <div className="feature" key={f.title}>

            <img
              src={f.icon}
              alt=""
              className="feature__icon"
            />

            <h3 className="feature__title">
              {f.title}
            </h3>

            <p className="feature__text">
              {f.text}
            </p>

          </div>
        ))}

      </div>

    </section>
  );
}

export default Features;