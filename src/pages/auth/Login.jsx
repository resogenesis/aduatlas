import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { DEMO_ACCOUNTS, login, routeForUser } from "../../stores/authStore";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    // INTEGRATION POINT (Supabase Auth): replace login() with
    // supabase.auth.signInWithPassword. routeForUser() stays.
    const res = login({ email, password });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate(routeForUser(res.user), { replace: true });
  };

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError("");
  };

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Pick up where you left off."
      subtitle="Log in to access your course, worksheets, and feasibility study."
      footer={
        <>
          New to ADUAtlas?{" "}
          <Link to="/create-account" className="text-accent hover:text-paper transition-colors font-medium">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex justify-end mb-6">
          <Link
            to="/forgot-password"
            className="text-xs text-paper-dim hover:text-paper transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <PrimaryButton type="submit">Log in</PrimaryButton>
      </form>

      <div className="mt-7 pt-6 border-t border-stroke">
        <p className="text-paper-dim text-xs uppercase tracking-[0.15em] mb-3">Demo accounts</p>
        <div className="grid gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => fillDemo(acc)}
              className="text-left flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-stroke hover:border-accent transition group"
            >
              <span className="flex flex-col">
                <span className="text-paper text-sm font-medium">{acc.label}</span>
                <span className="text-paper-dim text-xs">{acc.email}</span>
              </span>
              <span className="text-accent text-xs font-medium opacity-0 group-hover:opacity-100 transition">
                Fill →
              </span>
            </button>
          ))}
        </div>
      </div>
    </AuthCard>
  );
};

export default Login;
