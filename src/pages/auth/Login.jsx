import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import { login, routeForUser } from "../../stores/authStore";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    // Real Supabase Auth when configured; mock otherwise. routeForUser() stays.
    const res = await login({ email, password });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate(routeForUser(res.user), { replace: true });
  };


  return (
    <AuthCard
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
          <p className="mb-4 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <PrimaryButton type="submit">Log in</PrimaryButton>
      </form>

    </AuthCard>
  );
};

export default Login;
