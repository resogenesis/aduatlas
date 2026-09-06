// Bridge between the public site (rendered inside an iframe on
// /admin/content) and the admin console's visual click-to-edit shell.
// AdminEditableSection wraps an existing, already-rendered block of a page
// so it becomes hoverable/clickable ONLY when this page was loaded from the
// admin editor (?__admin_edit=1) by a signed-in admin — for every normal
// visitor it renders its children completely unchanged (no wrapping DOM,
// zero risk to production rendering). Clicking posts the section's content
// keys up to the parent window, which owns the actual editor UI
// (ContentFieldEditor) — this module only knows about "what got clicked",
// not how to edit it.
import { useState } from "react";
import { AdminEditModeContext, computeActive, useAdminEditMode } from "./adminEditMode";

// Computed once per page load — matches how the page is loaded (the admin
// shell sets the iframe's src fresh per page pick), not a live subscription.
export const AdminEditModeProvider = ({ children }) => {
  const [active] = useState(computeActive);
  return <AdminEditModeContext.Provider value={active}>{children}</AdminEditModeContext.Provider>;
};

export const AdminEditableSection = ({ keys, label, children }) => {
  const active = useAdminEditMode();
  if (!active) return children;

  const handleClick = () => {
    window.parent.postMessage({ source: "aduatlas-admin-edit", keys, label }, window.location.origin);
  };

  return (
    <div className="relative group/admin-edit">
      <div className="pointer-events-none absolute inset-0 rounded-md outline-dashed outline-2 outline-transparent group-hover/admin-edit:outline-accent transition-colors z-40" />
      <button
        type="button"
        onClick={handleClick}
        className="hidden group-hover/admin-edit:flex items-center gap-1 absolute top-1 right-1 z-50 px-2.5 py-1 rounded-full bg-accent text-accent-fg text-xs font-semibold shadow-lg"
      >
        Edit {label}
      </button>
      {children}
    </div>
  );
};
