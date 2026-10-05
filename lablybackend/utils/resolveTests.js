import {
  UI_TEST_TO_CODES,
  SYMPTOM_DIRECT,
  SYMPTOM_PAIRS,
  SYMPTOM_SOLO,
  SYMPTOM_SOLO_PARTNERS,
  PACKAGE_TO_CODES,
  FEMALE_ONLY_CODES,
  PROCEED_MODES,
  TEST_CODES,
} from "../config/testCatalog.js";

function normalizeGender(gender) {
  if (!gender) return null;
  const g = String(gender).trim().toLowerCase();
  if (g === "male" || g === "female") return g;
  return null;
}

function applyGenderFilter(codes, gender) {
  const g = normalizeGender(gender);
  return codes.filter((code) => {
    if (FEMALE_ONLY_CODES.has(code) && g !== "female") return false;
    return true;
  });
}

function unique(list) {
  return [...new Set(list)];
}

/**
 * @param {object} input
 * @param {"test"|"symptoms"|"checkup"} input.proceedMode
 * @param {string[]} [input.selectedTests]
 * @param {string[]} [input.symptoms]
 * @param {string|null} [input.packageId]
 * @param {string|null} [input.gender]
 */
export function resolveTests(input) {
  const {
    proceedMode,
    selectedTests = [],
    symptoms = [],
    packageId = null,
    gender = null,
  } = input;

  if (!PROCEED_MODES.includes(proceedMode)) {
    const err = new Error(
      "Invalid proceedMode. Use test, symptoms, or checkup."
    );
    err.status = 400;
    throw err;
  }

  let codes = [];
  const reasons = [];

  if (proceedMode === "test") {
    if (!Array.isArray(selectedTests) || selectedTests.length === 0) {
      const err = new Error(
        "selectedTests is required when proceedMode is test."
      );
      err.status = 400;
      throw err;
    }
    for (const label of selectedTests) {
      const mapped = UI_TEST_TO_CODES[label];
      if (!mapped) {
        const err = new Error(`Unknown test option: "${label}"`);
        err.status = 400;
        throw err;
      }
      codes.push(...mapped);
      reasons.push({ from: label, codes: [...mapped], rule: "ui-test" });
    }
  }

  if (proceedMode === "symptoms") {
    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      const err = new Error(
        "symptoms is required when proceedMode is symptoms."
      );
      err.status = 400;
      throw err;
    }

    const set = new Set(symptoms);

    for (const symptom of set) {
      const direct = SYMPTOM_DIRECT[symptom];
      if (direct) {
        codes.push(...direct);
        reasons.push({ from: symptom, codes: [...direct], rule: "direct" });
      }
    }

    for (const pair of SYMPTOM_PAIRS) {
      if (set.has(pair.a) && set.has(pair.b)) {
        codes.push(...pair.codes);
        reasons.push({
          from: `${pair.a} + ${pair.b}`,
          codes: [...pair.codes],
          rule: "pair",
        });
      }
    }

    for (const [symptom, soloCodes] of Object.entries(SYMPTOM_SOLO)) {
      if (!set.has(symptom)) continue;
      const partners = SYMPTOM_SOLO_PARTNERS[symptom] || [];
      const paired = partners.some((p) => set.has(p));
      if (!paired) {
        codes.push(...soloCodes);
        reasons.push({ from: symptom, codes: [...soloCodes], rule: "solo" });
      }
    }
  }

  if (proceedMode === "checkup") {
    if (!packageId || !PACKAGE_TO_CODES[packageId]) {
      const err = new Error("packageId must be silver, gold, or platinum.");
      err.status = 400;
      throw err;
    }
    codes.push(...PACKAGE_TO_CODES[packageId]);
    reasons.push({
      from: packageId,
      codes: [...PACKAGE_TO_CODES[packageId]],
      rule: "package",
    });

    if (packageId === "platinum" && normalizeGender(gender) === "female") {
      codes.push(TEST_CODES.PREGNANCY);
      reasons.push({
        from: "platinum + female",
        codes: [TEST_CODES.PREGNANCY],
        rule: "package-gender",
      });
    }
  }

  let resolvedTests = unique(applyGenderFilter(codes, gender));

  if (resolvedTests.length === 0) {
    const err = new Error(
      "No tests resolved. Check selections and patient gender."
    );
    err.status = 400;
    throw err;
  }

  return { resolvedTests, reasons };
}