import { Link } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";

const Login = () => {
  return (
    <AuthCard
      title="Welcome Back"
      subtitle="Login to access your dashboard"
      footer={
        <>
          Don’t have an account?{" "}
          <Link to="/signup" className="text-[#2F5D50] font-semibold">Sign up</Link>
        </>
      }
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <FormField label="Email Address" type="email" placeholder="you@example.com" required />
        <FormField label="Password" type="password" placeholder="••••••••••••" required />
        <div className="flex justify-end mb-5">
          <Link to="/forgot-password" className="text-sm text-[#2F5D50] font-semibold hover:underline">
            Forgot Password
          </Link>
        </div>
        <PrimaryButton type="submit">Log In</PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default Login;
