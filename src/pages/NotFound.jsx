import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { setRobots } from "../lib/head";

// Any address no route claims. Before this page existed an unknown URL showed
// React Router's own error screen ("Unexpected Application Error! 404"), with
// no header, no footer and no way back. It asks not to be indexed (2l: a
// missing page is never indexable), and it offers the three places a visitor
// most often meant.
const NotFound = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    setRobots("noindex");
    return () => setRobots(null);
  }, []);
  return (
    <section className="min-h-[70vh] bg-canvas py-20 sm:py-28">
      <div className="container mx-auto px-5 sm:px-8 max-w-2xl">
        <h1 className="font-primary font-extrabold tracking-[-0.025em] text-paper text-4xl sm:text-5xl leading-[1.05] mb-5">
          We could not find that page.
        </h1>
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-8">
          There is nothing at <span className="text-paper break-all">{pathname}</span>. The link may be old, or the address may have a typo.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/" className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors press">
            Go to the home page
          </Link>
          <Link to="/rules" className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition press">
            Look up ADU rules
          </Link>
          <Link to="/unlock" className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition press">
            See the plans
          </Link>
        </div>
      </div>
    </section>
  );
};

export default NotFound;
