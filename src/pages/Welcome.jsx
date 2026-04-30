import { Link } from "react-router-dom";
import { FiArrowRight, FiCheckCircle } from "react-icons/fi";

// INTEGRATION POINT (Stripe webhook + Supabase): when this page loads in
// production, the Stripe success_url will include ?session_id=. The
// webhook will have already set users.paid_at via the checkout.session.completed
// event. This page just confirms and routes the user into the course.
//
// INTEGRATION POINT (Resend): trigger "Welcome — your access is unlocked"
// transactional email here.

const Welcome = () => {
  return (
    <div className="min-h-[80vh] bg-[#F4F7F6] py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 max-w-2xl text-center">

        <div className="w-20 h-20 mx-auto rounded-full bg-[#2F5D50]/10 flex items-center justify-center mb-6">
          <FiCheckCircle className="text-[#2F5D50] text-4xl" />
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary mb-4">
          Welcome to ADUAtlas Paid Access
        </h1>
        <p className="text-secondary text-base sm:text-lg leading-relaxed mb-10">
          Your access is unlocked. We've sent a confirmation to your email. Start with the structured course — every module unlocks the next, and Module 9 is your personalized Feasibility Study.
        </p>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-10 text-left mb-8">
          <h3 className="font-semibold text-primary text-lg mb-4">Your next 3 steps</h3>
          <ol className="space-y-4">
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-[#2F5D50] text-white text-sm font-semibold flex items-center justify-center">1</span>
              <div>
                <p className="font-semibold text-primary text-sm sm:text-base">Start the course</p>
                <p className="text-secondary text-sm">Module 1 covers zoning vs. building code — the foundation everything else builds on.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-[#2F5D50] text-white text-sm font-semibold flex items-center justify-center">2</span>
              <div>
                <p className="font-semibold text-primary text-sm sm:text-base">Complete the worksheets</p>
                <p className="text-secondary text-sm">Pre-filled with your quiz answers. Each one tightens your budget and timeline estimate.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-[#2F5D50] text-white text-sm font-semibold flex items-center justify-center">3</span>
              <div>
                <p className="font-semibold text-primary text-sm sm:text-base">Unlock your Feasibility Study</p>
                <p className="text-secondary text-sm">Module 9 generates your GIS site plan, refined readiness score, and builder RFP packet.</p>
              </div>
            </li>
          </ol>
        </div>

        <Link
          to="/how-to-adu"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-[#2F5D50] text-white font-semibold hover:bg-[#244A40] transition"
        >
          Start Module 1 <FiArrowRight />
        </Link>

      </div>
    </div>
  );
};

export default Welcome;
