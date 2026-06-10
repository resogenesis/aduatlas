// PostHog analytics. Env-var driven; no-op when unset.
//
// Required env vars:
//   VITE_POSTHOG_KEY
//   VITE_POSTHOG_HOST  (optional, defaults to https://us.i.posthog.com)

import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

export const analyticsEnabled = Boolean(key);
let initialized = false;

export const initAnalytics = () => {
  if (initialized || !key) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    autocapture: true,
    persistence: "localStorage",
  });
  initialized = true;
};

// Funnel events. Always callable; silently no-op when unset.
export const track = (event, props = {}) => {
  if (!initialized) return;
  posthog.capture(event, props);
};

export const identify = (id, traits = {}) => {
  if (!initialized) return;
  posthog.identify(id, traits);
};

// Standard event names (single source of truth so dashboards stay sane)
export const EV = {
  ADDRESS_SUBMITTED: "address_submitted",
  PROPERTY_VIEWED: "property_viewed",
  PROPERTY_ROW_EXPANDED: "property_row_expanded",
  QUIZ_STARTED: "quiz_started",
  QUIZ_COMPLETED: "quiz_completed",
  RESULTS_VIEWED: "results_viewed",
  UNLOCK_VIEWED: "unlock_viewed",
  TIER_SELECTED: "tier_selected",
  EMAIL_CAPTURED: "email_captured",
  EMAIL_CAPTURE_FAILED: "email_capture_failed",
  CHECKOUT_STARTED: "checkout_started",
  CHECKOUT_FAILED: "checkout_failed",
  CONCIERGE_CLICKED: "concierge_clicked",
  PURCHASE_COMPLETED: "purchase_completed",
  COURSE_CHAPTER_OPENED: "course_chapter_opened",
  COURSE_CHAPTER_COMPLETED: "course_chapter_completed",
  PROPERTY_BRIEF_SAVED: "property_brief_saved",
  REFUND_REQUESTED: "refund_requested",
};
