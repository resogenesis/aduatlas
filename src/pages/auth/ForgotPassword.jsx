import { Link } from "react-router-dom";
import { FiMail } from "react-icons/fi";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";

const ForgotPassword = () => {
  return (
    <AuthCard
      title="Forgot Password"
      subtitle="Enter your email to receive a magic link"
      footer={
        <>
          Don’t have an account?{" "}
          <Link to="/signup" className="text-[#2F5D50] font-semibold">Sign up</Link>
        </>
      }
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <FormField label="Email Address" type="email" placeholder="you@example.com" required />
        <PrimaryButton type="submit">
          <span className="inline-flex items-center gap-2 justify-center"><FiMail /> Send Magic Link</span>
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default ForgotPassword;
