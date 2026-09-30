import { createElement, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { loadWorksheet, saveWorksheet, useWorksheetsHydration, worksheetSyncState } from "../../stores/worksheetStore";

// Shared non-component helpers for the six Feasibility Study worksheets (transcribed
// from ADUAtlas's own workbook). Each worksheet stores a flat map of
// { fieldId: value } under builder_packet.worksheets[key], with a debounced
// autosave. See src/stores/worksheetStore.js for how the local copy and the
// server copy are kept apart and reconciled.

export const money = (n) => `$${Math.round(n || 0).toLocaleString()}`;
export const num = (v) => Number(v) || 0;

const valuesOf = (sheet) => (sheet && typeof sheet.values === "object" && sheet.values) || {};

// One worksheet's fields, persisted.
//
// R3-02: the page waits for the server copy before it saves anything. It
// renders whatever this browser holds at once, re-reads when the store says the
// server's copy has arrived (on a new device that is the saved sheet), and keeps
// anything typed meanwhile on top of it. Every save names the copy the page
// started from, so the store lays only the fields the homeowner changed on the
// stored copy. A save made before the server's copy has been read stays in this
// browser (the store sends nothing until then, and then only those changes, on
// top of the server's copy), so what is typed while a slow read is still being
// tried survives leaving the page. A sheet is therefore never written from a
// copy that did not come from the server, even on a device holding an older
// copy whose read failed. The fourth value says whether that read has settled,
// and the fifth is the store's status ("failed" when the saved work could not
// be loaded yet).
export const usePersistedWorksheet = (key) => {
  const { settled, status, version } = useWorksheetsHydration();
  const [sheet, setSheet] = useState(() => ({ key, version, base: valuesOf(loadWorksheet(key)), edits: {} }));
  const [savedAt, setSavedAt] = useState(null);

  // A newer copy arrived after this page first rendered: show it, with the
  // homeowner's unsaved edits kept on top.
  let current = sheet;
  if (sheet.key !== key || sheet.version !== version) {
    current = { key, version, base: valuesOf(loadWorksheet(key)), edits: sheet.key === key ? sheet.edits : {} };
    setSheet(current);
  }
  const { base, edits } = current;
  const data = useMemo(() => ({ ...base, ...edits }), [base, edits]);
  const dirty = Object.keys(edits).length > 0;

  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(() => {
      const saved = saveWorksheet(key, { values: data }, { base: { values: base } });
      setSheet((s) => (s.key === key ? { ...s, base: { ...valuesOf(saved) }, edits: {} } : s));
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [key, base, data, dirty]);

  const set = (field, value) => setSheet((s) => ({ ...s, edits: { ...s.edits, [field]: value } }));
  return [data, set, savedAt, settled, status];
};

// What the worksheet bar may say after a save made on this page (`savedAt`), or
// null before one.
//   "saved"   the server has accepted everything this browser holds
//   "saving"  a write is in flight
//   "device"  the copy is only in this browser: not sent yet (the server copy has
//             not been read), refused, or failed
// T4-20 (RC4 rehearsal): the bar said "Saved" from the local write alone, so an
// account the server refused (403 42501) was told its work was saved, and so
// would a Platinum buyer whose sync was failing. The store keeps a refused write
// pending on purpose; this only reads those marks (worksheetSyncState). Every
// sheet travels in the same write, so a mark on any of them means this device
// holds work the account does not. The store announces no write's outcome, so
// the bar looks again (every half second while a write is in flight, every
// second otherwise) until nothing is unsent.
export const useWorksheetSaveState = (savedAt) => {
  useWorksheetsHydration(); // render again when the read lands or the account changes
  const [, setLook] = useState(0);
  const sync = savedAt ? worksheetSyncState() : null;
  const state = !sync ? null : sync.unsent.length === 0 ? "saved" : sync.sending ? "saving" : "device";
  useEffect(() => {
    if (!state || state === "saved") return undefined;
    const t = setTimeout(() => setLook((n) => n + 1), state === "saving" ? 500 : 1000);
    return () => clearTimeout(t);
  });
  return state;
};

// For a page that reads its saved worksheets or lot ONCE, when it mounts (the
// Ready Score, the Feasibility tool): wrap it, e.g.
//   <WorksheetsReady><ReadyScore /></WorksheetsReady>
// and it first renders only after the server copy has been read, so on a new
// device it opens on the saved data instead of a blank sheet (R3-02). A later
// read that changes this browser's copy (a sign-in to another account, a retry
// after a failed read) is shown by mounting the page afresh. Mounting afresh
// throws away a save the page has not made yet (the Ready Score waits 600 ms
// before it saves, the Feasibility tool 800 ms), so it waits until nothing has
// been clicked or typed anywhere on the page for QUIET_MS. Until then the page
// keeps what it shows, and a save it makes counts only what was changed on it
// (worksheetStore rule 4). When the read failed, the page opens with a plain
// notice above it; the store keeps trying.
const QUIET_MS = 2000;
const INPUT_EVENTS = ["pointerdown", "keydown", "input", "change"];

const WAITING = createElement(
  "p",
  { role: "status", className: "px-5 sm:px-8 lg:px-12 py-10 sm:py-14 text-paper-dim text-sm" },
  "Loading your saved work."
);

const NOT_LOADED =
  "We could not load your saved work yet, so this page may not show everything you saved. We will keep trying. Anything you change here is kept on this device and added to your saved work once it loads. If you log out before then, those changes are removed from this device.";

export const WorksheetsReady = ({ children, fallback = WAITING }) => {
  const { settled, status, version } = useWorksheetsHydration();
  const [shown, setShown] = useState(settled);
  const [mounted, setMounted] = useState(version);
  const lastInput = useRef(0);
  if (settled && !shown) {
    // The first render: nothing on screen yet, so take the copy as it is now.
    setShown(true);
    setMounted(version);
  }

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const note = () => {
      lastInput.current = Date.now();
    };
    for (const type of INPUT_EVENTS) document.addEventListener(type, note, true);
    return () => {
      for (const type of INPUT_EVENTS) document.removeEventListener(type, note, true);
    };
  }, []);

  useEffect(() => {
    if (!shown || mounted === version) return undefined;
    let timer;
    const remountWhenQuiet = () => {
      const wait = lastInput.current + QUIET_MS - Date.now();
      if (wait > 0) timer = setTimeout(remountWhenQuiet, wait);
      else setMounted(version);
    };
    timer = setTimeout(remountWhenQuiet, 0);
    return () => clearTimeout(timer);
  }, [shown, mounted, version]);

  if (!shown && !settled) return fallback;
  const notice =
    status === "failed"
      ? createElement("p", { role: "status", className: "px-5 sm:px-8 lg:px-12 pt-6 text-amber-700 text-sm" }, NOT_LOADED)
      : null;
  return createElement(Fragment, { key: mounted }, notice, children);
};
