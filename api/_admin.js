// Shared admin-auth helper for the /api/admin/* endpoints. Underscore prefix
// keeps Vercel from routing this file as its own endpoint.
//
// Security model: every admin endpoint runs with the SERVICE ROLE (bypasses
// RLS) but MUST first call requireAdmin(req) to confirm the CALLER is a
// signed-in admin. The caller proves identity with their Supabase access token
// in the Authorization: Bearer header; we validate it and check users.role.
// A non-admin (or missing/invalid token) gets null → the endpoint 403s.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const service = () => {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const readBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
};

// Returns { user, row, svc } when the request is from an admin, else null.
export const requireAdmin = async (req) => {
  const svc = service();
  if (!svc) return null;
  const authz = req.headers.authorization || req.headers.Authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return null;

  const { data, error } = await svc.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: row } = await svc
    .from("users")
    .select("id, email, role, auth_user_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (row?.role !== "admin") return null;
  return { user: data.user, row, svc };
};
