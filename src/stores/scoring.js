// Hardcoded mock scoring for Results page.
// INTEGRATION POINT: replace with server-side computation once we have
// real zoning data per ZIP and lot-level GIS data.
//
// Score model: lot/budget/timeline reflect physical readiness.
// Knowledge questions intentionally have HIGH weight when low — this
// is the gap-exposure mechanic. Score caps at ~75 if knowledge is weak,
// even with a perfect lot/budget — by design.

const lotPoints = {
  "under-3000": 4,
  "3000-5000": 10,
  "5000-10000": 14,
  "10000+": 16,
  "unsure": 6,
};

const budgetPoints = {
  "under-100k": 4,
  "100-200k": 10,
  "200-400k": 14,
  "400k+": 16,
  "unsure": 5,
};

const timelinePoints = {
  "6mo": 14,
  "6-12mo": 12,
  "1-2yr": 9,
  "exploring": 6,
};

const zoningPoints = {
  deep: 25,
  general: 12,
  heard: 5,
  none: 0,
};

const sitePoints = {
  quoted: 25,
  estimated: 12,
  assumed: 4,
  unaware: 0,
};

export const calculateScore = (a) => {
  const baseline = 4;
  const lot = lotPoints[a.lotSize] ?? 0;
  const budget = budgetPoints[a.budget] ?? 0;
  const timeline = timelinePoints[a.timeline] ?? 0;
  const zoning = zoningPoints[a.zoningKnowledge] ?? 0;
  const site = sitePoints[a.siteCostKnowledge] ?? 0;

  const score = Math.min(100, Math.max(0, baseline + lot + budget + timeline + zoning + site));

  let band = "Major gaps to close";
  if (score >= 80) band = "Build-ready";
  else if (score >= 60) band = "Almost there";
  else if (score >= 40) band = "Foundational gaps";

  const findings = buildFindings(a, score);

  return { score, band, findings };
};

const buildFindings = (a, score) => {
  const findings = [];

  // Always lead with a zoning gap if knowledge is weak.
  if (a.zoningKnowledge === "none" || a.zoningKnowledge === "heard") {
    findings.push(
      `You haven't reviewed your local ADU code yet. Most homeowners discover too late that their city limits ADU size as a % of the primary home, requires specific setbacks, or restricts height — your full plan resolves this for ZIP ${a.zip}.`
    );
  } else if (a.zoningKnowledge === "general") {
    findings.push(
      `You know ADUs are allowed in your area but haven't gone through the specific rules. Cities differ on max ADU sq ft, setbacks, parking, and owner-occupancy — and these change. Your full plan loads the current code for ZIP ${a.zip}.`
    );
  } else {
    findings.push(
      `You've reviewed your local code, which puts you ahead of ~80% of homeowners. Your full plan checks for any recent changes and confirms how the rules apply to your specific lot.`
    );
  }

  // Site/utility cost gap.
  if (a.siteCostKnowledge === "unaware" || a.siteCostKnowledge === "assumed") {
    findings.push(
      `Site prep and utility hookups are the #1 surprise expense — they regularly add $10K–$100K to a project. You haven't accounted for these yet, which means any builder quote you've seen so far is probably missing the biggest line items.`
    );
  } else if (a.siteCostKnowledge === "estimated") {
    findings.push(
      `You have a rough estimate for site prep and utilities, but rough numbers shift fast — sewer depth, soil, slope, and stormwater all swing the total. Your full plan replaces guesses with a worksheet calibrated to your lot.`
    );
  } else {
    findings.push(
      `You already have written quotes for site work — this is rare and gives you real leverage. Your full plan helps you compare those quotes apples-to-apples and spot exclusions.`
    );
  }

  // Budget/timeline-derived risk.
  if (a.budget === "unsure") {
    findings.push(
      `You haven't locked a budget yet. Without one, builders give wildly different quotes and you can't compare them. Your full plan generates a defensible budget range based on your lot and ADU type.`
    );
  } else if (a.timeline === "6mo" && score < 70) {
    findings.push(
      `You want to break ground in 6 months but you have foundational gaps. Permitting alone is typically 1–2 months. Without a feasibility study and clear scope, this timeline is unrealistic — your full plan compresses the prep work.`
    );
  } else {
    findings.push(
      `Your budget and timeline are realistic. The next bottleneck is a defensible scope of work — your full plan generates a builder-ready RFP so quotes are comparable.`
    );
  }

  return findings;
};
