import { useEffect, useMemo, useState } from "react";
import { FiExternalLink, FiPlus, FiRefreshCw, FiTrash2, FiUpload, FiX } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { APPROACH_LABELS, SERVICE_TYPE_LABELS, SPECIALTY_LABELS, publicUrl } from "../../lib/builders";

// Builder database management + introduction requests (Phase 1 scope §7).
const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
const csv = (arr) => (arr || []).join(", ");
const fromCsv = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

const EMPTY = { name: "", state: "CA", cities: "", service_zips: "", description: "", website: "", external_link: "", contact_email: "", contact_phone: "", specialties: [], service_types: [], build_approach: "both", videos: "", active: true, featured: false };

const Toggle = ({ options, value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {Object.entries(options).map(([k, label]) => {
      const on = value.includes(k);
      return (
        <button key={k} type="button" onClick={() => onChange(on ? value.filter((v) => v !== k) : [...value, k])} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${on ? "bg-accent text-accent-fg border-accent" : "border-stroke text-paper-dim hover:text-paper"}`}>
          {label}
        </button>
      );
    })}
  </div>
);

const Field = ({ label, children }) => (
  <label className="block text-sm">
    <span className="text-paper-dim text-xs">{label}</span>
    {children}
  </label>
);
const input = "mt-1 w-full bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper";

const Drawer = ({ builder, onClose, onChanged }) => {
  const [f, setF] = useState(() => (builder ? { ...builder, cities: csv(builder.cities), service_zips: csv(builder.service_zips), videos: (builder.videos || []).join("\n") } : EMPTY));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy("save");
    setError("");
    try {
      const payload = { ...f, cities: fromCsv(f.cities), service_zips: fromCsv(f.service_zips), videos: String(f.videos || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean) };
      const { builder: saved } = await adminPost("builders/save", { builder: payload });
      await onChanged();
      setF({ ...saved, cities: csv(saved.cities), service_zips: csv(saved.service_zips), videos: (saved.videos || []).join("\n") });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const upload = async (kind, file) => {
    if (!file || !f.id) return;
    setBusy(kind);
    setError("");
    try {
      const dataUrl = await readAsDataUrl(file);
      const { builder: b } = await adminPost("builders/upload", { id: f.id, kind, dataUrl, filename: file.name });
      setF((p) => ({ ...p, logo_path: b.logo_path, photos: b.photos }));
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const removePhoto = async (path) => {
    setBusy("rm");
    try {
      const { builder: b } = await adminPost("builders/remove-photo", { id: f.id, path });
      setF((p) => ({ ...p, logo_path: b.logo_path, photos: b.photos }));
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const del = async () => {
    if (!window.confirm(`Delete ${f.name}? Saved builders and introduction requests for it are removed too.`)) return;
    await adminPost("builders/delete", { id: f.id });
    await onChanged();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-paper/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-surface-1-solid border-l border-stroke overflow-y-auto px-6 py-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h2 className="font-display text-paper text-2xl">{f.id ? f.name : "New builder"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-paper-dim hover:text-paper hover:bg-canvas" aria-label="Close">
            <FiX />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_6rem] gap-4">
            <Field label="Company name">
              <input value={f.name} onChange={(e) => set("name", e.target.value)} className={input} />
            </Field>
            <Field label="State">
              <input value={f.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} className={input} />
            </Field>
          </div>
          <Field label="Cities / areas served (comma separated)">
            <input value={f.cities} onChange={(e) => set("cities", e.target.value)} className={input} placeholder="Pasadena, Glendale, Altadena" />
          </Field>
          <Field label="ZIP codes or prefixes served (optional, comma separated)">
            <input value={f.service_zips} onChange={(e) => set("service_zips", e.target.value)} className={input} placeholder="911, 90041" />
          </Field>
          <Field label="Description">
            <textarea value={f.description || ""} onChange={(e) => set("description", e.target.value)} rows={4} className={input} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Website">
              <input value={f.website || ""} onChange={(e) => set("website", e.target.value)} className={input} placeholder="https://" />
            </Field>
            <Field label="One external link (portfolio, reviews)">
              <input value={f.external_link || ""} onChange={(e) => set("external_link", e.target.value)} className={input} placeholder="https://" />
            </Field>
            <Field label="Contact email">
              <input value={f.contact_email || ""} onChange={(e) => set("contact_email", e.target.value)} className={input} />
            </Field>
            <Field label="Contact phone">
              <input value={f.contact_phone || ""} onChange={(e) => set("contact_phone", e.target.value)} className={input} />
            </Field>
          </div>
          <div>
            <p className="text-paper-dim text-xs mb-2">ADU specialties</p>
            <Toggle options={SPECIALTY_LABELS} value={f.specialties || []} onChange={(v) => set("specialties", v)} />
          </div>
          <div>
            <p className="text-paper-dim text-xs mb-2">Services</p>
            <Toggle options={SERVICE_TYPE_LABELS} value={f.service_types || []} onChange={(v) => set("service_types", v)} />
          </div>
          <Field label="Build approach">
            <select value={f.build_approach} onChange={(e) => set("build_approach", e.target.value)} className={input}>
              {Object.entries(APPROACH_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Video links, up to 2 (YouTube or Vimeo, one per line)">
            <textarea value={f.videos || ""} onChange={(e) => set("videos", e.target.value)} rows={2} className={input} />
          </Field>
          <div className="flex gap-6 text-sm">
            <label className="inline-flex items-center gap-2 text-paper">
              <input type="checkbox" checked={f.active !== false} onChange={(e) => set("active", e.target.checked)} /> Active (visible to homeowners)
            </label>
            <label className="inline-flex items-center gap-2 text-paper">
              <input type="checkbox" checked={Boolean(f.featured)} onChange={(e) => set("featured", e.target.checked)} /> Featured on the public page
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button onClick={save} disabled={busy === "save"} className="px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim disabled:opacity-60">
              {busy === "save" ? "Saving…" : f.id ? "Save changes" : "Create builder"}
            </button>
            {f.id && (
              <button onClick={del} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stroke text-red-700 text-sm font-medium hover:border-red-600">
                <FiTrash2 /> Delete
              </button>
            )}
          </div>

          {f.id && (
            <div className="pt-5 border-t border-stroke space-y-4">
              <div>
                <p className="text-paper-dim text-xs mb-2">Logo</p>
                <div className="flex items-center gap-4">
                  {f.logo_path && <img src={publicUrl(f.logo_path)} alt="" className="h-12 w-auto object-contain rounded-lg bg-canvas p-1" />}
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke text-sm text-paper cursor-pointer hover:border-accent">
                    <FiUpload /> {busy === "logo" ? "Uploading…" : f.logo_path ? "Replace logo" : "Upload logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => upload("logo", e.target.files?.[0])} />
                  </label>
                </div>
              </div>
              <div>
                <p className="text-paper-dim text-xs mb-2">Project photos ({(f.photos || []).length} of 3)</p>
                <div className="flex flex-wrap gap-3 items-center">
                  {(f.photos || []).map((p) => (
                    <div key={p} className="relative">
                      <img src={publicUrl(p)} alt="" className="w-24 h-24 object-cover rounded-lg" />
                      <button type="button" onClick={() => removePhoto(p)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-canvas border border-stroke text-paper-dim hover:text-red-700 text-xs" aria-label="Remove photo">
                        ×
                      </button>
                    </div>
                  ))}
                  {(f.photos || []).length < 3 && (
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke text-sm text-paper cursor-pointer hover:border-accent">
                      <FiUpload /> {busy === "photo" ? "Uploading…" : "Add photo"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => upload("photo", e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const STATUS = { requested: "Requested", sent: "Introduction sent", declined: "Declined" };

const AdminBuilders = () => {
  const [tab, setTab] = useState("builders");
  const [items, setItems] = useState(null);
  const [intros, setIntros] = useState(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null); // builder | "new" | null
  const [q, setQ] = useState("");

  const load = () =>
    Promise.all([adminGet("builders/list"), adminGet("builders/intros")])
      .then(([b, i]) => {
        setItems(b.items);
        setIntros(i.items);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (items || []).filter((b) => !n || [b.name, b.state, ...(b.cities || [])].join(" ").toLowerCase().includes(n));
  }, [items, q]);

  const updateIntro = async (id, patch) => {
    try {
      await adminPost("builders/intro-update", { id, ...patch });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const activeBuilder = active === "new" ? null : (items || []).find((b) => b.id === active?.id) || active;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05]">Builders</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-stroke overflow-hidden">
            {["builders", "intros"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium ${tab === t ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper"}`}>
                {t === "builders" ? `Profiles (${(items || []).length})` : `Introductions (${(intros || []).filter((i) => i.status === "requested").length} open)`}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 rounded-xl text-paper-dim hover:text-paper border border-stroke" aria-label="Refresh">
            <FiRefreshCw />
          </button>
          {tab === "builders" && (
            <button onClick={() => setActive("new")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim">
              <FiPlus /> New builder
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-6 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>}

      {tab === "builders" && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, state or city" className="mb-4 w-full max-w-md bg-canvas border border-stroke rounded-xl px-4 py-2.5 text-paper text-sm" />
          {items && visible.length === 0 && <p className="text-paper-dim text-sm">No builders yet. Add the first profile.</p>}
          {visible.length > 0 && (
            <div className="overflow-x-auto border border-stroke rounded-2xl">
              <table className="w-full text-sm">
                <thead className="text-paper-dim text-xs text-left">
                  <tr>
                    <th className="px-4 py-3">Builder</th>
                    <th className="px-4 py-3">Area</th>
                    <th className="px-4 py-3">Specialties</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Media</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => (
                    <tr key={b.id} onClick={() => setActive(b)} className="border-t border-stroke hover:bg-surface-1-solid cursor-pointer">
                      <td className="px-4 py-3 text-paper font-medium">{b.name}</td>
                      <td className="px-4 py-3 text-paper-dim">{[...(b.cities || []).slice(0, 2), b.state].join(", ")}</td>
                      <td className="px-4 py-3 text-paper-dim">{(b.specialties || []).map((s) => SPECIALTY_LABELS[s]).join(", ") || "—"}</td>
                      <td className="px-4 py-3 text-paper-dim">{b.active ? (b.featured ? "Active · featured" : "Active") : "Hidden"}</td>
                      <td className="px-4 py-3 text-paper-dim">{[(b.logo_path && "logo"), (b.photos || []).length ? `${b.photos.length} photo${b.photos.length > 1 ? "s" : ""}` : null, (b.videos || []).length ? `${b.videos.length} video${b.videos.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "intros" && (
        <>
          {intros && intros.length === 0 && <p className="text-paper-dim text-sm">No introduction requests yet.</p>}
          {intros && intros.length > 0 && (
            <div className="overflow-x-auto border border-stroke rounded-2xl">
              <table className="w-full text-sm">
                <thead className="text-paper-dim text-xs text-left">
                  <tr>
                    <th className="px-4 py-3">Homeowner</th>
                    <th className="px-4 py-3">Builder</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Requested</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {intros.map((i) => (
                    <tr key={i.id} className="border-t border-stroke align-top">
                      <td className="px-4 py-3">
                        <p className="text-paper">{i.homeowner_email}</p>
                        <p className="text-paper-dim text-xs">{i.homeowner_tier} · {i.homeowner_address || "no address"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-paper">{i.builder_name}</p>
                        {i.builder_contact && <p className="text-paper-dim text-xs inline-flex items-center gap-1"><FiExternalLink /> {i.builder_contact}</p>}
                      </td>
                      <td className="px-4 py-3 text-paper-dim max-w-xs whitespace-pre-line">{i.message || "—"}</td>
                      <td className="px-4 py-3 text-paper-dim">{new Date(i.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <select value={i.status} onChange={(e) => updateIntro(i.id, { status: e.target.value })} className="bg-canvas border border-stroke rounded-lg px-2 py-1.5 text-paper text-xs">
                          {Object.entries(STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {active && <Drawer key={active === "new" ? "new" : active.id} builder={activeBuilder} onClose={() => setActive(null)} onChanged={load} />}
    </div>
  );
};

export default AdminBuilders;
