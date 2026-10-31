import "./ChangeLocationConfirm.css";

function ChangeLocationConfirm({ onConfirm, onCancel }) {

    return (
        <div className="change-location-overlay" onClick={onCancel}>
            <div className="change-location-card" onClick={(e) => e.stopPropagation()}>

                <h2 className="change-location-title">Change your location?</h2>

                <p className="change-location-body">
                    Changing your location will clear the information you've already
                    entered, and you'll need to start over. Are you sure you want to continue?
                </p>

                <div className="change-location-actions">
                    <button type="button" className="change-location-cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className="change-location-confirm btn-primary" onClick={onConfirm}>
                        Yes, change location
                    </button>
                </div>

            </div>
        </div>
    );
}

export default ChangeLocationConfirm;