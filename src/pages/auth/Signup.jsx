import { useState } from "react";
import { Link } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";

const Signup = () => {
  const [role, setRole] = useState("homeowner");
  const isPro = role === "pro";

  return (
    <AuthCard
      eyebrow="Create account"
      title="Start your ADU plan."
      subtitle="One account. Lifetime access to your course, worksheets, and feasibility study."
      footer={
        <>
          Already a member?{" "}
          <Link to="/login" className="text-accent hover:text-paper transition-colors font-medium">
            Log in
          </Link>
        </>
      }
    >
      {/* Role toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-canvas border border-stroke rounded-full mb-7">
        <button
          onClick={() => setRole("homeowner")}
          className={`py-2.5 rounded-full text-xs font-medium tracking-[0.05em] uppercase transition cursor-pointer ${
            role === "homeowner"
              ? "bg-accent text-accent-fg"
              : "text-paper-dim hover:text-paper"
          }`}
        >
          Homeowner
        </button>
        <button
          onClick={() => setRole("pro")}
          className={`py-2.5 rounded-full text-xs font-medium tracking-[0.05em] uppercase transition cursor-pointer ${
            role === "pro"
              ? "bg-accent text-accent-fg"
              : "text-paper-dim hover:text-paper"
          }`}
        >
          Builder / Pro
        </button>
      </div>

      <form onSubmit={(e) => e.preventDefault()}>
        <FormField label="Username" placeholder="JohnSmith10" required />
        <FormField label="Email" type="email" placeholder="you@email.com" required />
        <FormField label="Password" type="password" placeholder="••••••••••••" required hint="At least 8 characters" />
        <PrimaryButton type="submit">
          {isPro ? "Sign up as Builder" : "Sign up as Homeowner"}
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default Signup;
