/**
 * Single source of truth: UI labels → lab codes, packages, gender rules.
 */

export const TEST_CODES = {
  FBC: "FBC",
  PCV: "PCV",
  RBS: "RBS",
  MP: "MP",
  HIV_RVS: "HIV/RVS",
  HBsAg: "HBsAg",
  HCV: "HCV",
  VDRL: "VDRL/Syphilis",
  PREGNANCY: "Pregnancy Test",
};

/** Codes only allowed for female patients */
export const FEMALE_ONLY_CODES = new Set([TEST_CODES.PREGNANCY]);

/** Choose-a-test UI label → lab codes */
export const UI_TEST_TO_CODES = {
  "Complete blood health check": [TEST_CODES.FBC],
  "Anaemia Check": [TEST_CODES.PCV],
  "Pregnancy Test": [TEST_CODES.PREGNANCY],
  "Quick Blood Sugar Check": [TEST_CODES.RBS],
  "Malaria Check": [TEST_CODES.MP],
  "HIV Screening Test": [TEST_CODES.HIV_RVS],
  "Hepatitis B Check": [TEST_CODES.HBsAg],
  "Hepatitis C Check": [TEST_CODES.HCV],
  "Syphilis Screening Test": [TEST_CODES.VDRL],
  "Sexually Transmitted Infection Test": [
    TEST_CODES.HBsAg,
    TEST_CODES.HCV,
    TEST_CODES.HIV_RVS,
    TEST_CODES.VDRL,
  ],
};

/** Direct symptom → codes */
export const SYMPTOM_DIRECT = {
  "Fever or Chills": [TEST_CODES.MP],
  "Missed menstrual cycle": [TEST_CODES.PREGNANCY],
  "Frequent urination": [TEST_CODES.RBS],
  Jaundice: [TEST_CODES.HBsAg, TEST_CODES.HCV],
  "Unusual Vaginal/Genital Discharge": [TEST_CODES.VDRL, TEST_CODES.HIV_RVS],
  "Numbness or tingling": [TEST_CODES.RBS],
};

/**
 * Pairing rules: if BOTH symptoms present, add these codes.
 * Solo fallbacks apply only when the symptom is present
 * and NONE of its pair partners are present.
 */
export const SYMPTOM_PAIRS = [
  { a: "Headache", b: "Fever or Chills", codes: [TEST_CODES.MP] },
  { a: "Vomiting", b: "Fever or Chills", codes: [TEST_CODES.MP] },
  { a: "Vomiting", b: "Missed menstrual cycle", codes: [TEST_CODES.PREGNANCY] },
  { a: "Nausea", b: "Fever or Chills", codes: [TEST_CODES.MP] },
  { a: "Nausea", b: "Jaundice", codes: [TEST_CODES.HBsAg, TEST_CODES.HCV] },
  {
    a: "Fatigue or weakness",
    b: "Jaundice",
    codes: [TEST_CODES.HBsAg, TEST_CODES.HCV],
  },
  {
    a: "Fatigue or weakness",
    b: "Fever or Chills",
    codes: [TEST_CODES.MP],
  },
  {
    a: "Fatigue or weakness",
    b: "Missed menstrual cycle",
    codes: [TEST_CODES.PREGNANCY],
  },
  { a: "Body aches", b: "Fever or Chills", codes: [TEST_CODES.MP] },
];

/** Solo fallback when symptom present and not paired */
export const SYMPTOM_SOLO = {
  Headache: [TEST_CODES.FBC],
  Vomiting: [TEST_CODES.FBC],
  Nausea: [TEST_CODES.FBC],
  "Fatigue or weakness": [TEST_CODES.FBC],
  "Body aches": [TEST_CODES.FBC],
};

/** Partners that suppress solo fallback for a symptom */
export const SYMPTOM_SOLO_PARTNERS = {
  Headache: ["Fever or Chills"],
  Vomiting: ["Fever or Chills", "Missed menstrual cycle"],
  Nausea: ["Fever or Chills", "Jaundice"],
  "Fatigue or weakness": [
    "Jaundice",
    "Fever or Chills",
    "Missed menstrual cycle",
  ],
  "Body aches": ["Fever or Chills"],
};

/** Package id → codes (Pregnancy added for Platinum only if female, in resolver) */
export const PACKAGE_TO_CODES = {
  silver: [TEST_CODES.FBC, TEST_CODES.MP, TEST_CODES.RBS],
  gold: [
    TEST_CODES.FBC,
    TEST_CODES.MP,
    TEST_CODES.RBS,
    TEST_CODES.HIV_RVS,
    TEST_CODES.HCV,
    TEST_CODES.VDRL,
  ],
  platinum: [
    TEST_CODES.FBC,
    TEST_CODES.MP,
    TEST_CODES.RBS,
    TEST_CODES.HIV_RVS,
    TEST_CODES.HCV,
    TEST_CODES.VDRL,
    TEST_CODES.HBsAg,
  ],
};

export const PROCEED_MODES = ["test", "symptoms", "checkup"];