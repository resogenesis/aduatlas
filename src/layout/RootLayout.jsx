import { useEffect, useRef } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import Footer from "../components/common/Footer";
import Header from "../components/common/Header";
import { usePageTitle } from "../hooks/usePageTitle";
import { useAutoReveal } from "../hooks/useAutoReveal";
import { captureReferralFromSearch } from "../lib/referral";

// Public marketing site. `theme-light` re-skins every token-driven utility
// to the Phase 1 light system (see index.css); the portal and admin layouts
// use the same theme. Each route change fades the page in, and sections
// reveal as they scroll into view.
// CSS animations do not advance in background tabs, so an entry animation
// that starts at opacity 0 would leave a hidden page for screenshots, tab
// previews and crawlers. Only animate when the tab is actually visible.
const canAnimate = () => typeof document !== "undefined" && document.visibilityState === "visible";

const RootLayout = () => {
  usePageTitle();
  const { pathname, search } = useLocation();
  const mainRef = useRef(null);
  useAutoReveal(mainRef);
  // Builder referral links land here as /?ref=<code>; remember the code so the
  // email gate and the checkout can carry it (first touch wins, 30 days).
  useEffect(() => {
    captureReferralFromSearch(search);
  }, [search]);
  return (
    <div className="theme-light min-h-screen flex flex-col">
      <Header />
      <main ref={mainRef} key={pathname} className={`w-full flex-1 overflow-x-clip ${canAnimate() ? "page-enter" : ""}`}>
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
};

export default RootLayout;
