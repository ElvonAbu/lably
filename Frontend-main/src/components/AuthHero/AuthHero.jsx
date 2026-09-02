import "./AuthHero.css";

import BikeSvg from "../../assets/svg/bike.svg";

function AuthHero() {
  return (
    <div className="auth-illustration">

      <img
        src={BikeSvg}
        alt=""
        className="bike-svg"
      />

    </div>
  );
}

export default AuthHero;