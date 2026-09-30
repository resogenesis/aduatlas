// Visual content editor: the left picker chooses a real public page/course
// chapter, which renders live in an iframe (?__admin_edit=1 makes its
// AdminEditableSection wrappers hoverable/clickable — see
// src/lib/adminEditBridge.jsx). Clicking a section posts its content keys up
// via postMessage; this page opens a slide-over with ContentFieldEditor rows
// for exactly those keys — same save/publish/version-history behavior as
// before, just reached by clicking the real page instead of a sidebar list.
//
// BACK TO THE DEFAULT (R3-10). A published value overrides the text written with
// the course for as long as it exists, and the first publish of a field archives
// nothing, so before this there was no way back: History said "No prior published
// versions yet" and a later fix to the course text never reached a learner. Each
// field now says whether learners see the default or an edited version, and
// "Use the default text" clears the edit (archiving it in History first) so the
// default is served again, by api/course.js for the paid chapters and by the
// public content read for everything else.
//
// THE PREVIEW FOLLOWS WHAT IS LIVE. The iframe reloads whenever any field's
// published date moves, which covers Publish, Restore from History and Use the
// default text alike; a draft autosave moves no published date and leaves it be.
import { useEffect, useMemo, useRef, useState } from "react";
import { FiUploadCloud, FiX } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { CONTENT } from "../../lib/contentRegistry";
import { modules as courseModules } from "../../stores/courseStore";
import ContentFieldEditor from "../../components/admin/ContentFieldEditor";

// Only the course is admin-editable for now (Richard, 2026-09-21); the public
// site pages are code-owned. See contentRegistry/editable.js.
const PAGE_ROUTES = {
  Course: "/course",
};

const withEditParam = (path) => `${path}${path.includes("?") ? "&" : "?"}__admin_edit=1`;

// Whether learners see the default text or an edited version of one field, and
// the way back to the default.
const DefaultControl = ({ contentKey, dbRow, onReverted }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const published = dbRow?.published_value != null;
  const drafted = dbRow?.draft_value != null;
  const revert = async () => {
    const what = published
      ? "Learners will see the default text again right away, and any unpublished edit here is discarded. The edited text is kept in History, where Restore brings it back."
      : "The unpublished edit here is discarded. Learners already see the default text.";
    if (!window.confirm(`Go back to the default text for this field? ${what}`)) return;
    setBusy(true);
    setError("");
    try {
      await adminPost("content/revert-to-default", { key: contentKey });
      await onReverted();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pb-4 -mt-2 space-y-1" data-content-state={published ? "edited" : drafted ? "draft" : "default"}>
      {published || drafted ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-paper-dim">
            {published
              ? `Learners see an edited version${dbRow.published_at ? `, published ${new Date(dbRow.published_at).toLocaleString()}` : ""}.`
              : "Learners see the default text. An unpublished edit is saved here."}
          </span>
          <button type="button" onClick={revert} disabled={busy} className="text-xs text-accent hover:underline underline-offset-2 disabled:opacity-50">
            {busy ? "Working…" : "Use the default text"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-paper-dim">Learners see the default text written with the course.</p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
};

const AdminContent = () => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("Course");
  const [iframePath, setIframePath] = useState(PAGE_ROUTES.Course);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [activeSection, setActiveSection] = useState(null); // { keys, label } | null
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");
  // Paid course text (course.chapter.* and course.intro) is not in the bundle
  // (DEF-07). For a key with no saved row, the editor needs the text the
  // server holds, loaded on demand through the registry's loadDefault().
  // key -> blocks array, or null when it could not be read.
  const [serverDefaults, setServerDefaults] = useState({});

  // The published date of every field, as last read. When it moves, what learners
  // see moved, and the preview is reloaded to show it.
  const publishedStamp = useRef(null);
  const load = () =>
    adminGet("content/list")
      .then((d) => {
        const stamp = (d.items || [])
          .map((r) => `${r.key}:${r.published_at || ""}`)
          .sort()
          .join("|");
        if (publishedStamp.current !== null && publishedStamp.current !== stamp) setReloadNonce((n) => n + 1);
        publishedStamp.current = stamp;
        setRows(d.items);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  // Listen for section clicks posted from the iframe'd page.
  useEffect(() => {
    const handler = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.source !== "aduatlas-admin-edit") return;
      setPublishMsg("");
      setActiveSection({ keys: e.data.keys, label: e.data.label });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Keys in the open section whose starting text lives on the server and has
  // not been loaded yet.
  const hasSavedValue = (row) => (row?.draft_value ?? row?.published_value) != null;
  const pendingServerKeys = useMemo(
    () =>
      (activeSection?.keys || []).filter(
        (k) => CONTENT[k]?.loadDefault && !(k in serverDefaults) && !hasSavedValue((rows || []).find((r) => r.key === k))
      ),
    [activeSection, serverDefaults, rows]
  );

  useEffect(() => {
    if (!pendingServerKeys.length) return undefined;
    let live = true;
    Promise.all(pendingServerKeys.map(async (k) => [k, await CONTENT[k].loadDefault().catch(() => null)])).then((pairs) => {
      if (live) setServerDefaults((m) => ({ ...m, ...Object.fromEntries(pairs) }));
    });
    return () => {
      live = false;
    };
  }, [pendingServerKeys]);

  const retryServerDefault = (key) =>
    setServerDefaults((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });

  const rowsByKey = useMemo(() => {
    const m = {};
    for (const r of rows || []) m[r.key] = r;
    return m;
  }, [rows]);

  const pages = useMemo(() => Object.keys(PAGE_ROUTES), []);

  const pickPage = (page, path) => {
    setActivePage(page);
    setActiveSection(null);
    setIframePath(path);
  };

  const publishSection = async () => {
    if (!activeSection) return;
    setPublishing(true);
    setPublishMsg("");
    try {
      const { published } = await adminPost("content/publish", { keys: activeSection.keys });
      setPublishMsg(
        published.length ? `Published ${published.length} change(s).` : "Nothing to publish: no unsaved edits here."
      );
      await load(); // reloads the iframe when a published date moved, so the change shows immediately
    } catch (e) {
      setPublishMsg(e.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-8 sm:py-10 h-screen flex flex-col">
      <div className="mb-6">
        <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-3">
          Content
        </h1>
        <p className="text-paper-dim text-sm max-w-2xl">
          Pick a page, then hover over the real page to find what to edit. Click it, edit, and Publish. Nothing
          goes live until you publish.
        </p>
      </div>

      {error && (
        <p className="mb-6 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex-1 min-h-0 grid lg:grid-cols-[14rem_1fr] gap-6">
        <nav className="space-y-1 overflow-y-auto">
          {pages.map((p) => (
            <button
              key={p}
              onClick={() => pickPage(p, PAGE_ROUTES[p])}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${ p === activePage ?"bg-accent text-accent-fg":"text-paper-dim hover:text-paper hover:bg-surface-1-solid"}`}
            >
              {p}
            </button>
          ))}

          {activePage === "Course" && (
            <div className="mt-3 pl-2 border-l border-stroke space-y-3">
              <button
                onClick={() => pickPage("Course", "/course/intro")}
                className="block text-left text-xs text-paper-dim hover:text-paper transition-colors"
              >
                Course Intro
              </button>
              {courseModules.map((m) => (
                <div key={m.id}>
                  <p className="text-[0.65rem] text-paper-dim/70 mb-1">{m.title}</p>
                  <div className="space-y-1">
                    {m.chapters.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => pickPage("Course", `/course/${c.id}`)}
                        className="block text-left text-xs text-paper-dim hover:text-paper transition-colors"
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </nav>

        <div className="relative bg-surface-1-solid border border-stroke rounded-2xl overflow-hidden">
          <iframe
            key={`${iframePath}:${reloadNonce}`}
            src={withEditParam(iframePath)}
            title="Live page preview"
            className="w-full h-full bg-canvas"
          />
        </div>
      </div>

      {activeSection && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" onClick={() => setActiveSection(null)} />
          <div className="relative w-full max-w-lg h-full bg-surface-1-solid border-l border-stroke overflow-y-auto px-6 py-6">
            <div className="flex items-center justify-between gap-4 mb-2">
              <h2 className="font-display text-paper text-xl">{activeSection.label}</h2>
              <button
                onClick={() => setActiveSection(null)}
                className="p-2 rounded-lg text-paper-dim hover:text-paper hover:bg-canvas transition-colors"
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 pb-4 mb-2 border-b border-stroke sticky top-0 bg-surface-1-solid">
              {publishMsg && <span className="text-xs text-paper-dim">{publishMsg}</span>}
              <button
                onClick={publishSection}
                disabled={publishing}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors disabled:opacity-50"
              >
                <FiUploadCloud /> {publishing ? "Publishing…" : "Publish"}
              </button>
            </div>

            {activeSection.keys.map((key) => {
              const base = CONTENT[key];
              if (!base) return null;
              const dbRow = rowsByKey[key];
              const needsServerText = Boolean(base.loadDefault) && !hasSavedValue(dbRow);
              if (needsServerText && !(key in serverDefaults)) {
                return <p key={key} className="text-sm text-paper-dim py-3">Loading the current text.</p>;
              }
              if (needsServerText && !serverDefaults[key]) {
                return (
                  <div key={key} className="py-3">
                    <p className="text-sm text-red-700 mb-2">The current text did not load.</p>
                    <button type="button" onClick={() => retryServerDefault(key)} className="text-xs text-accent hover:underline">
                      Try again
                    </button>
                  </div>
                );
              }
              const meta = needsServerText ? { ...base, default: serverDefaults[key] } : base;
              const remountKey = `${key}:${dbRow?.updated_at || ""}:${dbRow?.published_at || ""}:${needsServerText ? "server" : ""}`;
              return (
                <div key={key} className="border-t border-stroke first:border-t-0">
                  <ContentFieldEditor key={remountKey} contentKey={key} meta={meta} dbRow={dbRow} onSaved={load} />
                  <DefaultControl contentKey={key} dbRow={dbRow} onReverted={load} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminContent;
