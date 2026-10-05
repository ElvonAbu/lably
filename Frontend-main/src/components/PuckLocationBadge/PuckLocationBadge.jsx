import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Navigation } from "lucide-react";
import "./PuckLocationBadge.css";

function PuckLocationBadge({ address, onChangeLocation }) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!expanded) return;
    const handleOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [expanded]);

  const handleChangeLocation = () => {
    setExpanded(false);
    if (onChangeLocation) {
      onChangeLocation();
    } else {
      navigate("/location-search");
    }
  };

  return (
    <div
      ref={rootRef}
      className={expanded ? "puck-badge puck-badge-expanded" : "puck-badge"}
      onPointerEnter={() => setExpanded(true)}
      onPointerLeave={() => setExpanded(false)}
      onClick={() => setExpanded((prev) => !prev)}
      role="button"
      tabIndex={0}
    >
      <div className="puck-badge-dot">
        <Navigation size={13} color="white" strokeWidth={2.5} />
      </div>

      {expanded && (
        <div className="puck-badge-popup" onClick={(e) => e.stopPropagation()}>
          <div className="puck-badge-address">
            <MapPin size={13} />
            <span>{address || "Your location"}</span>
          </div>
          <button
            type="button"
            className="puck-badge-change-btn"
            onClick={handleChangeLocation}
          >
            Change location
          </button>
        </div>
      )}
    </div>
  );
}

export default PuckLocationBadge;