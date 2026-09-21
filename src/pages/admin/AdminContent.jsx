// Visual content editor: the left picker chooses a real public page/course
// chapter, which renders live in an iframe (?__admin_edit=1 makes its
// AdminEditableSection wrappers hoverable/clickable — see
// src/lib/adminEditBridge.jsx). Clicking a section posts its content keys up
// via postMessage; this page opens a slide-over with ContentFieldEditor rows
// for exactly those keys — same save/publish/version-history behavior as
// before, just reached by clicking the real page instead of a sidebar list.
import { useEffect, useMemo, useState } from "react";
import { FiUploadCloud, FiX } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { CONTENT } from "../../lib/contentRegistry";
import { modules as courseModules } from "../../stores/courseStore";
import ContentFieldEditor from "../../components/admin/ContentFieldEditor";

const PAGE_ROUTES = {
  Home: "/",
  About: "/about",
  AduTypes: "/adu-types",
  "How to ADU": "/how-to-adu",
  FAQ: "/faq",
  "Course Outline": "/course-outline",
  Methodology: "/methodology",
  Legal: "/legal",
};

const withEditParam = (path) => `${path}${path.includes("?") ? "&" : "?"}__admin_edit=1`;

const AdminContent = () => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("Home");
  const [iframePath, setIframePath] = useState(PAGE_ROUTES.Home);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [activeSection, setActiveSection] = useState(null); // { keys, label } | null
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  const load = () =>
    adminGet("content/list")
      .then((d) => setRows(d.items))
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

  const rowsByKey = useMemo(() => {
    const m = {};
    for (const r of rows || []) m[r.key] = r;
    return m;
  }, [rows]);

  const pages = useMemo(() => Object.keys(PAGE_ROUTES).concat(["Course"]), []);

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
        published.length ? `Published ${published.length} change(s).` : "Nothing to publish — no unsaved edits here."
      );
      await load();
      setReloadNonce((n) => n + 1); // reload the iframe so the published change shows immediately
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
          Pick a page, then hover over the real page to find what to edit — click it, edit, and Publish. Nothing
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
              onClick={() => (p === "Course" ? pickPage("Course", "/course") : pickPage(p, PAGE_ROUTES[p]))}
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
              const meta = CONTENT[key];
              if (!meta) return null;
              const dbRow = rowsByKey[key];
              const remountKey = `${key}:${dbRow?.updated_at || ""}:${dbRow?.published_at || ""}`;
              return <ContentFieldEditor key={remountKey} contentKey={key} meta={meta} dbRow={dbRow} onSaved={load} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminContent;
