import "./LocationHelpCard.css";
import { MapPin } from "lucide-react";

// Shown instead of the normal LocationCard when getCurrentPosition fails
// with PERMISSION_DENIED — i.e. the browser will never show its own
// Allow/Deny prompt again until the person changes the OS/browser-level
// setting by hand. This walks them through exactly where that setting
// lives, since "just check your settings" (the old message) sent people
// hunting on their own.
function LocationHelpCard({ onClose, isMobile }) {

    const steps = isMobile
        ? [
            "Settings \u2192 Privacy & Security \u2192 Location Services",
            "Find this browser in the list",
            "Set to \u201cWhile Using the App\u201d",
            "Come back and tap \u201cUse My Location\u201d",
        ]
        : [
            "Click the icon left of the address bar",
            "Change \u201cLocation\u201d from Block to Allow",
            "Come back and tap \u201cUse My Location\u201d",
        ];

    return (

        <div
            className="location-overlay"
            onClick={onClose}
        >

            <div
                className="location-permission-card location-help-card"
                onClick={(e) => e.stopPropagation()}
            >

                <div className="location-icon">

                    <MapPin size={34} />

                </div>

                <h2 className="location-title">

                    Turn Location Back On

                </h2>

                <p className="location-description">

                    Location was turned off at the {isMobile ? "phone" : "browser"} level. Here's how to fix it:

                </p>

                <ol className="location-help-steps">

                    {steps.map((step, i) => (

                        <li key={i}>{step}</li>

                    ))}

                </ol>

                <button className="btn-primary" onClick={onClose}>

                    OK

                </button>

            </div>

        </div>

    );

}

export default LocationHelpCard;