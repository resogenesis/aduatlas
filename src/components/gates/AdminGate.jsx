import { Navigate } from "react-router-dom";
import { currentUser } from "../../stores/authStore";

// Client-side UX gate for /admin/*. The real enforcement is server-side: every
// /api/admin/* endpoint independently verifies the caller's role. This just
// keeps non-admins from seeing the shell. Logged-out → /login; non-admin →
// their own dashboard.
const AdminGate = ({ children }) => {
  const user = currentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
};

export default AdminGate;
