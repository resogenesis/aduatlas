import { createBrowserRouter, Navigate } from "react-router-dom";
import NotFound from "../pages/NotFound";
import RootLayout from "../layout/RootLayout";
import AppLayout from "../layout/AppLayout";
import BuilderLayout, { BuilderRedirect } from "../layout/BuilderLayout";

import Home from "../pages/Home";
import About from "../pages/About";
import HowToAdu from "../pages/HowToAdu";
import FAQ from "../pages/FAQ";
import AduTypes from "../pages/AduTypes";
import Pricing from "../pages/Pricing";
import CourseOutline from "../pages/CourseOutline";
import Legal from "../pages/Legal";
import Methodology from "../pages/Methodology";
import Unlock from "../pages/Unlock";
import FeasibilityStudy from "../pages/FeasibilityStudy";
import Welcome from "../pages/Welcome";
import BuilderListing from "../pages/BuilderListing";
import BuilderProfile from "../pages/BuilderProfile";
import FindBuilder from "../pages/FindBuilder";
import ForBuilders from "../pages/ForBuilders";
import AdminBuilders from "../pages/admin/AdminBuilders";
import Rules from "../pages/Rules";
import RulesState from "../pages/RulesState";
import RulesJurisdiction from "../pages/RulesJurisdiction";
import BuilderDashboard from "../pages/builder/BuilderDashboard";
import BuilderProfileEdit from "../pages/builder/BuilderProfileEdit";
import BuilderMessages from "../pages/builder/BuilderMessages";
import GovLayout from "../layout/GovLayout";
import GovPortal from "../pages/gov/GovPortal";
import GovClaim from "../pages/gov/GovClaim";
import GovRegulatory from "../pages/gov/GovRegulatory";
import GovPartnership from "../pages/gov/GovPartnership";
import PartnerEntry from "../pages/PartnerEntry";
import { SPONSORED_ENTRY_PATH } from "../lib/govPartnership";
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


import Dashboard from "../pages/app/Dashboard";
import CourseIndex from "../pages/app/CourseIndex";
import CourseIntro from "../pages/app/CourseIntro";
import CourseChapter from "../pages/app/CourseChapter";
import MyProperty from "../pages/app/MyProperty";
import Help from "../pages/app/Help";
import Settings from "../pages/app/Settings";

import AdminLayout from "../layout/AdminLayout";
import AdminGate from "../components/gates/AdminGate";
import AdminOverview from "../pages/admin/AdminOverview";
import AdminRegulatory from "../pages/admin/AdminRegulatory";
import AdminUsers from "../pages/admin/AdminUsers";
import AdminAdmins from "../pages/admin/AdminAdmins";
import AdminContent from "../pages/admin/AdminContent";
import AdminStudies from "../pages/admin/AdminStudies";
import Study from "../pages/app/Study";
import SitePlan from "../pages/app/SitePlan";
import Costs from "../pages/app/Costs";
import AduOptions from "../pages/app/AduOptions";
import Support from "../pages/app/Support";
import Messages from "../pages/app/Messages";

import PaidGate from "../components/gates/PaidGate";
import SignedInOnly from "../components/messaging/SignedInOnly";
import { WorksheetsReady } from "../components/tools/worksheetKit";

import Login from "../pages/auth/Login";
import Signup from "../pages/auth/Signup";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";

// The resident entry path, from the one constant the partner portal builds its
// links with (src/lib/govPartnership.js). A route and the url that points at it
// cannot disagree when they are the same string (DEF-19).
const SPONSORED_ENTRY = SPONSORED_ENTRY_PATH.replace(/^\/+/, "");

const router = createBrowserRouter([
  // ─── Public site ──────────────────────────────────────────────────
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      // Phase 1 has no public property-address step; old links land on
      // the packages.
      { path: "property", element: <Navigate to="/unlock" replace /> },
      { path: "find-a-builder", element: <FindBuilder /> },
      { path: "for-builders", element: <ForBuilders /> },
      // An individual builder profile is PUBLIC and indexable (Phase 1 spec,
      // decision 2a) and lives at ONE canonical url for both audiences. The
      // page reads the anon-safe record for everyone and adds the marketplace
      // fields (contact details, Save, Request introduction) only for a
      // signed-in paid homeowner, so there is no second paid path to the same
      // profile. The DIRECTORY at /builders, with its search and filters, keeps
      // its paid gate in the app tree below: the marketplace as a whole is
      // never publicly browsable. "builders/join" is a static segment, which
      // react-router ranks above the dynamic ":id" wherever it is declared.
      { path: "builders/:id", element: <BuilderProfile /> },
      { path: "methodology", element: <Methodology /> },

      // ─── ADU Rules and Resources (Phase 1 spec, decisions 2l and 2m) ──
      // PUBLIC and indexable, like a builder profile and unlike the
      // marketplace: the regulatory record is what ADUAtlas promises in seven
      // places on the marketing site, it stands on its own with no government
      // account attached, and a homeowner must be able to read it before
      // spending anything.
      //
      // /rules                      all fifty states plus DC, with honest
      //                             coverage. Structurally nationwide from day
      //                             one; the data is progressive.
      // /rules/:stateCode           one state: its own state-level
      //                             requirements, then the jurisdictions
      //                             beneath it. The segment takes a postal
      //                             code ("/rules/az") or a slugified state
      //                             name ("/rules/arizona"); both resolve to
      //                             the same page.
      // /rules/:stateCode/:slug     one jurisdiction, looked up by (state,
      //                             slug), the key the database makes unique.
      //                             The state segment takes a code or a
      //                             slugified state name (src/lib/usStates.js);
      //                             a segment that names no state renders
      //                             missing. The canonical is the record's own
      //                             /rules/<code>/<slug>.
      //
      // Static segments cannot collide with :stateCode here because every path
      // under /rules is part of this feature, and react-router ranks a static
      // segment above a dynamic one wherever one is added later.
      //
      // WHICH of these pages a crawler is invited to index is decided in
      // api/sitemap.js, and each page emits noindex when
      // jurisdiction_coverage_public says it is not indexable, not here: 2l allows a jurisdiction page where there is
      // enough verified content to justify one and forbids generating
      // thousands of thin pages. A route existing is not an invitation.
      { path: "rules", element: <Rules /> },
      { path: "rules/:stateCode", element: <RulesState /> },
      { path: "rules/:stateCode/:slug", element: <RulesJurisdiction /> },
      // ─── Sponsored resident entry (Phase 1 spec, decision 2p) ─────────
      // Where a resident lands from a government partner's link, and where a
      // partner CODE is entered. PUBLIC because the person following the link
      // has not signed in yet; the page collects the token and the SERVER
      // decides what it is worth. api/partner-redeem.js verifies the session,
      // resolves the app user and calls the service-role-only RPC, so no route
      // shape here can grant anything: an invalid, expired or disabled token
      // grants nothing on every one of these paths.
      //
      // /partner          a code typed in by hand, or a resume of the entry this
      //                   browser remembered.
      // /partner/:token   a link. Migration 0014 generates the token as
      //                   <jurisdiction slug>-<state>-<six symbols>, so
      //                   /partner/phoenix-az-k7m2xq IS the clean
      //                   per-jurisdiction url 2p asks for and no extra path
      //                   segments are invented to imitate one.
      // ?code= and ?token= are accepted on /partner for a partner who publishes a
      // query-string form. Both resolve to the same endpoint and the same grant.
      //
      // The partner and jurisdiction the page names come from the server's context
      // call, which answers only for a link that is redeemable right now, so a
      // fabricated token cannot make the page assert a relationship.
      //
      // These pages carry a token, so they are noindex from inside the component:
      // public/robots.txt has no /partner rule yet and is not this package's file.
      //
      // Both paths are built from SPONSORED_ENTRY_PATH, the constant the partner
      // portal's copy-to-clipboard url and embed snippet use, so the link a partner
      // shares is always a link this router answers.
      { path: SPONSORED_ENTRY, element: <PartnerEntry /> },
      { path: `${SPONSORED_ENTRY}/:token`, element: <PartnerEntry /> },

      { path: "unlock", element: <Unlock /> },
      { path: "feasibility-study", element: <FeasibilityStudy /> },
      { path: "signup", element: <Unlock /> },
      { path: "welcome", element: <Welcome /> },
      { path: "about", element: <About /> },

      // Public stubs (SEO + awareness)
      { path: "how-to-adu", element: <HowToAdu /> },
      { path: "faq", element: <FAQ /> },
      { path: "adu-types", element: <AduTypes /> },
      { path: "pricing", element: <Pricing /> },
      { path: "course-outline", element: <CourseOutline /> },
      { path: "legal", element: <Legal /> },

      // Auth
      { path: "login", element: <Login /> },
      { path: "create-account", element: <Signup /> },
      // Builder signup: same card, role "pro", lands in the builder portal.
      { path: "builders/join", element: <Signup role="pro" /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      // The destination of the recovery link /forgot-password asks Supabase to
      // send. Public by necessity: the link arrives in email and is opened by
      // someone who cannot sign in, and the recovery token in it is the proof
      // of identity. It lives in the public tree for that reason, not by
      // oversight.
      { path: "reset-password", element: <ResetPassword /> },
      // Any address no other route claims, inside the public layout so the
      // header and footer stay. A "*" child ranks below every specific route in
      // every tree, so it never shadows the app, builder, government or admin
      // portals.
      { path: "*", element: <NotFound /> },
    ],
  },

  // ─── Builder portal (role-gated: pro only) ───────────────────────
  // The builder's own profile, aggregate referral counts and the conversations
  // homeowners opened with the builder (decision 2h). Nothing under /builder
  // shows a homeowner's name, email, phone, address or project; a homeowner in
  // a conversation is "a homeowner", because migration 0011 grants no client the
  // column that says who they are. There is no route that starts a
  // conversation: a builder can only reply.
  {
    path: "/builder",
    element: <BuilderLayout />,
    children: [
      { index: true, element: <BuilderDashboard /> },
      { path: "profile", element: <BuilderProfileEdit /> },
      { path: "messages", element: <BuilderMessages /> },
      { path: "messages/:conversationId", element: <BuilderMessages /> },
    ],
  },

  // ─── Government portal (membership-gated, read from the server) ──
  // The participation layer of decisions 2m, 2o and 2p: a government user's own
  // identity state, their own partnership state, the jurisdiction records their
  // entity was EXPLICITLY granted, and resident access when a partnership is
  // active.
  //
  // THE GUARD IN GovLayout IS NOT THE AUTHORIZATION. It calls
  // my_government_context() and renders what the server says the caller holds;
  // a person with no live membership reaches the claim page and nothing else.
  // The real boundary is migration 0012: RLS closes every table, submitting
  // needs a verified membership AND an explicit jurisdiction grant, and
  // publication is service_role only. Deleting this route would change what a
  // stranger SEES and nothing about what they can DO.
  //
  // /gov/claim is reachable by any signed-in person on purpose: claiming is how
  // a membership begins, and a claim produces a PENDING membership that reaches
  // nothing. Claiming never produces verification (2m, 2o).
  {
    path: "/gov",
    element: <GovLayout />,
    children: [
      { index: true, element: <GovPortal /> },
      { path: "claim", element: <GovClaim /> },
      { path: "regulatory", element: <GovRegulatory /> },
      // Present whether or not a partnership is active. With no active
      // partnership the page says so and shows NO tooling, which is 2p's rule;
      // the sidebar leaves the link out entirely, so this is the direct-url
      // case rather than a door.
      { path: "partnership", element: <GovPartnership /> },
    ],
  },

  // ─── Admin console (role-gated: admin only) ──────────────────────
  {
    path: "/admin",
    element: <AdminGate><AdminLayout /></AdminGate>,
    children: [
      { index: true, element: <AdminOverview /> },
      { path: "content", element: <AdminContent /> },
      { path: "studies", element: <AdminStudies /> },
      { path: "builders", element: <AdminBuilders /> },
      // Rules and Resources: the third, fourth and fifth things in Amy's scope
      // (2f) — regulatory resources, government entity claims, and reviewing
      // and publishing government submissions — on one admin route. The
      // component is the admin package's; this file only mounts it, inside the
      // same AdminGate as every sibling, so there is no second door into it.
      { path: "regulatory", element: <AdminRegulatory /> },
      { path: "users", element: <AdminUsers /> },
      { path: "admins", element: <AdminAdmins /> },
    ],
  },


  // ─── Logged-in homeowner app (sidebar layout) ────────────────────
  // A builder (role "pro") never sees the homeowner app: BuilderRedirect
  // sends them to /builder from any of these routes.
  {
    path: "/",
    element: <BuilderRedirect><AppLayout /></BuilderRedirect>,
    children: [
      { path: "dashboard", element: <PaidGate><Dashboard /></PaidGate> },

      // Course
      { path: "course", element: <PaidGate><CourseIndex /></PaidGate> },
      { path: "course/intro", element: <PaidGate><CourseIntro /></PaidGate> },
      { path: "course/:chapterId", element: <PaidGate><CourseChapter /></PaidGate> },

      // My Property and Site Plan: the brief, with a sub navigation to the
      // four pages below (Phase 1 spec, section 4). Their routes and tier
      // gates are unchanged; only the sidebar stopped listing them.
      { path: "my-property", element: <PaidGate><MyProperty /></PaidGate> },
      // Any signed-in homeowner may open the intake and save a draft (decision
      // 2q, R3-03): a free or Golden homeowner too, so a tier gate here would
      // block exactly what 2q permits. The tier gate was never the boundary:
      // SUBMITTING is refused by the studies RLS in migration 0018 without a
      // live Platinum or Concierge entitlement, and the page offers the upgrade
      // when that refusal comes back.
      { path: "study", element: <SignedInOnly><Study /></SignedInOnly> },
      { path: "site-plan", element: <PaidGate requireTier="report" chapterName="Site plan"><SitePlan /></PaidGate> },
      { path: "costs", element: <PaidGate><Costs /></PaidGate> },
      { path: "adu-options", element: <PaidGate><AduOptions /></PaidGate> },
      { path: "support", element: <PaidGate requireTier="concierge" chapterName="Concierge support"><Support /></PaidGate> },
      // Help: every paid tier. Concierge buyers reach /support from here.
      { path: "help", element: <PaidGate><Help /></PaidGate> },

      // Gated tools: these are the Platinum deliverables, so
      // they require the "report" tier (not just any paid purchase). No
      // course-progress gate: the feasibility study stands on its own.
      // Builder match keeps its progress gates below; course completion is
      // the marketplace qualification.
      //
      // The Feasibility tool and the Ready Score read their saved worksheets
      // once, when they mount, so each is wrapped in WorksheetsReady: on a new
      // device it first renders after the server copy has been read, rather
      // than blank or on an older copy (R3-02, src/components/tools/worksheetKit.js).
      { path: "feasibility", element: <PaidGate requireTier="report"><WorksheetsReady><Feasibility /></WorksheetsReady></PaidGate> },
      { path: "utility-estimator", element: <PaidGate requireTier="report"><UtilityEstimator /></PaidGate> },
      { path: "report", element: <PaidGate requireTier="report"><PropertyReport /></PaidGate> },

      // Preparation worksheets + the ADU Ready Score (NAPE) are Platinum and
      // Concierge deliverables (Richard and Amy call, 2026-09-24), so every
      // /packet/* route requires the "report" tier. A Golden buyer lands on
      // the tier paywall, not the worksheets.
      { path: "packet", element: <PaidGate requireTier="report" chapterName="Worksheets"><PacketHub /></PaidGate> },
      { path: "packet/pre-site-estimate", element: <PaidGate requireTier="report" chapterName="Worksheets"><PreSiteEstimate /></PaidGate> },
      { path: "packet/pre-site-verification", element: <PaidGate requireTier="report" chapterName="Worksheets"><PreSiteVerification /></PaidGate> },
      { path: "packet/builder-prep", element: <PaidGate requireTier="report" chapterName="Worksheets"><BuilderPrep /></PaidGate> },
      { path: "packet/traditional-build", element: <PaidGate requireTier="report" chapterName="Worksheets"><TraditionalBuild /></PaidGate> },
      { path: "packet/modular-prefab", element: <PaidGate requireTier="report" chapterName="Worksheets"><ModularPrefabEstimate /></PaidGate> },
      { path: "packet/total-cost", element: <PaidGate requireTier="report" chapterName="Worksheets"><TotalProjectCost /></PaidGate> },
      { path: "packet/ready-score", element: <PaidGate requireTier="report" chapterName="Worksheets"><WorksheetsReady><ReadyScore /></WorksheetsReady></PaidGate> },
      // The directory with search and filters stays paid. The profile it links
      // to is public and declared in the public tree above.
      { path: "builders", element: <PaidGate><BuilderListing /></PaidGate> },
      // Messages with builders (decision 2h). Signed in, and otherwise only the
      // caller's own threads, which is all RLS returns. No plan gate on
      // purpose: STARTING a conversation needs a paid plan and a claimed
      // listing, and the database enforces both (0011); READING what was
      // already said stays open to the homeowner who said it.
      { path: "messages", element: <SignedInOnly><Messages /></SignedInOnly> },
      { path: "messages/:conversationId", element: <SignedInOnly><Messages /></SignedInOnly> },

      // Settings: signed in, at ANY plan or none, and never a plan gate. The
      // account page names the customer's email, plan and payment status, so an
      // anonymous visitor is sent to sign in. It is also where the refund
      // request thread lives (contract C1), and that thread has to stay
      // readable AFTER the refund: charge.refunded stamps refunded_at, which
      // makes isPaid() false, so a PaidGate here would replace the page with a
      // paywall and hide ADUAtlas's reply from the person it answers. The page
      // decides what to show from the server's billing facts (a refund control
      // only when money bought the plan), and the database decides what may be
      // filed (0024), so a plan gate here would only take things away.
      { path: "settings", element: <SignedInOnly><Settings /></SignedInOnly> },
    ],
  },
]);

export default router;
