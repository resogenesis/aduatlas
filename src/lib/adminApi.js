// Client for the /api/admin/* endpoints. Attaches the signed-in user's Supabase
// access token so the server can verify admin status. All enforcement is
// server-side; this is just a typed fetch wrapper.
import { supabase } from "./supabase";

const authHeader = async () => {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseError = async (r) => {
  const body = await r.json().catch(() => ({}));
  return body.error || r.statusText || "request failed";
};

export const adminGet = async (path) => {
  const r = await fetch(`/api/admin/${path}`, { headers: await authHeader() });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
};

export const adminPost = async (path, body) => {
  const r = await fetch(`/api/admin/${path}`, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
};
