// One place that writes the document head for a route: the title, the meta
// description, the canonical link, and the Open Graph and Twitter title,
// description and url.
//
// index.html ships the site defaults. In a single page app those tags outlive
// the page that set them, so a route that says nothing of its own would keep
// showing the previous page's description and canonical url to a crawler.
// Every route therefore writes the whole set again: applyTitle() in
// pageTitles.js calls setHead() on each navigation with that route's title and
// description, and a page that knows more than the route table does (the
// public builder profile) calls setHead() again once its record has loaded.
// The profile's call lands after applyTitle() because it waits on a fetch.

export const SITE = "ADUAtlas";

// Canonical urls are absolute and always point at the production origin, so a
// preview deployment never asks to be indexed in place of the real page. This
// is also the origin public/robots.txt and api/sitemap.js use.
export const SITE_ORIGIN = "https://aduatlas.com";

export const DEFAULT_TITLE = `${SITE}: Your ADU or Tiny Home Starts Here`;
export const DEFAULT_DESCRIPTION =
  "Want an ADU or tiny home? Find out what you can build on your property, what it may cost, and what to do next.";

// Query strings and hashes never identify a different page here, so they are
// dropped. A trailing slash is dropped as well, except on the home page.
export const canonicalUrl = (path = "/") => {
  const bare = String(path || "/").split("?")[0].split("#")[0];
  const rooted = bare.startsWith("/") ? bare : `/${bare}`;
  const trimmed = rooted.length > 1 ? rooted.replace(/\/+$/, "") : "/";
  return `${SITE_ORIGIN}${trimmed || "/"}`;
};

// Search engines cut a description off somewhere near 160 characters, and a
// builder's own words can run much longer than that. Cut on a word boundary
// rather than mid word.
export const clampText = (text, max = 300) => {
  const one = String(text || "").replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.]+$/, "")}...`;
};

const findOrCreate = (selector, create) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
};

const setMeta = (attr, name, content) => {
  const el = findOrCreate(`meta[${attr}="${name}"]`, () => {
    const meta = document.createElement("meta");
    meta.setAttribute(attr, name);
    return meta;
  });
  el.setAttribute("content", content);
};

const setLink = (rel, href) => {
  const el = findOrCreate(`link[rel="${rel}"]`, () => {
    const link = document.createElement("link");
    link.setAttribute("rel", rel);
    return link;
  });
  el.setAttribute("href", href);
};

// A page's own robots directive (2l: a thin, missing or unavailable page asks
// not to be indexed). It lives in ONE tag that carries a marker, so it never
// edits or removes the robots tags other components add for themselves (the
// government portal and the sponsored entry page append their own and remove
// them on unmount).
//
// OWNED BY THE PAGE, NOT THE ROUTE. applyTitle() runs on every navigation and
// never passes `robots`, so it leaves this tag alone; the page that decided
// "noindex" is the one that clears it, from its effect's cleanup, which React
// runs before the next page's effects. A page that sets it therefore does:
//
//   useEffect(() => {
//     if (!noindex) return undefined;
//     setRobots("noindex");
//     return () => setRobots(null);
//   }, [noindex]);
//
// setRobots(null) removes the tag, which leaves the index.html default (no
// robots tag, so indexable) in force.
const ROBOTS_SELECTOR = 'meta[name="robots"][data-page-robots]';

export const setRobots = (content) => {
  if (typeof document === "undefined") return;
  const existing = document.head.querySelector(ROBOTS_SELECTOR);
  if (!content) {
    if (existing) existing.remove();
    return;
  }
  const el =
    existing ||
    (() => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      meta.setAttribute("data-page-robots", "");
      document.head.appendChild(meta);
      return meta;
    })();
  el.setAttribute("content", content);
};

// `title` is the finished document title, including the site name, because the
// route table already knows how it wants to read. `description` and `path` fall
// back to the site defaults so no route can leave another page's text behind.
// `robots` is optional and only touched when passed: a string sets the page's
// robots directive, null clears it, and leaving it out changes nothing (see
// setRobots above for who owns that tag).
export const setHead = ({ title, description, path = "/", robots } = {}) => {
  if (typeof document === "undefined") return;
  const heading = title || DEFAULT_TITLE;
  const desc = clampText(description || DEFAULT_DESCRIPTION);
  const url = canonicalUrl(path);
  document.title = heading;
  setMeta("name", "description", desc);
  setLink("canonical", url);
  setMeta("property", "og:title", heading);
  setMeta("property", "og:description", desc);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", heading);
  setMeta("name", "twitter:description", desc);
  setMeta("name", "twitter:url", url);
  if (robots !== undefined) setRobots(robots);
};
