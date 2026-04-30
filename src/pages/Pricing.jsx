import { Navigate } from "react-router-dom";

// Pricing page killed — single source of truth for the offer is /unlock.
const Pricing = () => <Navigate to="/unlock" replace />;

export default Pricing;
