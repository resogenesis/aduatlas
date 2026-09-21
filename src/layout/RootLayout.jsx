import { useRef } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import Footer from "../components/common/Footer";
import Header from "../components/common/Header";
import { usePageTitle } from "../hooks/usePageTitle";
import { useAutoReveal } from "../hooks/useAutoReveal";

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
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  useAutoReveal(mainRef);
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
