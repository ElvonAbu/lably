import { useRef, useState } from "react";
import { Search, FlaskConical } from "lucide-react";
import { useSheetDrag } from "../../hooks/useSheetDrag";
import "./ChooseTestCard.css";

/*
 * Each item is tagged with which gender(s) it applies to.
 * "all" means it shows regardless of the booked person's gender.
 * Add more gender-specific tests here the same way as needed.
 */

const LEFT_TESTS = [
  { label: "Complete blood health check", genders: ["all"] },
  { label: "Anaemia Check", genders: ["all"] },
  { label: "Pregnancy Test", genders: ["female"] },
  { label: "Quick Blood Sugar Check", genders: ["all"] },
  { label: "Malaria Check", genders: ["all"] },
  { label: "HIV Screening Test", genders: ["all"] },
];

const RIGHT_TESTS = [
  { label: "Hepatitis B Check", genders: ["all"] },
  { label: "Hepatitis C Check", genders: ["all"] },
  { label: "Syphilis Screening Test", genders: ["all"] },
  { label: "Sexually Transmitted Infection Test", genders: ["all"] },
];

function matchesGender(item, gender) {
  if (!item.genders || item.genders.includes("all")) return true;
  if (!gender) return true; // no gender known yet — show everything
  return item.genders.includes(gender.toLowerCase());
}

function ChooseTestCard({ onGetTested, onClose, initialSelected = [], gender }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const sheetRef = useRef(null);
  const dragHandlers = useSheetDrag(sheetRef, onClose);

  const toggle = (label) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const renderButtons = (items) =>
    items
      .filter((item) => matchesGender(item, gender))
      .map((item) => (
        <button
          key={item.label}
          type="button"
          className={
            selected.has(item.label)
              ? "choose-test-pill choose-test-pill-active"
              : "choose-test-pill"
          }
          onClick={() => toggle(item.label)}
        >
          {item.label}
        </button>
      ));

  return (
    <div className="choose-test-overlay" onClick={() => onClose?.()}>
      <div className="choose-test-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <div className="choose-test-sheet-drag-zone" {...dragHandlers}>
          <div className="choose-test-sheet-handle" />
        </div>

        <div className="choose-test-sheet-body">
          <h2 className="choose-test-title">Choose a Test</h2>

          <div className="choose-test-grid">
            <div className="choose-test-column">{renderButtons(LEFT_TESTS)}</div>
            <div className="choose-test-column">{renderButtons(RIGHT_TESTS)}</div>
          </div>

          <button
            type="button"
            className="choose-test-submit btn-primary"
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

export default ChooseTestCard;