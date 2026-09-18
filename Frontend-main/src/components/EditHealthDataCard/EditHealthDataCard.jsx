import "./EditHealthDataCard.css";
import EditHealthDataSvg from "../../assets/svg/edit-health-data.svg";

function EditHealthDataCard({ onEdit, onContinue, onClose }) {

    return (
        <div className="edit-health-overlay" onClick={onClose}>
            <div
                className="edit-health-card"
                onClick={(e) => e.stopPropagation()}
            >
                <img src={EditHealthDataSvg} alt="" className="edit-health-illustration" />

                <h2 className="edit-health-title">
                    Do you want to edit your health data?
                </h2>

                <p className="edit-health-subtitle">
                    Continue if you don&apos;t want to edit your health data.
                </p>

                <div className="edit-health-actions">
                    <button
                        type="button"
                        className="edit-health-btn edit-health-btn-outline"
                        onClick={onEdit}
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        className="edit-health-btn edit-health-btn-primary"
                        onClick={onContinue}
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>
    );
}

export default EditHealthDataCard;