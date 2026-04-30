import { createBrowserRouter } from "react-router-dom";
import RootLayout from "../layout/RootLayout";
import DashboardLayout from "../layout/DashboardLayout";
import Home from "../pages/Home";
import About from "../pages/About";
import HowToAdu from "../pages/HowToAdu";
import FAQ from "../pages/FAQ";
import AduTypes from "../pages/AduTypes";
import ChooseState from "../pages/ChooseState";
import Videos from "../pages/Videos";
import Pricing from "../pages/Pricing";
import Quiz from "../pages/Quiz";
import Results from "../pages/Results";
import Unlock from "../pages/Unlock";
import Welcome from "../pages/Welcome";
import BuilderListing from "../pages/BuilderListing";
import BuilderProfile from "../pages/BuilderProfile";
import Feasibility from "../pages/Feasibility";
import UtilityEstimator from "../pages/UtilityEstimator";
import Chapter1 from "../pages/course/Chapter1";
import Chapter2 from "../pages/course/Chapter2";
import Chapter4 from "../pages/course/Chapter4";
import ChapterState from "../pages/course/ChapterState";
import PaidGate from "../components/funnel/PaidGate";
import Login from "../pages/auth/Login";
import Signup from "../pages/auth/Signup";
import ForgotPassword from "../pages/auth/ForgotPassword";
import Dashboard from "../pages/dashboard/Dashboard";
import Profile from "../pages/dashboard/Profile";
import Billing from "../pages/dashboard/Billing";
import Bookmarks from "../pages/dashboard/Bookmarks";
import HelpCenter from "../pages/dashboard/HelpCenter";
import ManageBuilds from "../pages/dashboard/ManageBuilds";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      // ─── Public funnel ─────────────────────────────────────────────
      { index: true, element: <Home /> },
      { path: "quiz", element: <Quiz /> },
      { path: "results", element: <Results /> },
      { path: "unlock", element: <Unlock /> },
      { path: "welcome", element: <Welcome /> },
      { path: "about", element: <About /> },

      // ─── Public stubs (SEO + awareness, no execution) ──────────────
      { path: "how-to-adu", element: <HowToAdu /> },
      { path: "faq", element: <FAQ /> },
      { path: "adu-types", element: <AduTypes /> },
      { path: "choose-your-state", element: <ChooseState /> },
      { path: "videos", element: <Videos /> },
      { path: "pricing", element: <Pricing /> }, // redirects → /unlock

      // ─── Paid course (gated) ───────────────────────────────────────
      { path: "course/c1", element: <PaidGate chapterName="Chapter 1 — How to ADU"><Chapter1 /></PaidGate> },
      { path: "course/c2", element: <PaidGate chapterName="Chapter 2 — ADU Types"><Chapter2 /></PaidGate> },
      { path: "course/c4", element: <PaidGate chapterName="Chapter 4 — Regulations"><Chapter4 /></PaidGate> },
      { path: "course/state", element: <PaidGate chapterName="Regulations by State"><ChapterState /></PaidGate> },

      // ─── Paid tools (gated) ────────────────────────────────────────
      { path: "feasibility", element: <PaidGate chapterName="Feasibility Tool"><Feasibility /></PaidGate> },
      { path: "utility-estimator", element: <PaidGate chapterName="Utility Estimator"><UtilityEstimator /></PaidGate> },
      { path: "builders", element: <PaidGate chapterName="Builder Match"><BuilderListing /></PaidGate> },
      { path: "builders/:id", element: <PaidGate chapterName="Builder Profile"><BuilderProfile /></PaidGate> },

      // ─── Auth ──────────────────────────────────────────────────────
      { path: "login", element: <Login /> },
      { path: "signup", element: <Signup /> },
      { path: "forgot-password", element: <ForgotPassword /> },
    ],
  },
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "profile", element: <Profile /> },
      { path: "billing", element: <Billing /> },
      { path: "bookmarks", element: <Bookmarks /> },
      { path: "help", element: <HelpCenter /> },
      { path: "manage-builds", element: <ManageBuilds /> },
    ],
  },
]);

export default router;
