import { useState } from "react";
import { Check } from "lucide-react";
import "./BookingWhoCard.css";
import BookingWhoSvg from "../../assets/svg/booking_who.svg";

const OPTIONS = [
    { id: "myself", label: "Myself" },
    { id: "someone", label: "Someone else" },
];

function BookingWhoCard({ onNext, onClose }) {

    const [selected, setSelected] = useState("myself");

    return (
        <div className="booking-who-overlay" onClick={onClose}>
            <div
                className="booking-who-card"
                onClick={(e) => e.stopPropagation()}
            >
                <img src={BookingWhoSvg} alt="" className="booking-who-illustration" />

                <h2 className="booking-who-title">Who are you booking for?</h2>

                <p className="booking-who-subtitle">
                    Select who will be having the tests. You can book for
                    yourself or someone else.
                </p>

                <div className="booking-who-options">
                    {OPTIONS.map((option) => (
                        <label
                            key={option.id}
                            className={
                                selected === option.id
                                    ? "booking-who-option booking-who-option-active"
                                    : "booking-who-option"
                            }
                        >
                            <input
                                type="radio"
                                name="booking-who"
                                value={option.id}
                                checked={selected === option.id}
                                onChange={() => setSelected(option.id)}
                            />
                            <span className="booking-who-radio-dot">
                                {selected === option.id && (
                                    <Check size={14} color="white" strokeWidth={3} />
                                )}
                            </span>
                            <span className="booking-who-label">{option.label}</span>
                        </label>
                    ))}
                </div>

                <button
                    type="button"
                    className="booking-who-next btn-primary"
                    onClick={() => onNext(selected)}
                >
                    Next
                </button>
            </div>
        </div>
    );
}

export default BookingWhoCard;