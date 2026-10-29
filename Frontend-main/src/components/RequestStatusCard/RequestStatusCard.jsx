import { useState, useEffect, useRef } from "react";
import { ChevronRight, Plus, X, MessageSquare, Clock, Pencil } from "lucide-react";
import { useReportHeight } from "../../hooks/UseReportHeight";
import { REQUEST_SEARCH_SECONDS } from "../../utils/requestSearch";
import "./RequestStatusCard.css";

const COUNTDOWN_SECONDS = REQUEST_SEARCH_SECONDS;

const NOTE_MAX_LENGTH = 200;

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
  onTimeElapsed,
  onHeightChange,
  note = "", // saved note for the scientist (owned by the parent so it survives re-opening the card)
  onNoteChange,
  tests = [], // names of the tests added to this request
  onRemoveTest,
}) {
  const sheetRef = useReportHeight(onHeightChange);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  // Note editor: tap the row → edit a draft → Save keeps it, Cancel drops it
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState("");
  const draftRef = useRef(null);

  const openNoteEditor = () => {
    setDraft(note);
    setEditingNote(true);
  };

  const cancelNote = () => {
    setEditingNote(false);
    setDraft("");
  };

  const saveNote = () => {
    onNoteChange?.(draft.trim());
    setEditingNote(false);
  };

  useEffect(() => {
    if (editingNote) {
      draftRef.current?.focus();
    }
  }, [editingNote]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onTimeElapsed?.();
      return;
    }
    const timer = setTimeout(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <div className="request-status-sheet" ref={sheetRef}>
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
          {editingNote ? (
            <div className="request-status-note-editor">
              <label className="request-status-note-title" htmlFor="request-note">
                Note for the scientist
              </label>

              <textarea
                id="request-note"
                ref={draftRef}
                className="request-status-notes-input"
                placeholder="e.g. Call me when you arrive at the gate"
                value={draft}
                maxLength={NOTE_MAX_LENGTH}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
              />

              <div className="request-status-note-footer">
                <span className="request-status-note-count">
                  {draft.length}/{NOTE_MAX_LENGTH}
                </span>

                <div className="request-status-note-actions">
                  <button
                    type="button"
                    className="request-status-note-btn request-status-note-btn-cancel"
                    onClick={cancelNote}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="request-status-note-btn request-status-note-btn-save"
                    onClick={saveNote}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" className="request-status-row" onClick={openNoteEditor}>
              <span className="request-status-row-icon">
                <MessageSquare size={16} />
              </span>

              <span
                className={
                  note
                    ? "request-status-row-text request-status-row-text-saved"
                    : "request-status-row-text"
                }
              >
                {note || "Any notes for scientist?"}
              </span>

              {note ? (
                <Pencil size={15} className="request-status-chevron" aria-label="Edit note" />
              ) : (
                <ChevronRight size={16} className="request-status-chevron" />
              )}
            </button>
          )}

          {canAddTest && (
            <div className="request-status-tests">
              <button type="button" className="request-status-row" onClick={onAddTest}>
                <span className="request-status-row-icon">
                  <Plus size={16} />
                </span>
                <span className="request-status-row-text">Add test</span>
                <ChevronRight size={16} className="request-status-chevron" />
              </button>

              {tests.length > 0 && (
                <ul className="request-status-chips" aria-label="Tests on this request">
                  {tests.map((test) => (
                    <li key={test} className="request-status-chip">
                      <span className="request-status-chip-label">{test}</span>

                      {/* the last test can't be removed — a request needs at least one */}
                      {tests.length > 1 && (
                        <button
                          type="button"
                          className="request-status-chip-remove"
                          aria-label={`Remove ${test}`}
                          onClick={() => onRemoveTest?.(test)}
                        >
                          <X size={14} strokeWidth={2.6} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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