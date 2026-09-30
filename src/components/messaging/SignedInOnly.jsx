import { Navigate, useLocation } from "react-router-dom";
import { currentUser } from "../../stores/authStore";

// Route wrapper: signed in, at ANY plan or none. A signed-out visitor is sent to
// sign in, with the page they asked for as `next` so they come back to it. It
// exists for the homeowner routes whose rule is "your own account" rather than
// "your plan":
//
//   /messages    a homeowner's own threads with builders (decision 2h). RLS in
//                migration 0011 returns only the caller's threads and decides
//                who may START one (a paid homeowner, a claimed listing).
//   /study       the feasibility intake (decision 2q, R3-03). Any homeowner may
//                begin and save a DRAFT; SUBMITTING is refused by the studies
//                RLS in migration 0018 without a live Platinum or Concierge
//                entitlement.
//   /settings    the account page and its refund request thread (contract C1).
//                A refunded customer holds no live plan and must still read
//                ADUAtlas's reply there. The page offers a refund only when
//                money bought the plan, and migration 0024 decides what may be
//                filed.
//
// This is navigation, not authorization. It hides nothing the database would
// hand out, and the boundaries named above are the ones that hold. A builder
// never reaches it: BuilderRedirect around the homeowner app sends role "pro"
// to /builder first.
const SignedInOnly = ({ children }) => {
  const { pathname, search } = useLocation();
  if (currentUser()) return children;
  return <Navigate to={`/login?next=${encodeURIComponent(`${pathname}${search}`)}`} replace />;
};

export default SignedInOnly;
