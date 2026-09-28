import { useRef, useState } from "react";
import { Check, Search, FlaskConical } from "lucide-react";
import { useSheetDrag } from "../../hooks/useSheetDrag";
import "./SymptomsCard.css";

const LEFT_SYMPTOMS = [
  { label: "Headache", genders: ["all"] },
  { label: "Vomiting", genders: ["all"] },
  { label: "Nausea", genders: ["all"] },
  { label: "Unusual Vaginal/Genital Discharge", genders: ["all"] },
  { label: "Fever or Chills", genders: ["all"] },
  { label: "Fatigue or weakness", genders: ["all"] },
  { label: "Jaundice", genders: ["all"] },
];

const RIGHT_SYMPTOMS = [
  { label: "Missed menstrual cycle", genders: ["female"] },
  { label: "Body aches", genders: ["all"] },
  { label: "Numbness or tingling", genders: ["all"] },
  { label: "Frequent urination", genders: ["all"] },
];

function matchesGender(item, gender) {
  if (!item.genders || item.genders.includes("all")) return true;
  if (!gender) return true;
  return item.genders.includes(gender.toLowerCase());
}

function SymptomsCard({ onGetTested, onClose, gender }) {
  const [selected, setSelected] = useState(new Set());
  const sheetRef = useRef(null);
  const dragHandlers = useSheetDrag(sheetRef, onClose);

  const toggle = (label) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const renderColumn = (items) =>
    items
      .filter((item) => matchesGender(item, gender))
      .map((item) => (
        <label
          key={item.label}
          className={
            selected.has(item.label)
              ? "symptoms-option symptoms-option-active"
              : "symptoms-option"
          }
        >
          <input
            type="checkbox"
            checked={selected.has(item.label)}
            onChange={() => toggle(item.label)}
          />
          <span className="symptoms-check-dot">
            {selected.has(item.label) && <Check size={13} color="white" strokeWidth={3} />}
          </span>
          <span className="symptoms-label">{item.label}</span>
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