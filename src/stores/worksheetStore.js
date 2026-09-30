// Worksheet state for the preparation worksheets, the ADU Ready Score and the
// lot geometry. All three are PLATINUM AND CONCIERGE ONLY (decision 2), and
// since migration 0013 that is a database boundary rather than a router gate
// (decision 2n).
//
// DATA MODEL, and it is two stores.
//   localStorage (the packet under `worksheets` and `lot`) stays the
//     SYNCHRONOUS copy every render reads. packetProgress() still counts only
//     PACKET_FIELDS, so these keys never skew the packet-completion math.
//   THE SERVER copy lives in public.homeowner_worksheets, whose RLS asks for a
//     live Platinum or Concierge tier held in server state. The Ready Score is
//     the `readyScore` key inside the same worksheets map. The server merges a
//     write one sheet at a time (save_homeowner_worksheets: worksheets || new),
//     so a write names only the sheets it means to change.
//
// THE RULE THIS FILE KEEPS (R3-02, found at the RC3 rehearsal): NOTHING IS
// WRITTEN TO THE SERVER FROM A COPY THAT WAS NOT FIRST RECONCILED WITH THE
// SERVER'S. RC3 read the server copy lazily, in the background, the first time
// a page asked, and nothing waited for it. On a new device the first worksheet
// opened rendered blank, and the first keystroke's autosave sent that blank
// sheet plus one figure, which replaced the saved sheet on the server. Now:
//
//   1. The server copy is read once per page load and per signed-in account,
//      starting as soon as this module loads, and again on every sign-in.
//   2. Until that read has landed, a save stays in this browser and is marked
//      PENDING. It is never sent.
//   3. When the read lands, the server's copy wins for every sheet this browser
//      has nothing unsent for. A sheet with unsent edits is merged THREE WAYS,
//      and only then sent. A save carries the page's whole copy, which is what
//      it was shown plus what was typed, and what it was shown may be older
//      than the server's (a returning device, a failed read). So when a sheet
//      first goes unsent, the copy it started from is recorded, and at merge
//      time only the fields that differ from that copy go on top of the
//      server's. Every other field keeps the server's value. Clearing a field
//      erases only the value the homeowner saw, never one saved since.
//   4. A page that rendered before the read landed is told (a version number,
//      see useWorksheetsHydration) and re-reads. A page that cannot re-read
//      (it only reads once, at mount) is protected here instead. The read
//      records the copy that page was shown, and the page's next save of a
//      sheet the read changed is merged three ways onto the stored copy, until
//      a fresh read of that sheet shows the page has caught up.
//   5. Unsent edits survive a reload (the pending marks, and the copy each one
//      started from, are kept in localStorage beside the packet) and are sent
//      after the next read. Writes go one at a time so an older write can never
//      land after a newer. A read that fails is tried again, sooner at first
//      and then less often.
//   6. A copy this browser holds for ANOTHER account is replaced by the signed-in
//      account's own copy, never merged into it or sent under it.
//   7. A copy with no recorded owner (written by an older build) never
//      overrides the server: the server's values stand, and it only fills
//      fields the server does not have.
//   8. A read that shows nothing for a sheet (never saved there, or the whole
//      row hidden because the entitlement is not live: a refund, a comp
//      withdrawn) changes nothing here. A synced sheet stays synced and is not
//      sent, an unsent one keeps the copy its changes were made from, and an
//      unowned one stays unowned. So when the row can be read again, the
//      server's copy still wins everywhere this browser changed nothing.
//
// A write from an account without the entitlement is refused by the database
// and stays pending here, exactly as intended: the local copy still works, and
// PaidGate is what explains the tier to the customer.

import { useSyncExternalStore } from "react";
import { loadPacket, savePacket } from "./courseStore";
import { fetchEntitledPacket, saveEntitledPacket, supabase } from "../lib/supabase";
import { onAccountScopeReset } from "./accountScope";

// The lot rides in the same row as the worksheets; this is its key among the
// pending marks, chosen so it can never collide with a worksheet key.
const LOT = "@lot";
const SYNC_KEY = "aduatlas.worksheets.sync";
const HYDRATION_TIMEOUT_MS = 10000;
const RETRY_AFTER_MS = 5000;
const RETRY_MAX_MS = 60000;

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || v === "";

// Key-order-independent comparison, so a merge that only reorders keys is not
// mistaken for a change.
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObj(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
};
const same = (a, b) => canonical(a ?? null) === canonical(b ?? null);

// ── Sync bookkeeping (who this browser's copy belongs to, what is unsent) ────
//   owner    the account whose server copy this browser last reconciled with
//   pending  { key: true } for every sheet with changes the server has not got
//   bases    { key: copy } the copy each pending sheet's changes were made from
//            (the server's, as far as this browser knows), null for none
//   unowned  { key: true } for a pending sheet that came from a copy with no
//            recorded owner and has not yet met a server copy of that sheet
//            (rule 8), so it still only fills what the server lacks (rule 7)
const readSync = () => {
  if (typeof window === "undefined") return { owner: null, pending: {}, bases: {}, unowned: {} };
  try {
    const raw = window.localStorage.getItem(SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      owner: typeof parsed?.owner === "string" ? parsed.owner : null,
      pending: isObj(parsed?.pending) ? parsed.pending : {},
      bases: isObj(parsed?.bases) ? parsed.bases : {},
      unowned: isObj(parsed?.unowned) ? parsed.unowned : {},
    };
  } catch {
    return { owner: null, pending: {}, bases: {}, unowned: {} };
  }
};

const writeSync = (sync) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
  } catch {
    // Storage full or blocked: the next page load treats the copy as unknown
    // and merges rather than overwrites, which is the safe direction.
  }
};

// `before` is the stored copy the save replaced. When the sheet had nothing
// unsent, that copy is the server's as far as this browser knows, so it is the
// base the new changes are measured from.
const markPending = (key, before) => {
  const sync = readSync();
  if (!sync.pending[key]) sync.bases = { ...sync.bases, [key]: before ?? null };
  sync.pending = { ...sync.pending, [key]: true };
  writeSync(sync);
};

// ── Filling: one copy's values over another's, blanks never erasing ─────────
// Used for a copy with no recorded owner (rule 7), which goes UNDER the
// server's: overlaySheet(key, local, server).
const overlayFields = (base, top) => {
  const out = { ...(isObj(base) ? base : {}) };
  for (const [field, value] of Object.entries(isObj(top) ? top : {})) {
    if (!isBlank(value) || !(field in out)) out[field] = value;
  }
  return out;
};

// One sheet. The Ready Score's grade is recomputed from the merged answers, so
// a merge can never leave a grade that the answers do not produce.
const overlaySheet = (key, base, top) => {
  if (!isObj(base)) return top;
  if (!isObj(top)) return base;
  if (key === "readyScore") {
    const answers = overlayFields(base.answers, top.answers);
    const result = scoreNape(answers);
    return {
      ...base,
      ...top,
      answers,
      points: result.points,
      grade: result.grade,
      completedAt: result.complete ? top.completedAt || base.completedAt || new Date().toISOString() : null,
    };
  }
  if (isObj(base.values) || isObj(top.values)) {
    return { ...base, ...top, values: overlayFields(base.values, top.values) };
  }
  return { ...base, ...top };
};

// The lot. dimsEstimated describes the width and depth, so it follows whichever
// copy the width and depth came from.
const DIM_KEYS = ["lotWidth", "lotDepth"];
const overlayLot = (base, top) => {
  if (!isObj(base)) return top;
  if (!isObj(top)) return base;
  const out = { ...base };
  for (const [field, value] of Object.entries(top)) {
    if (field === "input" || field === "dimsEstimated") continue;
    if (!isBlank(value)) out[field] = value;
  }
  out.input = overlayFields(base.input, top.input);
  const dimsTyped = DIM_KEYS.some((k) => !isBlank(top.input?.[k]));
  out.dimsEstimated = Boolean(dimsTyped ? top.dimsEstimated : base.dimsEstimated);
  return out;
};

// The server's copy with an unowned local copy filling only what it lacks.
const fillUnder = (key, server, local) => (key === LOT ? overlayLot(local, server) : overlaySheet(key, local, server));

// ── Three-way merge: what the homeowner changed, on top of the server's copy ─
// A save carries the page's WHOLE copy. Only its difference from the copy the
// page started from ("shown") is the homeowner's; the rest is whatever the page
// was showing, which can be older than the server's. So a merge takes those
// changed fields and lays them on the server's copy, and every other field
// keeps the server's value.
//
// The fields: each entry of `values` (the six worksheets), `answers` (the Ready
// Score) and `input` (the lot) is a field of its own; any other top-level key is
// one field (the lot's address, coordinates and lookup snapshot).
const FIELD_MAPS = new Set(["values", "answers", "input"]);
// Worked out from other fields, so never merged as fields of their own: the
// Ready Score's points and grade come from its answers, and the lot's
// dimsEstimated follows whichever copy its width and depth came from.
const DERIVED = { readyScore: new Set(["points", "grade", "completedAt"]), [LOT]: new Set(["dimsEstimated"]) };

const fieldPaths = (sheet) => {
  const out = [];
  if (!isObj(sheet)) return out;
  for (const [top, v] of Object.entries(sheet)) {
    if (FIELD_MAPS.has(top)) {
      for (const field of Object.keys(isObj(v) ? v : {})) out.push([top, field]);
    } else {
      out.push([top]);
    }
  }
  return out;
};

const readPath = (sheet, [top, field]) => {
  if (!isObj(sheet)) return undefined;
  if (field === undefined) return sheet[top];
  return isObj(sheet[top]) ? sheet[top][field] : undefined;
};

const writePath = (out, [top, field], value) => {
  if (field === undefined) {
    if (value === undefined) delete out[top];
    else out[top] = value;
    return;
  }
  const map = { ...(isObj(out[top]) ? out[top] : {}) };
  if (value === undefined) delete map[field];
  else map[field] = value;
  out[top] = map;
};

// The fields `local` changed from `shown`. A field blank in both is unchanged.
const editsOf = (key, local, shown) => {
  const skip = DERIVED[key];
  const paths = new Map();
  for (const path of [...fieldPaths(local), ...fieldPaths(shown)]) paths.set(JSON.stringify(path), path);
  const edits = [];
  for (const path of paths.values()) {
    if (path.length === 1 && skip?.has(path[0])) continue;
    const now = readPath(local, path);
    const was = readPath(shown, path);
    if ((isBlank(now) && isBlank(was)) || same(now, was)) continue;
    edits.push({ path, now, was });
  }
  return edits;
};

// The server's copy with those changes on top. `local` is the page's copy, for
// the derived fields.
const applyEdits = (key, server, edits, local) => {
  const out = isObj(server) ? { ...server } : {};
  let dimsChanged = false;
  for (const { path, now, was } of edits) {
    const current = readPath(out, path);
    // Clearing a field erases only the value the homeowner saw and cleared. A
    // value saved since, from another device, stands.
    if (isBlank(now) && !isBlank(current) && !same(current, was)) continue;
    writePath(out, path, now);
    if (key === LOT && path[0] === "input" && DIM_KEYS.includes(path[1])) dimsChanged = true;
  }
  if (key === "readyScore") {
    const answers = isObj(out.answers) ? out.answers : {};
    const result = scoreNape(answers);
    const answersKept = same(answers, server?.answers);
    out.points = result.points;
    out.grade = result.grade;
    out.completedAt = result.complete
      ? (answersKept && server?.completedAt) || local?.completedAt || server?.completedAt || new Date().toISOString()
      : null;
  }
  if (key === LOT) {
    const from = dimsChanged || !isObj(server) ? local : server;
    out.dimsEstimated = Boolean(from?.dimsEstimated);
  }
  return out;
};

// A save of `data` by a page that started from `shown`, onto `stored`.
const mergeSave = (key, stored, data, shown) => applyEdits(key, stored, editsOf(key, data, shown), data);

// ── Hydration state ─────────────────────────────────────────────────────────
//   idle        nothing asked yet
//   pending     the server copy is being read
//   hydrated    read, and this browser's copy reconciled with it
//   signed-out  no session: there is no server copy to read
//   failed      the read failed or timed out; saves stay local and pending
//   disabled    no Supabase in this environment (the local mock)
const SETTLED = new Set(["hydrated", "signed-out", "failed", "disabled"]);

let status = "idle";
let version = 0;
let generation = 0;
let inflight = null;
let hydratedUser = null;
let latestUid;
let lastAttemptAt = 0;
let flushing = false;
let flushAgain = false;
let retryTimer = null;
let retryDelay = RETRY_AFTER_MS;
// key -> the copy a page that rendered before the last read was shown (null for
// nothing). Held until a fresh read of that key shows the page has caught up.
const stale = new Map();
const listeners = new Set();
let snapshot = { status, settled: false, version };

const setStatus = (next, bump = false) => {
  if (status === next && !bump) return;
  status = next;
  if (bump) version += 1;
  snapshot = { status, settled: SETTLED.has(status), version };
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // one broken subscriber must not stop the others
    }
  }
};

// Reconcile this browser's copy with the server's (rules 3 and 6 above).
// Returns true when the local copy changed.
const applyServerCopy = (res) => {
  const packet = loadPacket();
  const sync = readSync();
  const localSheets = isObj(packet.worksheets) ? packet.worksheets : {};
  const localLot = isObj(packet.lot) ? packet.lot : null;
  const serverSheets = isObj(res.worksheets) ? res.worksheets : {};
  const serverLot = isObj(res.lot) ? res.lot : null;
  const foreign = Boolean(sync.owner) && sync.owner !== res.authUserId;
  // No owner recorded: written before this browser ever read a server copy
  // (work done before the account existed, or by an older build). Nothing says
  // which side is newer, so the server's values stand and this browser's copy
  // only fills fields the server does not have (rule 7). That keeps a newer
  // value typed on another device, and still gives back fields an older build's
  // blank save erased from the server (the RC3 loss) while this browser kept them.
  const unknown = !sync.owner;
  const pending = foreign ? {} : { ...sync.pending };
  const bases = foreign ? {} : { ...sync.bases };
  const unowned = foreign ? {} : { ...sync.unowned };

  const resolve = (key, local, server) => {
    if (foreign) return server ?? null;
    // Nothing on the server for this sheet: never saved there, or the whole
    // row hidden by RLS while the entitlement is not live (a refund, a comp
    // withdrawn). Neither is a change made here, so this browser's copy is
    // kept whole and its marks stay as they were (rule 8). A synced sheet is
    // not marked unsent, because once the entitlement returns it would be sent
    // over whatever was saved since on another device.
    if (local != null && server == null) {
      if (!unknown) return local;
      // An unowned copy is sent if the server really has none of this sheet.
      // It stays unowned, measured from itself, so if the row was only hidden
      // it still only fills what the server lacks once it can be read.
      if (!pending[key]) bases[key] = local;
      pending[key] = true;
      unowned[key] = true;
      return local;
    }
    const keyUnknown = unknown || Boolean(unowned[key]);
    delete unowned[key];
    let merged;
    if (local == null) merged = server ?? null;
    // Unsent changes: only the fields changed from the copy they were made
    // from go on top of the server's copy (rule 3). An unowned copy also fills
    // what the server lacks (rule 7).
    else if (pending[key]) merged = mergeSave(key, keyUnknown ? fillUnder(key, server, local) : server, local, bases[key] ?? null);
    else if (keyUnknown) merged = fillUnder(key, server, local);
    else merged = server;
    if (merged != null && !same(merged, server)) {
      pending[key] = true;
      bases[key] = server ?? null;
    } else {
      delete pending[key];
      delete bases[key];
    }
    return merged;
  };

  const nextSheets = {};
  for (const key of new Set([...Object.keys(localSheets), ...Object.keys(serverSheets)])) {
    const value = resolve(key, localSheets[key], serverSheets[key]);
    if (value != null) nextSheets[key] = value;
  }
  const nextLot = resolve(LOT, localLot, serverLot);

  const changed = new Set();
  for (const key of new Set([...Object.keys(localSheets), ...Object.keys(nextSheets)])) {
    if (!same(localSheets[key], nextSheets[key])) changed.add(key);
  }
  if (!same(localLot, nextLot)) changed.add(LOT);

  if (changed.size) {
    const next = { ...packet, worksheets: nextSheets };
    if (nextLot) next.lot = nextLot;
    else delete next.lot;
    savePacket(next);
    // Anything already on screen was rendered from the old copy: remember what
    // it was shown, so its next save counts only what was changed on it.
    for (const key of changed) {
      if (!stale.has(key)) stale.set(key, (key === LOT ? localLot : localSheets[key]) ?? null);
    }
  }
  writeSync({ owner: res.authUserId, pending, bases, unowned });
  return changed.size > 0;
};

// Send every pending sheet, one write at a time (rule 5). A mark is cleared only
// when the copy still in this browser is exactly the copy that was sent.
const flush = async () => {
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    do {
      flushAgain = false;
      if (status !== "hydrated") break;
      const user = hydratedUser;
      const keys = Object.keys(readSync().pending);
      if (!keys.length) break;
      const packet = loadPacket();
      const sheets = {};
      let lot = null;
      for (const key of keys) {
        if (key === LOT) lot = isObj(packet.lot) ? packet.lot : null;
        else if (isObj(packet.worksheets) && packet.worksheets[key] != null) sheets[key] = packet.worksheets[key];
      }
      const hasSheets = Object.keys(sheets).length > 0;
      if (hasSheets || lot) {
        const res = await saveEntitledPacket({ worksheets: hasSheets ? sheets : null, lot });
        if (!res?.ok || user !== hydratedUser || status !== "hydrated") break;
      }
      const now = loadPacket();
      const after = readSync();
      for (const key of keys) {
        const sent = key === LOT ? lot : sheets[key];
        const current = key === LOT ? now.lot : isObj(now.worksheets) ? now.worksheets[key] : null;
        // Either way the server now holds what was sent, so the sheet is no
        // longer a copy with no recorded owner.
        if (sent != null) delete after.unowned[key];
        if (same(sent, current)) {
          delete after.pending[key];
          delete after.bases[key];
        } else if (sent != null && after.pending[key]) {
          // Changed again while this write was in flight: the server now holds
          // what was sent, so the newer changes are measured from that.
          after.bases[key] = sent;
        }
      }
      writeSync(after);
    } while (flushAgain);
  } catch {
    // Offline or refused: the marks stay and the next save or read retries.
  } finally {
    flushing = false;
  }
};

const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "timeout" }), ms));

// A failed read is tried again by itself: after 5 s, then 10, 20, 40 and every
// 60 s, until one lands. A save, coming back online or a sign-in also retries.
const scheduleRetry = () => {
  if (retryTimer || typeof window === "undefined") return;
  const delay = retryDelay;
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (status === "failed") ensureHydrated({ retry: true });
  }, delay);
};

const cancelRetry = () => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = RETRY_AFTER_MS;
};

// The account signed in changed while a read was in flight (for example the
// sign-in landed during a read that started signed out). Only a change of
// session counts, so a read that keeps disagreeing cannot loop.
const sessionMoved = (startedFor, got) =>
  latestUid !== undefined && latestUid !== startedFor && (latestUid || null) !== (got || null);

const startHydration = () => {
  const gen = ++generation;
  const startedFor = latestUid;
  lastAttemptAt = Date.now();
  setStatus("pending");
  const run = (async () => {
    let res;
    try {
      res = await Promise.race([fetchEntitledPacket(), timeout(HYDRATION_TIMEOUT_MS)]);
    } catch {
      res = { ok: false, error: "failed" };
    }
    if (gen !== generation) return { ok: false, error: "superseded" };
    inflight = null;
    // Read again for the account that is signed in now.
    if (sessionMoved(startedFor, res?.ok ? res.authUserId : null)) return restart();
    if (!res?.ok || !res.authUserId) {
      hydratedUser = null;
      const signedOut = res?.error === "logged-out";
      setStatus(signedOut ? "signed-out" : "failed");
      if (!signedOut) scheduleRetry();
      return res || { ok: false, error: "failed" };
    }
    let merged = false;
    try {
      merged = applyServerCopy(res);
    } catch {
      hydratedUser = null;
      setStatus("failed");
      scheduleRetry();
      return { ok: false, error: "failed" };
    }
    hydratedUser = res.authUserId;
    cancelRetry();
    setStatus("hydrated", merged);
    if (merged && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("aduatlas:worksheets-hydrated"));
    }
    flush();
    return { ok: true, merged };
  })();
  inflight = run;
  return run;
};

const restart = () => {
  generation += 1;
  inflight = null;
  return startHydration();
};

const ensureHydrated = ({ retry = false } = {}) => {
  if (typeof window === "undefined") return null;
  if (!supabase) {
    setStatus("disabled");
    return null;
  }
  if (inflight) return inflight;
  if (status === "hydrated" || status === "disabled") return null;
  if (status !== "idle") {
    if (!retry || Date.now() - lastAttemptAt < RETRY_AFTER_MS) return null;
  }
  return startHydration();
};

const kickOff = () => {
  if (status === "idle") ensureHydrated();
};

// Nothing goes to the server before this page has read the server's copy.
const syncToServer = () => {
  if (status === "hydrated") flush();
  else ensureHydrated({ retry: true });
};

// A reader of the stored copy has caught up with the last read that changed it.
const noteFreshRead = (key) => {
  stale.delete(key);
};

const onSession = (uid) => {
  if (!uid) {
    cancelRetry();
    if (status === "hydrated" || status === "pending" || status === "failed") {
      generation += 1;
      inflight = null;
      hydratedUser = null;
      setStatus("signed-out");
    }
    return;
  }
  if (status === "pending") return; // the read in flight checks latestUid when it lands
  if (status === "hydrated" && hydratedUser === uid) return;
  restart();
};

// Log out, or another account signing in (T4-01): accountScope has removed this
// browser's copy and its sync marks, so everything held in memory about it goes
// too. Any read or write in flight belongs to the account that left and is
// dropped when it lands (the generation moves on). Pages re-read (the version
// moves on) and find nothing until the next account's own read arrives.
onAccountScopeReset(() => {
  cancelRetry();
  generation += 1;
  inflight = null;
  hydratedUser = null;
  flushAgain = false;
  stale.clear();
  setStatus("signed-out", true);
});

// ── Public API ──────────────────────────────────────────────────────────────
// The hydration state, for a page that should show the server's copy once it
// arrives: { status, settled, version }. `version` goes up every time the read
// changed this browser's copy; re-read on a change. `settled` is false only
// while the first read is in flight.
export const subscribeWorksheetsHydration = (listener) => {
  listeners.add(listener);
  kickOff();
  return () => listeners.delete(listener);
};
export const worksheetsHydrationSnapshot = () => snapshot;
export const useWorksheetsHydration = () =>
  useSyncExternalStore(subscribeWorksheetsHydration, worksheetsHydrationSnapshot, worksheetsHydrationSnapshot);

// Resolves once the current read has landed (or at once when none is running).
export const whenWorksheetsHydrated = () => Promise.resolve(inflight || ensureHydrated()).then(() => snapshot);

// Force a fresh read, for a caller that knows the account just changed.
export const hydrateEntitledPacket = () => restart();

// T4-20 (RC4 rehearsal): what a save indicator may truthfully say. READ ONLY, and
// it changes nothing about the sync above. `unsent` lists every sheet (and "@lot")
// this browser holds that the server has not accepted: not sent yet, refused (an
// account without the entitlement, 403 42501) or failed. Those are the pending
// marks, which stay until a write lands. `sending` is true while a write is in
// flight. The worksheet bar used to say "Saved" once the local copy was written,
// whatever the server then answered.
export const worksheetSyncState = () => ({ unsent: Object.keys(readSync().pending), sending: flushing });

// Log out (review of RC4a, finding 8): the sheets this browser still holds
// unsent, gathered BEFORE accountScope removes them, so logout can send them
// under the session that made them. Only after the server copy was read (rule
// 2): a copy that never met the server's is not safe to send, and the page
// says so (NOT_LOADED in worksheetKit). Null when there is nothing to send.
export const takeUnsentWorksheets = () => {
  if (status !== "hydrated") return null;
  const keys = Object.keys(readSync().pending);
  if (!keys.length) return null;
  const packet = loadPacket();
  const sheets = {};
  let lot = null;
  for (const key of keys) {
    if (key === LOT) lot = isObj(packet.lot) ? packet.lot : null;
    else if (isObj(packet.worksheets) && packet.worksheets[key] != null) sheets[key] = packet.worksheets[key];
  }
  const hasSheets = Object.keys(sheets).length > 0;
  return hasSheets || lot ? { worksheets: hasSheets ? sheets : null, lot } : null;
};
export const sendUnsentWorksheets = (unsent) => (unsent ? saveEntitledPacket(unsent) : Promise.resolve({ ok: true }));

export const loadWorksheets = () => {
  kickOff();
  return loadPacket().worksheets || {};
};

export const loadWorksheet = (key) => {
  const sheet = loadWorksheets()[key] || null;
  noteFreshRead(key);
  return sheet;
};

// Save one sheet. `base` is the copy the page started from; a page that keeps
// it (usePersistedWorksheet) passes it, and then only what was changed from it
// is laid on the stored copy. Without it, a page that rendered before the last
// read is measured from what that read replaced (rule 4), and any other page's
// copy is the stored copy it read, so it is kept as given.
export const saveWorksheet = (key, data, { base } = {}) => {
  const packet = loadPacket();
  const sheets = isObj(packet.worksheets) ? packet.worksheets : {};
  const before = sheets[key] ?? null;
  const shown = base !== undefined ? base : stale.has(key) ? stale.get(key) : undefined;
  const value = shown === undefined ? data : mergeSave(key, before, data, shown);
  savePacket({ ...packet, worksheets: { ...sheets, [key]: value } });
  markPending(key, before);
  syncToServer();
  return value;
};

// ── National ADU Property Evaluation (NAPE) ──────────────────────────────────
// The official NAPE scoring system from Module 7: five weighted categories,
// 100 possible points, answered Yes/No. Phrased so "Yes" is always favorable.
// Grade F ("False Start") overrides the point score whenever an automatic
// no-go condition (Module 7, Chapter 4) is answered No. An early planning
// tool, not a permit approval — outcomes vary by property and municipality.

export const NAPE_CATEGORIES = [
  {
    id: "zoning",
    title: "Zoning & legal feasibility",
    points: 30,
    items: [
      { id: "z-permitted", q: "Is an ADU permitted by your local zoning?", noGo: true },
      { id: "z-lot-size", q: "Does your lot meet the minimum lot size requirement?", noGo: true },
      { id: "z-lot-dims", q: "Does your lot meet minimum width and depth requirements?", noGo: true },
      { id: "z-max-size", q: "Can a worthwhile ADU comply with the maximum-size regulations?" },
      { id: "z-height", q: "Can the ADU meet local height limits?" },
      { id: "z-setbacks", q: "Do required setbacks leave a usable buildable area?", noGo: true },
      { id: "z-percentage", q: "Does the ADU stay within any percentage-of-primary-home size limit?" },
      { id: "z-hoa", q: "Have you reviewed HOA or deed restrictions and found that none prohibit an ADU?", noGo: true },
      { id: "z-historic", q: "Have you reviewed historic-district requirements and found that none prohibit an ADU?", noGo: true },
      { id: "z-separation", q: "Can the ADU meet the minimum separation distance from the primary residence?" },
    ],
  },
  {
    id: "site",
    title: "Lot & physical site conditions",
    points: 25,
    items: [
      { id: "s-slope", q: "Is the site free of significant slope or challenging topography?" },
      { id: "s-overlay", q: "Is the property outside floodplains and environmental overlays?" },
      { id: "s-trees", q: "Is the site free of protected trees or habitat conflicts?" },
      { id: "s-easements", q: "Is the buildable area free of utility or drainage easements?", noGo: true },
      { id: "s-area", q: "Is there adequate buildable backyard area?" },
    ],
  },
  {
    id: "utilities",
    title: "Utilities & infrastructure",
    points: 15,
    items: [
      { id: "u-access", q: "Is utility access available to the proposed site?" },
      { id: "u-septic", q: "If on septic, is the system suitable for an additional dwelling? (Yes if not applicable)" },
      { id: "u-connections", q: "Are water, sewer, and electrical connections feasible?" },
    ],
  },
  {
    id: "access",
    title: "Site access & construction logistics",
    points: 15,
    items: [
      { id: "a-emergency", q: "Is emergency access to the ADU achievable?" },
      { id: "a-construction", q: "Is there backyard access for construction?" },
      { id: "a-crane", q: "Is crane or delivery access available if needed?" },
      { id: "a-overhead", q: "Is the site free of overhead utility conflicts?" },
    ],
  },
  {
    id: "financial",
    title: "Market & financial practicality",
    points: 15,
    items: [
      { id: "f-site-costs", q: "Are site preparation costs reasonable for your budget?" },
      { id: "f-size", q: "Does the ADU size justify the investment?" },
      { id: "f-financing", q: "Is financing available?" },
      { id: "f-market", q: "Is there rental or resale potential?" },
      { id: "f-practical", q: "Is the project financially practical overall?" },
    ],
  },
];

export const NAPE_TOTAL_ITEMS = NAPE_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

// Points, grade, no-go flags, and per-category earned points from an
// { itemId: true|false } answer map. Grade is null until every item is
// answered; F overrides points whenever a no-go item is No.
export const scoreNape = (answers) => {
  let points = 0;
  const perCategory = {};
  const noGoFlags = [];
  let answered = 0;
  for (const cat of NAPE_CATEGORIES) {
    const yes = cat.items.filter((it) => answers[it.id] === true).length;
    const earned = (yes / cat.items.length) * cat.points;
    perCategory[cat.id] = Math.round(earned * 10) / 10;
    points += earned;
    for (const it of cat.items) {
      if (answers[it.id] !== undefined) answered++;
      if (it.noGo && answers[it.id] === false) noGoFlags.push(it);
    }
  }
  points = Math.round(points);
  const complete = answered === NAPE_TOTAL_ITEMS;
  let grade = null;
  if (complete) {
    if (noGoFlags.length) grade = "F";
    else if (points >= 90) grade = "A";
    else if (points >= 80) grade = "B";
    else if (points >= 70) grade = "C";
    else grade = "D";
  }
  return { points, perCategory, noGoFlags, answered, complete, grade };
};

// Module 7, Chapter 8 — what each grade means.
export const NAPE_GRADES = {
  A: { label: "Excellent candidate", note: "No significant legal, physical, or financial obstacles have been identified. Proceed with confidence and begin preparing your detailed feasibility review." },
  B: { label: "Good candidate", note: "The property appears suitable for an ADU, but several items require additional investigation before moving forward." },
  C: { label: "Proceed with caution", note: "Several factors require additional research. Complete a detailed feasibility study before making major financial commitments." },
  D: { label: "High-risk project", note: "Significant legal, physical, or financial obstacles have been identified. Carefully evaluate whether the project still makes financial sense." },
  F: { label: "False start", note: "One or more major project killers have been identified. Sometimes the smartest financial decision is recognizing when a project should not move forward." },
};

// ── Lot / envelope state ─────────────────────────────────────────────────────
// The feasibility model's inputs + parcel-lookup snapshot, so the Property
// Report renders the same geometry the homeowner tuned in the Feasibility tool.
// It is neither a worksheet nor a project-brief field, and it carries the SAME
// entitlement as the worksheets: since 0013 it persists in
// public.homeowner_worksheets.lot, not in users.builder_packet, which is the
// part a careless split leaves behind in an ungated column. It follows the same
// hydration rule as the worksheets above.
export const loadLot = () => {
  kickOff();
  const lot = loadPacket().lot || null;
  noteFreshRead(LOT);
  return lot;
};

export const saveLot = (lot) => {
  const packet = loadPacket();
  const before = isObj(packet.lot) ? packet.lot : null;
  const value = stale.has(LOT) ? mergeSave(LOT, before, lot, stale.get(LOT)) : lot;
  savePacket({ ...packet, lot: value });
  markPending(LOT, before);
  syncToServer();
  return value;
};


// ── Start reading as early as the app does ──────────────────────────────────
// This module is imported when the router is built, before the first paint, so
// the read usually lands before any worksheet page renders. Every sign-in, and
// every change of account, reads again. Supabase asks that its auth callback
// not await its own calls, so the reaction is deferred a tick.
if (typeof window !== "undefined" && supabase) {
  kickOff();
  try {
    supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id || null;
      latestUid = uid;
      setTimeout(() => onSession(uid), 0);
    });
  } catch {
    // No auth events: the reads above still run on first use.
  }
  window.addEventListener("online", () => {
    if (status === "failed") ensureHydrated({ retry: true });
  });
}
