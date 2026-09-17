import { useRef, useState } from "react";
import { Search, FlaskConical } from "lucide-react";
import { useSheetDrag } from "../../hooks/useSheetDrag";
import "./ChooseTestCard.css";

const LEFT_TESTS = [
  "Complete blood health check", "Anaemia Check", "Pregnancy Test",
  "Quick Blood Sugar Check", "Malaria Check", "HIV Screening Test"
];

const RIGHT_TESTS = [
  "Hepatitis B Check", "Hepatitis C Check", "Syphilis Screening Test",
  "Sexually Transmitted Infection Test"
];

function ChooseTestCard({ onGetTested, onClose, initialSelected = [] }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const sheetRef = useRef(null);
  const dragHandlers = useSheetDrag(sheetRef, onClose);

  const toggle = (test) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(test) ? next.delete(test) : next.add(test);
      return next;
    });
  };

  const renderButtons = (items) =>
    items.map((test) => (
      <button
        key={test}
        type="button"
        className={
          selected.has(test)
            ? "choose-test-pill choose-test-pill-active"
            : "choose-test-pill"
        }
        onClick={() => toggle(test)}
      >
        {test}
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