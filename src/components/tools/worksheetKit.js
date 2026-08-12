import { useEffect, useRef, useState } from "react";
import { loadWorksheet, saveWorksheet } from "../../stores/worksheetStore";

// Shared non-component helpers for the six Feasibility Study worksheets (transcribed
// from ADUAtlas's own workbook). Each worksheet stores a flat map of
// { fieldId: value } under builder_packet.worksheets[key] — debounced
// autosave, local-first with best-effort Supabase mirror.

export const money = (n) => `$${Math.round(n || 0).toLocaleString()}`;
export const num = (v) => Number(v) || 0;

export const usePersistedWorksheet = (key) => {
  const [data, setData] = useState(() => loadWorksheet(key)?.values || {});
  const [savedAt, setSavedAt] = useState(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      saveWorksheet(key, { values: data });
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [key, data]);
  const set = (field, value) => setData((d) => ({ ...d, [field]: value }));
  return [data, set, savedAt];
};
