// Admin content console: edit the site's public-page/course text and images,
// save as drafts, and publish. Every field's structure (which fields exist,
// their order/shape) comes from src/lib/contentRegistry — this page just
// renders whatever's registered there, grouped by page, generically by type.
import { useEffect, useMemo, useState } from "react";
import { FiUploadCloud } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { CONTENT } from "../../lib/contentRegistry";
import ContentFieldEditor from "../../components/admin/ContentFieldEditor";

const AdminContent = () => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [selectedPage, setSelectedPage] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  const load = () =>
    adminGet("content/list")
      .then((d) => setRows(d.items))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const byPage = {};
    for (const [key, meta] of Object.entries(CONTENT)) {
      if (!byPage[meta.page]) byPage[meta.page] = [];
      byPage[meta.page].push({ key, meta });
    }
    return byPage;
  }, []);

  const pages = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const activePage = selectedPage || pages[0];
  const fields = grouped[activePage] || [];

  const rowsByKey = useMemo(() => {
    const m = {};
    for (const r of rows || []) m[r.key] = r;
    return m;
  }, [rows]);

  const publishPage = async () => {
    setPublishing(true);
    setPublishMsg("");
    try {
      const keys = fields.map((f) => f.key);
      const { published } = await adminPost("content/publish", { keys });
      setPublishMsg(published.length ? `Published ${published.length} change(s).` : "Nothing to publish — no unsaved edits on this page.");
      await load();
    } catch (e) {
      setPublishMsg(e.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Admin</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-3">
        Content
      </h1>
      <p className="text-paper-dim text-sm mb-8 max-w-2xl">
        Edit page text and images. Changes save as drafts automatically; nothing goes live until you click Publish.
      </p>

      {error && (
        <p className="mb-6 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!rows && !error && <p className="text-paper-dim">Loading…</p>}

      {rows && (
        <div className="grid lg:grid-cols-[14rem_1fr] gap-8">
          <nav className="space-y-1">
            {pages.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPage(p)}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  p === activePage ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper hover:bg-surface-1-solid"
                }`}
              >
                {p}
              </button>
            ))}
          </nav>

          <div className="bg-surface-1-solid border border-stroke rounded-2xl px-5 sm:px-7 py-2">
            <div className="flex items-center justify-between gap-4 py-4 border-b border-stroke sticky top-0 bg-surface-1-solid">
              <h2 className="font-display text-paper text-lg">{activePage}</h2>
              <div className="flex items-center gap-3">
                {publishMsg && <span className="text-xs text-paper-dim">{publishMsg}</span>}
                <button
                  onClick={publishPage}
                  disabled={publishing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-accent-fg text-sm font-semibold hover:bg-paper transition-colors disabled:opacity-50"
                >
                  <FiUploadCloud /> {publishing ? "Publishing…" : "Publish page"}
                </button>
              </div>
            </div>

            {fields.map(({ key, meta }) => {
              const dbRow = rowsByKey[key];
              // Remount only when THIS field's own row changes (its own save
              // or a rollback) — not when a sibling field's autosave
              // triggers this list refetch. See ContentFieldEditor.jsx.
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
