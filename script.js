// =====================================================
// ESTIFY • UNIFIED PRICING ENGINE
// FINAL CLEAN STABLE VERSION
// =====================================================

let material_master = [];
let price_sheet = [];

window.estifyPlans = {};
window.estifyCurrentPlan = null;

// =====================================================
// LOAD DATA
// =====================================================
async function loadData() {
  if (material_master.length && price_sheet.length) return;

  const [mRes, pRes] = await Promise.all([
    fetch("./material_master.json"),
    fetch("./price_sheet.json")
  ]);

  if (!mRes.ok) {
    throw new Error("material_master.json failed to load");
  }

  if (!pRes.ok) {
    throw new Error("price_sheet.json failed to load");
  }

  material_master = await mRes.json();
  price_sheet = await pRes.json();
}

// =====================================================
// HELPERS
// =====================================================
function normalize(v) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function formatValue(v) {
  const n = Number(v);

  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN").format(Math.round(n))
    : "—";
}

function formatPrecise(v) {
  const n = Number(v);

  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n)
    : "—";
}

function pickEl(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }

  return null;
}

function showToast(message) {
  const old = document.querySelector(".estify-toast");

  if (old) old.remove();

  const toast = document.createElement("div");

  toast.className = "estify-toast";
  toast.textContent = message;

  Object.assign(toast.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    padding: "14px 18px",
    background: "rgba(15,23,42,.95)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: "16px",
    color: "#fff",
    zIndex: "999999",
    boxShadow: "0 20px 60px rgba(0,0,0,.45)"
  });

  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("Copied to clipboard"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");

  ta.value = text;

  document.body.appendChild(ta);

  ta.select();

  document.execCommand("copy");

  ta.remove();

  showToast("Copied to clipboard");
}

function isRawLine(input) {
  const text = String(input || "").trim();

  return text.length > 0 &&
         !text.includes("(") &&
         !text.includes(")");
}

function isMaterialCode(value) {
  const v = normalize(value);

  return material_master.some(
    m => normalize(m.code) === v
  );
}

function looksLikeConfig(value) {
  const v = normalize(value);

  return (
    /^\d+(\.\d+)?(X\d+)?([A-Z]+)?$/.test(v) ||
    /^\d+X\d+([A-Z]+)?$/.test(v) ||
    /^[A-Z]?\d+(\.\d+)?S$/.test(v) ||
    /^[A-Z]?\d+(\.\d+)?SS$/.test(v) ||
    (
      /^[A-Z]{1,4}\d+[A-Z0-9\-_/]*$/.test(v) &&
      !isMaterialCode(v)
    ) ||
    v.includes("+") ||
    /^LHF$/i.test(v) ||
    /^RHF$/i.test(v) ||
    /^LF$/i.test(v) ||
    /^RF$/i.test(v) ||
    /^NS$/i.test(v) ||
    /^WB$/i.test(v) ||
    /^BF$/i.test(v) ||
    /^U$/i.test(v) ||
    /^CM$/i.test(v) ||
    /^BFU$/i.test(v) ||
    /^WBF$/i.test(v) ||
    /^RFSTB$/i.test(v)
  );
}

// =====================================================
// PARSER
// =====================================================
function extractCode(fabricPart) {
  const text = normalize(fabricPart);

  const sortedCodes = material_master
    .map(m => normalize(m.code))
    .sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (
      text === code ||
      text.startsWith(code + "-") ||
      text.startsWith(code + " ")
    ) {
      return code;
    }
  }

  return text.split("-")[0];
}

function parseVariant(input) {
  input = String(input || "")
    .trim()
    .replace(/\s+/g, " ");

  // =================================================
  // RAW FORMAT
  // =================================================
  if (isRawLine(input)) {

    const tokens = input
      .split(" ")
      .filter(Boolean);

    if (tokens.length < 2) {
      throw new Error(
        `Unable to parse raw format: ${input}`
      );
    }

    const model = tokens.shift().trim();

    const config = tokens
      .join(" ")
      .trim()
      .toUpperCase();

    return {
      model: normalize(model),
      code: /BED/i.test(model)
        ? "BED"
        : "RAW",
      config
    };
  }

  // =================================================
  // BRACKET FORMAT
  // =================================================
  const brackets = input.match(/\(([^()]*)\)/g);

  if (!brackets || brackets.length < 2) {
    throw new Error(
      `Invalid bracket format: ${input}`
    );
  }

  const prefix = brackets[0]
    .replace(/[()]/g, "")
    .trim();

  const afterPrefix =
    input.split(")")[1]?.trim() || "";

  const modelName =
    afterPrefix.split(" ")[0];

  const model =
    `${prefix}-${modelName}`;

  const last = brackets[
    brackets.length - 1
  ]
    .replace(/[()]/g, "")
    .trim();

  let fabricPart = "";
  let configPart = "";

  if (last.includes(",")) {

    const split = last.split(",");

    fabricPart = split[0]?.trim() || "";
    configPart = split[1]?.trim() || "";

  } else {

    const pieces = last
      .split(" ")
      .filter(Boolean);

    if (pieces.length < 2) {
      throw new Error(
        `Invalid fabric/config structure: ${input}`
      );
    }

    fabricPart = pieces[0].trim();
    configPart = pieces
      .slice(1)
      .join(" ")
      .trim();
  }

  // SMART SWAP
  if (
    isMaterialCode(configPart) &&
    !isMaterialCode(fabricPart)
  ) {
    [fabricPart, configPart] =
      [configPart, fabricPart];

  } else if (
    looksLikeConfig(fabricPart) &&
    !looksLikeConfig(configPart)
  ) {
    [fabricPart, configPart] =
      [configPart, fabricPart];
  }

  const code = extractCode(fabricPart);

  return {
    model: normalize(model),
    code: normalize(code),
    config: normalize(configPart)
  };
}

// =====================================================
// GRADE
// =====================================================
function getGrade(code) {

  const safeCode = normalize(code);

  if (
    !safeCode ||
    safeCode === "DEFAULT" ||
    safeCode === "RAW" ||
    safeCode === "BED"
  ) {
    return "DEFAULT";
  }

  const item = material_master.find(
    m => normalize(m.code) === safeCode
  );

  if (!item) {
    console.warn(
      `Unknown material code: ${safeCode}`
    );

    return "DEFAULT";
  }

  return normalize(
    item.grade || "DEFAULT"
  );
}

// =====================================================
// PRICE LOOKUP
// =====================================================
function getFinalPrice(model, config, grade) {

  const safeModel = normalize(model);
  const safeConfig = normalize(config);
  const safeGrade = normalize(
    grade || "DEFAULT"
  );

  const findRow = (cfg) => {

    const normalizedCfg = normalize(cfg);

    // EXACT
    let row = price_sheet.find(p =>
      normalize(p.model) === safeModel &&
      normalize(p.config) === normalizedCfg &&
      normalize(p.grade || "DEFAULT") === safeGrade
    );

    if (row) return row;

    // CONFIG ONLY
    row = price_sheet.find(p =>
      normalize(p.model) === safeModel &&
      normalize(p.config) === normalizedCfg
    );

    if (row) return row;

    return null;
  };

  // COMBO CONFIGS
  if (safeConfig.includes("+")) {

    return safeConfig
      .split("+")
      .reduce((sum, part) => {

        const row = findRow(part);

        if (!row) {
          throw new Error(
            `Missing config part price: ${part}`
          );
        }

        return sum + Number(row.price);

      }, 0);
  }

  const item = findRow(safeConfig);

  if (!item) {
    throw new Error(
      `Price not found: ${safeModel} | ${safeConfig} | ${safeGrade}`
    );
  }

  return Number(item.price);
}

// =====================================================
// SMART EXACT ENGINE
// =====================================================
function generateUnifiedPlan(
  results,
  tolerance = 10
) {

  if (!results?.length) {
    return null;
  }

  // LOWEST PRICE = BASE
  const base = results.reduce((a, b) =>
    Number(b.price) < Number(a.price)
      ? b
      : a
  );

  const basePrice = Number(base.price);

  const colourExtras = {
    [base.code]: 0
  };

  const configExtras = {
    [base.config]: 0
  };

  // CONFIG EXTRAS
  results
    .filter(r => r.code === base.code)
    .forEach(r => {

      configExtras[r.config] =
        Number(r.price) - basePrice;

    });

  // COLOUR EXTRAS
  results
    .filter(r => r.config === base.config)
    .forEach(r => {

      colourExtras[r.code] =
        Number(r.price) - basePrice;

    });

  // VALIDATION
  const validation = results.map(r => {

    const predicted =
      basePrice +
      (colourExtras[r.code] || 0) +
      (configExtras[r.config] || 0);

    const diff =
      predicted - Number(r.price);

    return {
      ...r,
      predicted,
      diff,
      fits:
        Math.abs(diff) <= tolerance,
      status:
        Math.abs(diff) <= tolerance
          ? "EXACT"
          : "MISMATCH"
    };
  });

  const mismatches =
    validation.filter(v => !v.fits);

  const maxDiff = mismatches.length
    ? Math.max(
        ...mismatches.map(v =>
          Math.abs(v.diff)
        )
      )
    : 0;

  const forcedExact =
    maxDiff > tolerance;

  const exactOverrides = forcedExact
    ? results.map(r => ({
        model: r.model,
        code: r.code,
        config: r.config,
        actual: Number(r.price)
      }))
    : [];

  return {
    model: results[0].model,
    grade: results[0].grade,

    base,
    basePrice,

    anchorColour: base.code,
    anchorConfig: base.config,

    colourExtras,
    configExtras,

    validation,

    exactOverrides,

    mismatchCount: mismatches.length,
    maxDiff,

    tolerance,

    forcedExact,

    pricingMode:
      forcedExact
        ? "FORCED EXACT"
        : "SHARED ADDITIVE"
  };
}

// =====================================================
// PLAN GENERATOR
// =====================================================
function generatePlans(results) {

  const grouped = {};

  for (const r of results) {

    const key =
      `${normalize(r.model)}__${normalize(r.grade)}`;

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(r);
  }

  const plans = {};

  for (const [key, rows] of Object.entries(grouped)) {

    const plan =
      generateUnifiedPlan(rows);

    if (plan) {

      const [model, grade] =
        key.split("__");

      plan.model = model;
      plan.grade = grade;
      plan.groupKey = key;
    }

    plans[key] = plan;
  }

  return plans;
}

// =====================================================
// GLOBALS
// =====================================================
window.runCalculator = runCalculator;
window.copyOdooPlan = copyOdooPlan;
