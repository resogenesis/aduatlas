import { createBrowserRouter } from "react-router-dom";
import RootLayout from "../layout/RootLayout";
import AppLayout from "../layout/AppLayout";
import BuilderLayout from "../layout/BuilderLayout";

import Home from "../pages/Home";
import About from "../pages/About";
import HowToAdu from "../pages/HowToAdu";
import FAQ from "../pages/FAQ";
import AduTypes from "../pages/AduTypes";
import ChooseState from "../pages/ChooseState";
import Videos from "../pages/Videos";
import Pricing from "../pages/Pricing";
import CourseOutline from "../pages/CourseOutline";
import Legal from "../pages/Legal";
import Property from "../pages/Property";
// import Report from "../pages/Report";
import Methodology from "../pages/Methodology";
// import ConversationGuide from "../pages/ConversationGuide";
import Quiz from "../pages/Quiz";
import KnowledgeCheck from "../pages/KnowledgeCheck";
import Results from "../pages/Results";
import Unlock from "../pages/Unlock";
import FeasibilityStudy from "../pages/FeasibilityStudy";
import Welcome from "../pages/Welcome";
import BuilderListing from "../pages/BuilderListing";
import BuilderProfile from "../pages/BuilderProfile";
import Feasibility from "../pages/Feasibility";
import UtilityEstimator from "../pages/UtilityEstimator";
import PacketHub from "../pages/tools/PacketHub";
import PreSiteEstimate from "../pages/tools/PreSiteEstimate";
import PreSiteVerification from "../pages/tools/PreSiteVerification";
import BuilderPrep from "../pages/tools/BuilderPrep";
import TraditionalBuild from "../pages/tools/TraditionalBuild";
import ModularPrefabEstimate from "../pages/tools/ModularPrefabEstimate";
import TotalProjectCost from "../pages/tools/TotalProjectCost";
import ReadyScore from "../pages/tools/ReadyScore";
import PropertyReport from "../pages/tools/PropertyReport";

import BuilderDashboard from "../pages/builder/Dashboard";
import BuilderLeads from "../pages/builder/Leads";
import BuilderLeadDetail from "../pages/builder/LeadDetail";
import BuilderProfilePage from "../pages/builder/Profile";
import BuilderBilling from "../pages/builder/Billing";
import BuilderSettings from "../pages/builder/Settings";
import BuilderGate from "../components/gates/BuilderGate";

import Dashboard from "../pages/app/Dashboard";
import CourseIndex from "../pages/app/CourseIndex";
import CourseIntro from "../pages/app/CourseIntro";
import CourseChapter from "../pages/app/CourseChapter";
import MyProperty from "../pages/app/MyProperty";
import Settings from "../pages/app/Settings";

import AdminLayout from "../layout/AdminLayout";
import AdminGate from "../components/gates/AdminGate";
import AdminOverview from "../pages/admin/AdminOverview";
import AdminUsers from "../pages/admin/AdminUsers";
import AdminAdmins from "../pages/admin/AdminAdmins";

import PaidGate from "../components/gates/PaidGate";

import Login from "../pages/auth/Login";
import Signup from "../pages/auth/Signup";
import ForgotPassword from "../pages/auth/ForgotPassword";

const router = createBrowserRouter([
  // ─── Public site ──────────────────────────────────────────────────
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "property", element: <Property /> },
      // Sample report + conversation guide commented out for now.
      // { path: "report/sample", element: <Report /> },
      // { path: "report/sample/conversation-guide", element: <ConversationGuide /> },
      { path: "methodology", element: <Methodology /> },
      { path: "quiz", element: <Quiz /> },
      { path: "knowledge-check", element: <KnowledgeCheck /> },
      { path: "results", element: <Results /> },
      { path: "unlock", element: <Unlock /> },
      { path: "feasibility-study", element: <FeasibilityStudy /> },
      { path: "signup", element: <Unlock /> },
      { path: "welcome", element: <Welcome /> },
      { path: "about", element: <About /> },

      // Public stubs (SEO + awareness)
      { path: "how-to-adu", element: <HowToAdu /> },
      { path: "faq", element: <FAQ /> },
      { path: "adu-types", element: <AduTypes /> },
      { path: "choose-your-state", element: <ChooseState /> },
      { path: "videos", element: <Videos /> },
      { path: "pricing", element: <Pricing /> },
      { path: "course-outline", element: <CourseOutline /> },
      { path: "legal", element: <Legal /> },

      // Auth
      { path: "login", element: <Login /> },
      { path: "create-account", element: <Signup /> },
      { path: "forgot-password", element: <ForgotPassword /> },
    ],
  },

  // ─── Admin console (role-gated: admin only) ──────────────────────
  {
    path: "/admin",
    element: <AdminGate><AdminLayout /></AdminGate>,
    children: [
      { index: true, element: <AdminOverview /> },
      { path: "users", element: <AdminUsers /> },
      { path: "admins", element: <AdminAdmins /> },
    ],
  },

  // ─── Builder portal (sidebar layout, role-gated) ─────────────────
  {
    path: "/builder",
    element: <BuilderGate><BuilderLayout /></BuilderGate>,
    children: [
      { index: true, element: <BuilderDashboard /> },
      { path: "leads", element: <BuilderLeads /> },
      { path: "leads/:id", element: <BuilderLeadDetail /> },
      { path: "profile", element: <BuilderProfilePage /> },
      { path: "billing", element: <BuilderBilling /> },
      { path: "settings", element: <BuilderSettings /> },
    ],
  },

  // ─── Logged-in homeowner app (sidebar layout) ────────────────────
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { path: "dashboard", element: <PaidGate><Dashboard /></PaidGate> },

      // Course
      { path: "course", element: <PaidGate><CourseIndex /></PaidGate> },
      { path: "course/intro", element: <PaidGate><CourseIntro /></PaidGate> },
      { path: "course/:chapterId", element: <PaidGate><CourseChapter /></PaidGate> },

      // Project brief
      { path: "my-property", element: <PaidGate><MyProperty /></PaidGate> },

      // Gated tools — these are the $399 Feasibility Report deliverables, so
      // they require the "report" tier (not just any paid purchase). No
      // course-progress gate: the feasibility study stands on its own.
      // Builder match keeps its progress gates below — course completion is
      // the marketplace qualification.
      { path: "feasibility", element: <PaidGate requireTier="report"><Feasibility /></PaidGate> },
      { path: "utility-estimator", element: <PaidGate requireTier="report"><UtilityEstimator /></PaidGate> },
      { path: "report", element: <PaidGate requireTier="report"><PropertyReport /></PaidGate> },

      // Planning worksheets + NAPE — included with ANY paid tier (the $99
      // course includes the six workbook worksheets and the Ready Score in
      // self-serve form; the teaser toward $399 is doing the verification
      // legwork yourself). The $399 report tier adds the personalized
      // report, property diagram, feasibility tools, and builder match —
      // those keep requireTier="report" above.
      { path: "packet", element: <PaidGate><PacketHub /></PaidGate> },
      { path: "packet/pre-site-estimate", element: <PaidGate><PreSiteEstimate /></PaidGate> },
      { path: "packet/pre-site-verification", element: <PaidGate><PreSiteVerification /></PaidGate> },
      { path: "packet/builder-prep", element: <PaidGate><BuilderPrep /></PaidGate> },
      { path: "packet/traditional-build", element: <PaidGate><TraditionalBuild /></PaidGate> },
      { path: "packet/modular-prefab", element: <PaidGate><ModularPrefabEstimate /></PaidGate> },
      { path: "packet/total-cost", element: <PaidGate><TotalProjectCost /></PaidGate> },
      { path: "packet/ready-score", element: <PaidGate><ReadyScore /></PaidGate> },
      { path: "builders", element: <PaidGate requireTier="report" requireBuilders><BuilderListing /></PaidGate> },
      { path: "builders/:id", element: <PaidGate requireTier="report" requireBuilders><BuilderProfile /></PaidGate> },

      // Settings
      { path: "settings", element: <Settings /> },
    ],
  },
]);

export default router;
