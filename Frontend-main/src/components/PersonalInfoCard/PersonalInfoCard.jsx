import { useState, useMemo } from "react";
import "./PersonalInfoCard.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function PersonalInfoCard({ onNext, onClose, initialValues }) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [month, setMonth] = useState(initialValues?.month ?? "");
  const [day, setDay] = useState(initialValues?.day ?? "");
  const [year, setYear] = useState(initialValues?.year ?? "");
  const [gender, setGender] = useState(initialValues?.gender ?? "");
  const [history, setHistory] = useState(initialValues?.history ?? "");

  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 100 }, (_, i) => current - i);
  }, []);

  const isValid = name.trim() && month && day && year && gender;

  const handleNext = () => {
    if (!isValid) return;
    onNext?.({ name, month, day, year, gender, history });
  };

  return (
    <div className="personal-info-overlay" onClick={onClose}>
      <div className="personal-info-card" onClick={(e) => e.stopPropagation()}>
        <div className="personal-info-card-inner">
          <h2 className="personal-info-title">Enter Your Information</h2>

          <p className="personal-info-subtitle">
            This helps us match you with the right scientist and care for you properly.
          </p>

          <div className="personal-info-field">
            <label className="personal-info-label">Full name</label>
            <input
              type="text"
              className="personal-info-input"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="personal-info-field">
            <label className="personal-info-label">Date of birth</label>
            <div className="personal-info-dob-row">
              <select className="personal-info-select" value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>

              <select className="personal-info-select" value={day} onChange={(e) => setDay(e.target.value)}>
                <option value="">Day</option>
                {days.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>

              <select className="personal-info-select" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">Year</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="personal-info-field">
            <label className="personal-info-label">Gender</label>
            <select className="personal-info-select personal-info-select-full" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div className="personal-info-field">
            <label className="personal-info-label">Any relevant medical history? (optional)</label>
            <textarea
              className="personal-info-textarea"
              placeholder="e.g. allergies, ongoing conditions"
              value={history}
              onChange={(e) => setHistory(e.target.value)}
              rows={2}
            />
          </div>

          <div className="personal-info-notice">
            <span className="personal-info-notice-icon">🔒</span>
            <span>
              Your health data is encrypted and securely stored in compliance with the
              Nigeria Data Protection Act (NDPA) 2023. Access is limited to authorized
              healthcare providers directly involved in your care.
            </span>
          </div>

          <button
            type="button"
            className="personal-info-next btn-primary"
            disabled={!isValid}
            onClick={handleNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default PersonalInfoCard;