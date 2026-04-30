import { createBrowserRouter } from "react-router-dom";
import RootLayout from "../layout/RootLayout";
import AppLayout from "../layout/AppLayout";
import BuilderLayout from "../layout/BuilderLayout";
import DashboardLayout from "../layout/DashboardLayout";

import Home from "../pages/Home";
import About from "../pages/About";
import HowToAdu from "../pages/HowToAdu";
import FAQ from "../pages/FAQ";
import AduTypes from "../pages/AduTypes";
import ChooseState from "../pages/ChooseState";
import Videos from "../pages/Videos";
import Pricing from "../pages/Pricing";
import Property from "../pages/Property";
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
import BuilderGate from "../components/funnel/BuilderGate";

import Dashboard from "../pages/app/Dashboard";
import CourseIndex from "../pages/app/CourseIndex";
import CourseChapter from "../pages/app/CourseChapter";
import MyProperty from "../pages/app/MyProperty";
import Settings from "../pages/app/Settings";

import PaidGate from "../components/funnel/PaidGate";

import Login from "../pages/auth/Login";
import Signup from "../pages/auth/Signup";
import ForgotPassword from "../pages/auth/ForgotPassword";

import Dashboard_OLD from "../pages/dashboard/Dashboard";
import Profile from "../pages/dashboard/Profile";
import Billing from "../pages/dashboard/Billing";
import Bookmarks from "../pages/dashboard/Bookmarks";
import HelpCenter from "../pages/dashboard/HelpCenter";
import ManageBuilds from "../pages/dashboard/ManageBuilds";

const router = createBrowserRouter([
  // ─── Public site (with marketing header/footer) ──────────────────
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "property", element: <Property /> },
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

  // ─── Legacy dashboard (kept routed but no longer linked) ─────────
  {
    path: "/dashboard-old",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Dashboard_OLD /> },
      { path: "profile", element: <Profile /> },
      { path: "billing", element: <Billing /> },
      { path: "bookmarks", element: <Bookmarks /> },
      { path: "help", element: <HelpCenter /> },
      { path: "manage-builds", element: <ManageBuilds /> },
    ],
  },
]);

export default router;
