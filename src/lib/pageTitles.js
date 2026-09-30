// Document titles and meta descriptions per route, so the browser tab, the
// history, a shared link and a search result all name the page instead of
// repeating the site tagline everywhere.
//
// applyTitle() hands the finished title and the route's description to
// setHead() in head.js, which also writes the canonical link and the Open Graph
// and Twitter tags. A page that knows more than this table does (the public
// builder profile) calls setHead() itself once its record has loaded.
import { DEFAULT_DESCRIPTION, SITE, setHead } from "./head";

const TITLES = [
  ["/", "Your ADU or Tiny Home Starts Here"],
  ["/find-a-builder", "Find a builder"],
  ["/for-builders", "For builders"],
  ["/how-to-adu", "How it works"],
  ["/course-outline", "The ADUAtlas course"],
  ["/unlock", "Plans and pricing"],
  ["/pricing", "Plans and pricing"],
  ["/feasibility-study", "Feasibility study"],
  ["/adu-types", "ADU types"],
  ["/faq", "FAQ"],
  ["/about", "About"],
  ["/methodology", "Methodology"],
  // ADU Rules and Resources. The state and jurisdiction pages call setHead()
  // themselves once their record has loaded, the way the public builder profile
  // does, because only the record knows the place's name. This entry is the
  // fallback that covers /rules and every path beneath it until that fetch
  // lands, so a crawler or a shared link never sees another page's title.
  ["/rules", "ADU rules and resources"],
  ["/legal", "Privacy and terms"],
  ["/login", "Sign in"],
  ["/signup", "Create account"],
  ["/create-account", "Create account"],
  ["/forgot-password", "Reset your password"],
  ["/reset-password", "Set a new password"],
  ["/welcome", "Welcome"],
  ["/dashboard", "Overview"],
  ["/my-property", "My Property and Site Plan"],
  ["/course", "My Course"],
  ["/study", "Feasibility study"],
  ["/site-plan", "Site plan"],
  ["/costs", "Costs"],
  ["/adu-options", "ADU options"],
  ["/builders", "Builders"],
  ["/builders/join", "Create your builder account"],
  ["/builder", "Builder dashboard"],
  ["/builder/profile", "Builder profile"],
  // Messages (decision 2h). Each entry also covers the conversation paths
  // beneath it (/messages/<id>, /builder/messages/<id>) through the prefix
  // match, so an open thread is titled "Messages" and never falls back to the
  // bare site name.
  ["/builder/messages", "Messages · Builder portal"],
  ["/messages", "Messages"],
  // The government portal (decisions 2m, 2o and 2p). One entry per screen, and
  // the identity and partnership wording is kept OUT of these titles: a title is
  // not the place to assert a state, and "Verified Government Account" belongs
  // beside the entity name on the page that read it from the server.
  ["/gov/claim", "Claim a government entity"],
  ["/gov/regulatory", "Rules and resources · Government portal"],
  ["/gov/partnership", "Resident access · Government portal"],
  ["/gov", "Government portal"],
  // Sponsored resident entry. Covers /partner and every token path beneath it
  // through the prefix match, so a url carrying a token never borrows another
  // page's title.
  ["/partner", "Sponsored course access"],
  ["/support", "Concierge support"],
  ["/help", "Help"],
  ["/settings", "Settings"],
  ["/packet", "Worksheets"],
  ["/feasibility", "Buildable envelope"],
  ["/report", "My report"],
  ["/utility-estimator", "Utility estimator"],
  ["/admin/studies", "Studies · Admin"],
  ["/admin/builders", "Builders · Admin"],
  ["/admin/regulatory", "Rules and Resources · Admin"],
  ["/admin/content", "Content · Admin"],
  ["/admin/users", "Users · Admin"],
  ["/admin/admins", "Admins · Admin"],
  ["/admin", "Admin"],
];

// Meta descriptions for the public, indexable routes. Everything else falls
// back to the site description: the paid app, the builder portal and the admin
// console are disallowed in public/robots.txt, so their pages never need one of
// their own. A builder profile writes its own from the company record.
const PLANS_DESCRIPTION =
  "Compare the three ADUAtlas plans and what each one includes, from the full course through a feasibility study and a site plan prepared for your property.";
const DESCRIPTIONS = [
  ["/", DEFAULT_DESCRIPTION],
  ["/find-a-builder", "Browse ADU builder profiles by state and service area on one comparable template. A paid plan adds search, filters and an introduction sent for you."],
  ["/for-builders", "List your ADU company on ADUAtlas. Claim your profile for a referral link, a dashboard of your own counts and the Verified badge after verification."],
  ["/how-to-adu", "How ADUAtlas works, from the course on ADU rules and costs through a feasibility study and a site plan prepared for your property."],
  ["/course-outline", "The nine module ADUAtlas course, from the rules where you live through choosing a builder and signing a contract."],
  ["/unlock", PLANS_DESCRIPTION],
  ["/pricing", PLANS_DESCRIPTION],
  ["/feasibility-study", "What an ADUAtlas feasibility study answers about your property, and how the site plan shows both what could fit and the arrangement you want."],
  ["/adu-types", "Detached, attached, garage conversion, interior and factory built ADUs, with what each kind asks of your lot and your budget."],
  ["/faq", "Answers to the questions homeowners ask before starting an ADU, from rules and permits to cost, timelines and choosing a builder."],
  ["/about", "Who ADUAtlas is for and why it exists. We help homeowners understand what they can build before they spend money finding out."],
  ["/methodology", "How ADUAtlas produces its estimates and feasibility findings, and where the public records behind the numbers come from."],
  // Honest by design: the description promises sourced rules and states
  // outright that coverage is partial, because the page cannot claim
  // nationwide completeness it does not have (decision 2l).
  ["/rules", "What state, county and city governments publish about ADUs, with the official source and its dates beside every rule. All fifty states are supported; the detail is filled in jurisdiction by jurisdiction, and the pages say which is which."],
  ["/legal", "The ADUAtlas privacy policy and terms of use, including what we collect and how the refund window works."],
  // The sponsored entry page is noindex (it carries a token), but a resident may
  // still paste the link into a message, so the preview text has to be true
  // before anything is checked: it describes what the page does and states the
  // sponsorship CONDITIONALLY. It never says a government endorses ADUAtlas.
  ["/partner", "If your city, county or state sponsors ADUAtlas education, a partner link or code gives you the full homeowner ADU course at no cost. Sponsoring education is not an endorsement of ADUAtlas, any builder or any result."],
];

const matchIn = (list, pathname) => {
  const exact = list.find(([p]) => p === pathname);
  if (exact) return exact[1];
  const prefix = list
    .filter(([p]) => p !== "/" && pathname.startsWith(p + "/"))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return prefix ? prefix[1] : null;
};

export const titleFor = (pathname) => matchIn(TITLES, pathname);

export const descriptionFor = (pathname) => matchIn(DESCRIPTIONS, pathname) || DEFAULT_DESCRIPTION;

// The finished document title for a route, site name included.
export const documentTitleFor = (pathname) => {
  const t = titleFor(pathname);
  if (pathname === "/") return `${SITE}: ${t}`;
  return t ? `${t} · ${SITE}` : SITE;
};

export const applyTitle = (pathname) => {
  if (typeof document === "undefined") return;
  setHead({ title: documentTitleFor(pathname), description: descriptionFor(pathname), path: pathname });
};
