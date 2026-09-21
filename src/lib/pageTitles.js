// Document titles per route, so the browser tab, history and search results
// name the page instead of repeating the site tagline everywhere.
const SITE = "ADUAtlas";
const TITLES = [
  ["/", "Your ADU or Tiny Home Starts Here"],
  ["/property", "Check my property"],
  ["/find-a-builder", "Find a builder"],
  ["/how-to-adu", "How it works"],
  ["/course-outline", "The ADUAtlas course"],
  ["/unlock", "Plans and pricing"],
  ["/pricing", "Plans and pricing"],
  ["/feasibility-study", "Feasibility study"],
  ["/adu-types", "ADU types"],
  ["/faq", "FAQ"],
  ["/about", "About"],
  ["/methodology", "Methodology"],
  ["/legal", "Privacy and terms"],
  ["/login", "Sign in"],
  ["/signup", "Create account"],
  ["/create-account", "Create account"],
  ["/forgot-password", "Reset password"],
  ["/welcome", "Welcome"],
  ["/dashboard", "Overview"],
  ["/my-property", "Property"],
  ["/course", "Learn"],
  ["/study", "Feasibility study"],
  ["/site-plan", "Site plan"],
  ["/costs", "Costs"],
  ["/adu-options", "ADU options"],
  ["/builders", "Builders"],
  ["/support", "Concierge support"],
  ["/settings", "Settings"],
  ["/packet", "Worksheets"],
  ["/feasibility", "Buildable envelope"],
  ["/report", "My report"],
  ["/utility-estimator", "Utility estimator"],
  ["/admin/studies", "Studies · Admin"],
  ["/admin/builders", "Builders · Admin"],
  ["/admin/content", "Content · Admin"],
  ["/admin/users", "Users · Admin"],
  ["/admin/admins", "Admins · Admin"],
  ["/admin", "Admin"],
];

export const titleFor = (pathname) => {
  const exact = TITLES.find(([p]) => p === pathname);
  if (exact) return exact[1];
  const prefix = TITLES.filter(([p]) => p !== "/" && pathname.startsWith(p + "/")).sort((a, b) => b[0].length - a[0].length)[0];
  return prefix ? prefix[1] : null;
};

export const applyTitle = (pathname) => {
  if (typeof document === "undefined") return;
  const t = titleFor(pathname);
  document.title = pathname === "/" ? `${SITE} — ${t}` : t ? `${t} · ${SITE}` : SITE;
};
