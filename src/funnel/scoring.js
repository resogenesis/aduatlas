// Hardcoded mock scoring for Results page.
// INTEGRATION POINT: replace with server-side computation once we have
// real zoning data per ZIP and lot-level GIS data.

const lotPoints = {
  "under-3000": 5,
  "3000-5000": 15,
  "5000-10000": 22,
  "10000+": 25,
  "unsure": 10,
};

const budgetPoints = {
  "under-100k": 5,
  "100-200k": 15,
  "200-400k": 22,
  "400k+": 25,
  "unsure": 8,
};

const timelinePoints = {
  "6mo": 25,
  "6-12mo": 20,
  "1-2yr": 15,
  "exploring": 10,
};

const concernCopy = {
  zoning: "Your top concern is zoning — we'll show you exactly what your city allows before you commit to a design.",
  cost: "Your top concern is cost — site prep and utility hookups are usually the biggest surprise expense, and we'll model them for you.",
  builder: "Your top concern is finding a builder — we'll match you with vetted local builders after your feasibility study.",
  financing: "Your top concern is financing — most homeowners use HELOC, cash-out refi, or an ADU-specific loan; we'll outline your options.",
  hoa: "Your top concern is HOA restrictions — even when zoning allows an ADU, your HOA's CC&Rs can override. We'll help you check.",
  other: "We'll help you work through your specific concern as part of the structured course.",
};

export const calculateScore = (a) => {
  const lot = lotPoints[a.lotSize] ?? 0;
  const budget = budgetPoints[a.budget] ?? 0;
  const timeline = timelinePoints[a.timeline] ?? 0;
  const baseline = 25; // every visitor starts with some baseline credit
  const score = Math.min(100, Math.max(0, lot + budget + timeline + baseline));

  let band = "Needs more info";
  if (score >= 80) band = "Strong fit";
  else if (score >= 60) band = "Good fit";
  else if (score >= 40) band = "Possible fit";

  const findings = [
    `Based on your ZIP (${a.zip || "—"}), we'll pull your local ADU regulations and confirm what you can legally build.`,
    `Your lot size suggests room for ~${estimateMaxAdu(a.lotSize)} sq ft of detached ADU before setbacks and lot-coverage rules apply.`,
    concernCopy[a.topConcern] || concernCopy.other,
  ];

  return { score, band, findings };
};

const estimateMaxAdu = (lotSize) => {
  switch (lotSize) {
    case "under-3000": return 350;
    case "3000-5000": return 600;
    case "5000-10000": return 900;
    case "10000+": return 1200;
    default: return 600;
  }
};
