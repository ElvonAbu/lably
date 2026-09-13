import "./LocationCard.css";
import { MapPin } from "lucide-react";

// === CHANGED (Claude): accepts errorMessage so a denied/failed location
// request tells the user what happened and how to fix it, instead of
// just silently disappearing.
function LocationCard({ onClose, onUseLocation, onSkip, errorMessage }) {

    return (

        <div
            className="location-overlay"
            onClick={onClose}
        >

            <div
                className="location-permission-card"
                onClick={(e)=>e.stopPropagation()}
            >

                <div className="location-icon">

                    <MapPin size={34}/>

                </div>

                <h2 className="location-title">

                    Enable Your Location

                </h2>

                <p className="location-description">

                    Enable location services to find and
                    connect with local professionals faster.

                </p>

                {errorMessage && (

                    <p className="location-error">

                        {errorMessage}

                    </p>

                )}

                <button className="btn-primary" onClick={onUseLocation}>

                    {errorMessage ? "Try Again" : "Use My Location"}

                </button>

                <button
                    className="location-skip-btn"
                    onClick={onSkip}
                >

                    Skip For Now

                </button>

            </div>

        </div>

    );

}

export default LocationCard;