// Mock payment store. Returns whether the current user has access to gated
// content (the course, builders, feasibility tool).
//
// INTEGRATION POINT (Supabase + Stripe webhook): replace with a check
// against `users.paid_at` in Supabase. The webhook on
// `checkout.session.completed` sets that timestamp; this function should
// return true iff paid_at is non-null AND not refunded.
//
// For now: localStorage.getItem('aduatlas.mock.paid') === '1' grants access.
// Use the dev-only bookmarklet:
//   javascript:localStorage.setItem('aduatlas.mock.paid','1');location.reload();
// Or visit /welcome (mock checkout flow auto-sets the flag).

const KEY = "aduatlas.mock.paid";

export const isPaid = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
};

export const setPaid = (v) => {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(KEY, "1");
  else window.localStorage.removeItem(KEY);
};
