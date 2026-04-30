import { Link } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";

const Login = () => {
  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Pick up where you left off."
      subtitle="Log in to access your course, worksheets, and feasibility study."
      footer={
        <>
          New to ADUAtlas?{" "}
          <Link to="/signup" className="text-accent hover:text-paper transition-colors font-medium">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <FormField label="Email" type="email" placeholder="you@email.com" required />
        <FormField label="Password" type="password" placeholder="••••••••••••" required />
        <div className="flex justify-end mb-6">
          <Link
            to="/forgot-password"
            className="text-xs text-paper-dim hover:text-paper transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <PrimaryButton type="submit">Log in</PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default Login;
