import { Link } from "react-router-dom";
import { FiMail } from "react-icons/fi";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";

const ForgotPassword = () => {
  return (
    <AuthCard
      eyebrow="Forgot password"
      title="We'll send a magic link."
      subtitle="Enter your email and we'll send a one-click sign-in link. No password reset needed."
      footer={
        <>
          Remember it now?{" "}
          <Link to="/login" className="text-accent hover:text-paper transition-colors font-medium">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <FormField label="Email" type="email" placeholder="you@email.com" required />
        <PrimaryButton type="submit">
          <span className="inline-flex items-center gap-2 justify-center">
            <FiMail /> Send magic link
          </span>
        </PrimaryButton>
      </form>

      <p className="mt-5 text-center text-xs text-paper-dim leading-relaxed">
        New here?{" "}
        <Link to="/create-account" className="text-paper hover:text-accent transition-colors">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
};

export default ForgotPassword;
