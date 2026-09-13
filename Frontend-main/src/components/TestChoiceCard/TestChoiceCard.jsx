import { useState } from "react";
import { Check } from "lucide-react";
import "./TestChoiceCard.css";
import SittingSvg from "../../assets/svg/sit.svg";

const OPTIONS = [
    { id: "test", label: "Choose a test" },
    { id: "symptoms", label: "Select symptoms" },
    { id: "checkup", label: "Routine check-up" },
];

function TestChoiceCard({ onNext, onClose }) {

    const [selected, setSelected] = useState("test");

    return (
        <div className="test-choice-overlay" onClick={onClose}>
            <div
                className="test-choice-card"
                onClick={(e) => e.stopPropagation()}
            >
                <img src={SittingSvg} alt="" className="test-choice-illustration" />

                <p className="test-choice-subtitle">How would you like to proceed?</p>

                <div className="test-choice-options">
                    {OPTIONS.map((option) => (
                        <label
                            key={option.id}
                            className={
                                selected === option.id
                                    ? "test-choice-option test-choice-option-active"
                                    : "test-choice-option"
                            }
                        >
                            <input
                                type="radio"
                                name="test-choice"
                                value={option.id}
                                checked={selected === option.id}
                                onChange={() => setSelected(option.id)}
                            />
                            <span className="test-choice-radio-dot">
                                {selected === option.id && (
                                    <Check size={14} color="white" strokeWidth={3} />
                                )}
                            </span>
                            <span className="test-choice-label">{option.label}</span>
                        </label>
                    ))}
                </div>

                <button
                    type="button"
                    className="test-choice-next btn-primary"
                    onClick={() => onNext(selected)}
                >
                    Next
                </button>
            </div>
        </div>
    );
}

export default TestChoiceCard;