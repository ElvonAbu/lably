import "./BookingWhoCard.css";
import BookingWhoSvg from "../../assets/svg/booking_who.svg";

function BookingWhoCard({ onNext, onClose }) {

    return (
        <div className="booking-who-overlay" onClick={onClose}>
            <div
                className="booking-who-card"
                onClick={(e) => e.stopPropagation()}
            >
                <img src={BookingWhoSvg} alt="" className="booking-who-illustration" />

                <h2 className="booking-who-title">Who are you booking for?</h2>

                <p className="booking-who-description">
                    Select who will be having the tests. You can book for
                    yourself or someone else.
                </p>

                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onNext("myself")}
                >
                    Myself
                </button>

                <button
                    type="button"
                    className="booking-who-secondary-btn"
                    onClick={() => onNext("someone")}
                >
                    Someone Else
                </button>
            </div>
        </div>
    );
}

export default BookingWhoCard;