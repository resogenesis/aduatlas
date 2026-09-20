import { Outlet, ScrollRestoration } from "react-router-dom";
import Footer from "../components/common/Footer";
import Header from "../components/common/Header";

// Public marketing site. `theme-light` re-skins every token-driven utility
// to the Phase 1 light system (see index.css); the portal, builder and admin
// layouts keep the dark canvas until they are redesigned.
const RootLayout = () => (
  <div className="theme-light min-h-screen flex flex-col">
    <Header />
    <main className="w-full flex-1 overflow-x-clip">
      <Outlet />
    </main>
    <Footer />
    <ScrollRestoration />
  </div>
);

export default RootLayout;
