import { useState, useEffect } from "react";
import { ChevronRight, Plus, X, MessageSquare, Clock } from "lucide-react";
import "./RequestStatusCard.css";

const COUNTDOWN_SECONDS = 60;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function RequestStatusCard({
  address,
  scientistCount = 5, // TODO(backend): replace with the real live count of scientists viewing this request
  canAddTest,
  onAddTest,
  onCancel,
}) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <div className="request-status-sheet">
      <div className="request-status-handle" />

      <div className="request-status-scroll">
        <div className="request-status-header">
          <h2 className="request-status-title">
            {scientistCount} {scientistCount === 1 ? "scientist is" : "scientists are"} viewing your request
          </h2>
          <span className="request-status-timer">
            <Clock size={14} />
            {formatTime(secondsLeft)}
          </span>
        </div>

        <div className="request-status-list">
          <button
            type="button"
            className="request-status-row"
            onClick={() => setNotesOpen((prev) => !prev)}
          >
            <span className="request-status-row-icon">
              <MessageSquare size={16} />
            </span>
            <span>Any notes for scientist?</span>
            <ChevronRight
              size={16}
              className={notesOpen ? "request-status-chevron request-status-chevron-open" : "request-status-chevron"}
            />
          </button>

          {notesOpen && (
            <textarea
              className="request-status-notes-input"
              placeholder="Add a note..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          )}

          {canAddTest && (
            <button type="button" className="request-status-row" onClick={onAddTest}>
              <span className="request-status-row-icon">
                <Plus size={16} />
              </span>
              <span>Add test</span>
              <ChevronRight size={16} className="request-status-chevron" />
            </button>
          )}
        </div>

        <p className="request-status-label">Your current request</p>

        <div className="request-status-current">
          <span className="request-status-item-dot" />
          <span className="request-status-item-text">{address || "Your location"}</span>
        </div>

        <button type="button" className="request-status-cancel" onClick={onCancel}>
          <X size={16} />
          Cancel request
        </button>
      </div>
    </div>
  );
}

export default RequestStatusCard;