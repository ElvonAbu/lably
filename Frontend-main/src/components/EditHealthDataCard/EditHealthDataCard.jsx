import "./EditHealthDataCard.css";
import EditHealthDataSvg from "../../assets/svg/edit-health-data.svg";

function EditHealthDataCard({ onYes, onNo, onClose }) {

    return (
        <div className="edit-health-overlay" onClick={onClose}>
            <div
                className="edit-health-card"
                onClick={(e) => e.stopPropagation()}
            >
                <img src={EditHealthDataSvg} alt="" className="edit-health-illustration" />

                <h2 className="edit-health-title">
                    Do you want to use your existing data?
                </h2>

                <p className="edit-health-description">
                    Choose Yes to continue with the details we already have,
                    or No to fill them in again.
                </p>

                <button
                    type="button"
                    className="btn-primary"
                    onClick={onYes}
                >
                    Yes
                </button>

                <button
                    type="button"
                    className="edit-health-secondary-btn"
                    onClick={onNo}
                >
                    No
                </button>
            </div>
        </div>
    );
}

export default EditHealthDataCard;