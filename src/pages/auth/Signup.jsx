import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { routeForUser, signup } from "../../stores/authStore";

const Signup = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState("homeowner");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const isPro = role === "pro";

  const [notice, setNotice] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    // Real Supabase Auth when configured; mock otherwise.
    const res = await signup({ email, password, username, role });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Email-confirmation flow: no session yet — tell them to check their inbox.
    if (res.needsConfirmation) {
      setNotice("Check your email to confirm your account, then log in.");
      return;
    }
    // New homeowners take the 10-question knowledge check first (funnels into
    // the course); builders/pros go straight to their portal.
    if (res.user.role === "pro") {
      navigate(routeForUser(res.user), { replace: true });
    } else {
      navigate("/knowledge-check", { replace: true });
    }
  };

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
      <div className="grid grid-cols-2 gap-1 p-1 bg-canvas border border-stroke rounded-full mb-7">
        <button
          type="button"
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
          type="button"
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

      <form onSubmit={handleSubmit}>
        <FormField
          label="Username"
          placeholder="JohnSmith10"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <FormField
          label="Email"
          type="email"
          placeholder="you@email.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Password"
          type="password"
          placeholder="••••••••••••"
          required
          hint="At least 4 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 text-sm text-accent bg-accent/10 border border-accent/30 rounded-xl px-4 py-3">
            {notice}
          </p>
        )}

        <PrimaryButton type="submit">
          {isPro ? "Sign up as Builder" : "Sign up as Homeowner"}
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default Signup;
