// Public read side of the admin content-management layer (see
// supabase/migrations/0002_site_content.sql and src/lib/contentRegistry/index.js).
// Fetches published content once, cached via React Query, and exposes small
// hooks pages call by key in place of their old hardcoded consts. With zero
// published rows (or Supabase disabled) every hook falls back to
// CONTENT[key].default — the exact same value the page used to hardcode —
// so rollout is additive and never breaks a page that hasn't been edited yet.
import { useQuery } from "@tanstack/react-query";
import { supabase, supabaseEnabled } from "./supabase";
import { CONTENT } from "./contentRegistry";

const fetchPublishedContent = async () => {
  if (!supabaseEnabled) return {};
  const { data, error } = await supabase.rpc("get_site_content");
  if (error) return {};
  const byKey = {};
  for (const row of data || []) {
    byKey[row.key] = { type: row.type, value: row.value };
  }
  return byKey;
};

export const useSiteContent = () =>
  useQuery({
    queryKey: ["site-content"],
    queryFn: fetchPublishedContent,
    staleTime: 5 * 60 * 1000,
  });

// text: published value shape is { text: "..." }. May contain "\n\n" to
// separate paragraphs for fields that render as multiple <p> tags.
export const useContentText = (key) => {
  const { data } = useSiteContent();
  const entry = data?.[key];
  const text = entry?.type === "text" ? entry.value?.text : undefined;
  if (typeof text === "string" && text.length) return text;
  return CONTENT[key]?.default ?? "";
};

// Splits a useContentText() value on blank lines, for fields that render as
// multiple paragraphs (e.g. About's chapter bodies).
export const paragraphs = (text) => (text || "").split(/\n{2,}/).filter(Boolean);

// blocks: published value shape mirrors CHAPTER_CONTENT's per-chapter arrays
// directly (array of { p } | { h, p } | { h, list } | { remember } objects).
// Structure (which blocks exist, in what order) always comes from the
// registry default — only the string leaves inside each block can differ.
export const useContentBlocks = (key) => {
  const { data } = useSiteContent();
  const entry = data?.[key];
  const blocks = entry?.type === "blocks" ? entry.value : undefined;
  return Array.isArray(blocks) && blocks.length ? blocks : CONTENT[key]?.default ?? [];
};

// image: published value shape is { url, alt }.
export const useContentImage = (key) => {
  const { data } = useSiteContent();
  const entry = data?.[key];
  const image = entry?.type === "image" ? entry.value : undefined;
  const fallback = CONTENT[key]?.default;
  if (image?.url) return { src: image.url, alt: image.alt || fallback?.alt || "" };
  return fallback || { src: "", alt: "" };
};
