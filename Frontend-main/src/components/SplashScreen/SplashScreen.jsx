import { useEffect, useState } from "react";
import Logo from "../Logo/Logo";
import "./SplashScreen.css";

const WRITE_START = 300;
const WRITE_DURATION = 1600;
const SMILE_PAUSE = 300;
const SMILE_DURATION = 1800;
const HOLD_AFTER = 500;
const FADE_OUT = 500;

const SMILE_DONE = WRITE_START + WRITE_DURATION + SMILE_PAUSE + SMILE_DURATION;
const EXIT_AT = SMILE_DONE + HOLD_AFTER;
const FINISH_AT = EXIT_AT + FADE_OUT;

function SplashScreen({ onFinish }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), EXIT_AT);
    const doneTimer = setTimeout(() => onFinish?.(), FINISH_AT);
    return () => { clearTimeout(exitTimer); clearTimeout(doneTimer); };
  }, [onFinish]);

  return (
    <div className={`splash-screen${exiting ? " splash-exit" : ""}`}>
      <div className="splash-logo">
        <Logo animateOnMount />
      </div>
    </div>
  );
}

export default SplashScreen;