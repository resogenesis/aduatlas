// One editable field in the admin content console. Owns its own draft-save
// (autosaves on blur) and version history/rollback. Publishing is a
// page-level action in AdminContent.jsx — this component only ever writes
// draft_value; publish.js is the only path that makes it live.
import { useState } from "react";
import { FiClock, FiUpload } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { resizeImageFile } from "../../lib/imageResize";

const inputClass =
  "w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition";

// text -> { text }, image -> { url, alt }, blocks -> the array itself.
const valueFromRow = (meta, dbRow) => {
  const stored = dbRow?.draft_value ?? dbRow?.published_value;
  if (meta.type === "text") return stored?.text ?? meta.default ?? "";
  if (meta.type === "image") return stored ?? { url: meta.default?.src, alt: meta.default?.alt || "" };
  return stored ?? meta.default ?? [];
};

const toPayload = (meta, value) => {
  if (meta.type === "text") return { text: value };
  if (meta.type === "image") return value;
  return value;
};

const StatusPill = ({ status }) => {
  if (status === "saving") return <span className="text-xs text-paper-dim">Saving…</span>;
  if (status === "saved") return <span className="text-xs text-accent">Draft saved</span>;
  if (status === "error") return <span className="text-xs text-red-300">Save failed</span>;
  return null;
};

const VersionHistory = ({ contentKey, onRestored }) => {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setOpen((v) => !v);
    if (!versions) {
      adminGet(`content/versions?key=${encodeURIComponent(contentKey)}`)
        .then((d) => setVersions(d.versions))
        .catch(() => setVersions([]));
    }
  };

  const restore = async (versionId) => {
    setBusyId(versionId);
    try {
      await adminPost("content/rollback", { key: contentKey, versionId });
      setVersions(null);
      setOpen(false);
      onRestored();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={load}
        className="inline-flex items-center gap-1.5 text-xs text-paper-dim hover:text-paper transition-colors"
      >
        <FiClock className="text-sm" /> History
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-stroke bg-canvas p-3 space-y-2">
          {versions === null && <p className="text-xs text-paper-dim">Loading…</p>}
          {versions?.length === 0 && <p className="text-xs text-paper-dim">No prior published versions yet.</p>}
          {versions?.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-paper-dim">
                {new Date(v.published_at).toLocaleString()} {v.published_by ? `· ${v.published_by}` : ""}
              </span>
              <button
                type="button"
                disabled={busyId === v.id}
                onClick={() => restore(v.id)}
                className="text-accent hover:underline disabled:opacity-50"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BlockEditor = ({ block, onChange }) => {
  if (block.remember !== undefined) {
    return (
      <div className="rounded-lg border border-stroke p-3">
        <p className="text-[0.65rem] uppercase tracking-wider text-paper-dim mb-1.5">Remember callout</p>
        <textarea
          className={`${inputClass} min-h-[4.5rem]`}
          value={block.remember}
          onChange={(e) => onChange({ ...block, remember: e.target.value })}
        />
      </div>
    );
  }
  if (block.list !== undefined) {
    return (
      <div className="rounded-lg border border-stroke p-3 space-y-2">
        {block.h !== undefined && (
          <input
            className={inputClass}
            value={block.h}
            placeholder="Heading"
            onChange={(e) => onChange({ ...block, h: e.target.value })}
          />
        )}
        {block.list.map((item, i) => (
          <input
            key={i}
            className={inputClass}
            value={item}
            onChange={(e) => {
              const list = block.list.slice();
              list[i] = e.target.value;
              onChange({ ...block, list });
            }}
          />
        ))}
      </div>
    );
  }
  // { p } or { h, p }
  return (
    <div className="rounded-lg border border-stroke p-3 space-y-2">
      {block.h !== undefined && (
        <input
          className={inputClass}
          value={block.h}
          placeholder="Heading"
          onChange={(e) => onChange({ ...block, h: e.target.value })}
        />
      )}
      <textarea
        className={`${inputClass} min-h-[4.5rem]`}
        value={block.p}
        onChange={(e) => onChange({ ...block, p: e.target.value })}
      />
    </div>
  );
};

// The parent gives this component a `key` that includes dbRow's
// updated_at/published_at (see AdminContent.jsx), so React remounts a field
// fresh only when ITS OWN row changes (own save, or a rollback) — never when
// a sibling field's autosave triggers the parent's list refetch. That keeps
// in-progress typing in other fields from being clobbered by a save
// elsewhere on the page.
const ContentFieldEditor = ({ contentKey, meta, dbRow, onSaved }) => {
  const [value, setValue] = useState(() => valueFromRow(meta, dbRow));
  const [status, setStatus] = useState("idle");
  const [uploading, setUploading] = useState(false);

  const commit = async (nextValue) => {
    setStatus("saving");
    try {
      await adminPost("content/save-draft", {
        key: contentKey,
        type: meta.type,
        page: meta.page,
        label: meta.label,
        value: toPayload(meta, nextValue),
      });
      setStatus("saved");
      onSaved();
    } catch {
      setStatus("error");
    }
  };

  const handleImageFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { dataUrl } = await resizeImageFile(file);
      const { url } = await adminPost("content/upload-image", { key: contentKey, dataUrl, filename: file.name });
      const next = { url, alt: value.alt || "" };
      setValue(next);
      await commit(next);
    } finally {
      setUploading(false);
    }
  };

  const hasUnpublishedDraft =
    dbRow?.draft_value != null &&
    JSON.stringify(dbRow.draft_value) !== JSON.stringify(dbRow.published_value ?? null);
  const isLive = !hasUnpublishedDraft && dbRow?.published_value != null;

  return (
    <div className="py-5 border-t border-stroke first:border-t-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <label className="text-paper text-xs font-medium tracking-[0.1em] uppercase">{meta.label}</label>
        <div className="flex items-center gap-2">
          {hasUnpublishedDraft && <span className="text-xs text-amber-300">Unpublished edit</span>}
          {isLive && <span className="text-xs text-paper-dim/70">Live</span>}
          <StatusPill status={status} />
        </div>
      </div>

      {meta.type === "text" && (
        <textarea
          className={`${inputClass} ${(value || "").length > 120 ? "min-h-[7rem]" : "min-h-[2.75rem]"}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => commit(value)}
        />
      )}

      {meta.type === "image" && (
        <div className="flex items-start gap-4">
          {value?.url && (
            <img src={value.url} alt={value.alt || ""} className="w-32 h-24 object-cover rounded-lg border border-stroke shrink-0" />
          )}
          <div className="flex-1 space-y-2">
            <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-stroke text-paper-dim text-xs cursor-pointer hover:text-paper hover:border-paper-dim transition">
              <FiUpload /> {uploading ? "Uploading…" : "Replace image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleImageFile(e.target.files?.[0])}
              />
            </label>
            <input
              className={inputClass}
              placeholder="Alt text"
              value={value?.alt || ""}
              onChange={(e) => setValue({ ...value, alt: e.target.value })}
              onBlur={() => commit(value)}
            />
          </div>
        </div>
      )}

      {meta.type === "blocks" && (
        <div className="space-y-2" onBlur={() => commit(value)}>
          {value.map((block, i) => (
            <BlockEditor
              key={i}
              block={block}
              onChange={(next) => {
                const arr = value.slice();
                arr[i] = next;
                setValue(arr);
              }}
            />
          ))}
        </div>
      )}

      <VersionHistory contentKey={contentKey} onRestored={onSaved} />
    </div>
  );
};

export default ContentFieldEditor;
