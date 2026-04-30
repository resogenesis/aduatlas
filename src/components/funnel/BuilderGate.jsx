import { Navigate } from "react-router-dom";
import { currentUser } from "../../funnel/authStore";

// Only logged-in users with role "pro" can access /builder/*.
// Logged-out → /login.  Logged in as homeowner → /dashboard.
const BuilderGate = ({ children }) => {
  const user = currentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "pro") return <Navigate to="/dashboard" replace />;
  return children;
};

export default BuilderGate;
