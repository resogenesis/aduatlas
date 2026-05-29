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
import Results from "../pages/Results";
import Unlock from "../pages/Unlock";
import Welcome from "../pages/Welcome";
import BuilderListing from "../pages/BuilderListing";
import BuilderProfile from "../pages/BuilderProfile";
import Feasibility from "../pages/Feasibility";
import UtilityEstimator from "../pages/UtilityEstimator";

import BuilderDashboard from "../pages/builder/Dashboard";
import BuilderLeads from "../pages/builder/Leads";
import BuilderLeadDetail from "../pages/builder/LeadDetail";
import BuilderProfilePage from "../pages/builder/Profile";
import BuilderBilling from "../pages/builder/Billing";
import BuilderSettings from "../pages/builder/Settings";
import BuilderGate from "../components/gates/BuilderGate";

import Dashboard from "../pages/app/Dashboard";
import CourseIndex from "../pages/app/CourseIndex";
import CourseChapter from "../pages/app/CourseChapter";
import MyProperty from "../pages/app/MyProperty";
import Settings from "../pages/app/Settings";

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
      { path: "results", element: <Results /> },
      { path: "unlock", element: <Unlock /> },
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
      { path: "signup", element: <Signup /> },
      { path: "forgot-password", element: <ForgotPassword /> },
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
      { path: "course/:chapterId", element: <PaidGate><CourseChapter /></PaidGate> },

      // Project brief
      { path: "my-property", element: <PaidGate><MyProperty /></PaidGate> },

      // Gated tools
      { path: "feasibility", element: <PaidGate requireFeasibility><Feasibility /></PaidGate> },
      { path: "utility-estimator", element: <PaidGate requireFeasibility><UtilityEstimator /></PaidGate> },
      { path: "builders", element: <PaidGate requireBuilders><BuilderListing /></PaidGate> },
      { path: "builders/:id", element: <PaidGate requireBuilders><BuilderProfile /></PaidGate> },

      // Settings
      { path: "settings", element: <Settings /> },
    ],
  },
]);

export default router;
