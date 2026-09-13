import { useRef, useState } from "react";
import { Check, Search, FlaskConical } from "lucide-react";
import { useSheetDrag } from "../../hooks/useSheetDrag";
import "./SymptomsCard.css";

const LEFT_SYMPTOMS = [
  "Headache", "Vomiting", "Coughing", "Nausea",
  "Discharge", "Fever or Chills", "Fatigue or weakness", "Jaundice",
];

const RIGHT_SYMPTOMS = [
  "Missed menstrual cycle", "Irregular periods", "Body aches", "Night sweats",
  "Persistent sweating", "Numbness or tingling", "Burning during urination", "Frequent urination",
];

function SymptomsCard({ onGetTested, onClose }) {
  const [selected, setSelected] = useState(new Set());
  const sheetRef = useRef(null);
  const dragHandlers = useSheetDrag(sheetRef, onClose);

  const toggle = (symptom) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(symptom) ? next.delete(symptom) : next.add(symptom);
      return next;
    });
  };

  const renderColumn = (items) =>
    items.map((symptom) => (
      <label
        key={symptom}
        className={
          selected.has(symptom)
            ? "symptoms-option symptoms-option-active"
            : "symptoms-option"
        }
      >
        <input
          type="checkbox"
          checked={selected.has(symptom)}
          onChange={() => toggle(symptom)}
        />
        <span className="symptoms-check-dot">
          {selected.has(symptom) && <Check size={13} color="white" strokeWidth={3} />}
        </span>
        <span className="symptoms-label">{symptom}</span>
      </label>
    ));

  return (
    <div className="symptoms-overlay" onClick={() => onClose?.()}>
      <div className="symptoms-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <div className="symptoms-sheet-drag-zone" {...dragHandlers}>
          <div className="symptoms-sheet-handle" />
        </div>

        <div className="symptoms-sheet-body">
          <h2 className="symptoms-title">Select symptoms</h2>

          <div className="symptoms-grid">
            <div className="symptoms-column">{renderColumn(LEFT_SYMPTOMS)}</div>
            <div className="symptoms-column">{renderColumn(RIGHT_SYMPTOMS)}</div>
          </div>

          <p className="symptoms-hint">
            A test will be recommended using the symptoms chosen above
          </p>

          <button
            type="button"
            className="symptoms-submit btn-primary"
            disabled={selected.size === 0}
            onClick={() => onGetTested?.(Array.from(selected))}
          >
            <Search size={18} />
            Get Tested
            <FlaskConical size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SymptomsCard;