// Non-JSX half of the admin edit-mode bridge (context + hook), split out from
// adminEditBridge.jsx so that file can stay component-only (react-refresh).
import { createContext, useContext } from "react";
import { currentUser } from "../stores/authStore";

export const AdminEditModeContext = createContext(false);

export const computeActive = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("__admin_edit") === "1" && currentUser()?.role === "admin";
};

export const useAdminEditMode = () => useContext(AdminEditModeContext);
