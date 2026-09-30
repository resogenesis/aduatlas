// The fifty states and the District of Columbia, and the one rule for reading a
// state out of a URL segment. Structure and display only: nothing in this file is
// a claim about any state's ADU law, and nothing here says whether ADUAtlas holds
// a record for a state. The database answers that.
//
// Shared by the rules index, the state page and the jurisdiction page, so all
// three read "/rules/mo", "/rules/MO" and "/rules/missouri" the same way. Before
// this module each page kept its own copy, and the jurisdiction page did not read
// the state segment at all, which is how /rules/mo/<slug> came to show another
// state's record (DEF-06).

export const STATES = "AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming"
  .split("|")
  .map((pair) => {
    const [code, name] = pair.split(":");
    return { code, name };
  });

// code -> name, e.g. "MO" -> "Missouri".
export const STATE_NAMES = new Map(STATES.map(({ code, name }) => [code, name]));

// Territories are not seeded (migration 0012 promises fifty states and DC), but
// the admin console may add one, so a URL naming one still resolves. They are
// kept out of STATES so the index never lists a territory it has no row for.
export const TERRITORY_NAMES = new Map([
  ["PR", "Puerto Rico"],
  ["VI", "U.S. Virgin Islands"],
  ["GU", "Guam"],
  ["AS", "American Samoa"],
  ["MP", "Northern Mariana Islands"],
]);

// The display name for any code this module knows, or "".
export const placeNameForCode = (code) => {
  const up = String(code || "").toUpperCase();
  return STATE_NAMES.get(up) || TERRITORY_NAMES.get(up) || "";
};

export const slugifyPlace = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const BY_SLUG = new Map([...STATE_NAMES, ...TERRITORY_NAMES].map(([code, name]) => [slugifyPlace(name), code]));

export const isKnownStateCode = (code) => Boolean(placeNameForCode(code));

// A URL segment to a two-letter code, or "" when it names no state.
//
//   "mo", "MO"            -> "MO"
//   "missouri"            -> "MO"
//   "new-york"            -> "NY"
//   "zz", "springfield"   -> ""
//
// An empty answer is final. A caller must render its "missing" state for it and
// must never fall back to looking a record up without the state: a slug is only
// unique inside its state, so a lookup that drops the state can land on another
// state's record.
export const stateCodeFromParam = (param) => {
  const value = String(param || "").trim().toLowerCase();
  if (!value) return "";
  if (value.length === 2) return isKnownStateCode(value) ? value.toUpperCase() : "";
  return BY_SLUG.get(value) || "";
};
