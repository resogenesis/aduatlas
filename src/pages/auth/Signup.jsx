import { useState } from "react";
import { Link } from "react-router-dom";
import AuthCard from "../../components/common/AuthCard";
import { FormField, PrimaryButton } from "../../components/common/FormField";

const Signup = () => {
  const [role, setRole] = useState("homeowner");
  const isPro = role === "pro";

  return (
    <AuthCard
      title="Create Your Account"
      subtitle="Join ADU Atlas and get started today"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-[#2F5D50] font-semibold">Login here</Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 p-1 bg-[#F4F7F6] rounded-lg mb-6">
        <button
          onClick={() => setRole("homeowner")}
          className={`py-2.5 rounded-md text-sm font-semibold transition cursor-pointer ${role === "homeowner" ? "bg-[#2F5D50] text-white" : "text-gray-700"}`}
        >
          I am a Homeowner
        </button>
        <button
          onClick={() => setRole("pro")}
          className={`py-2.5 rounded-md text-sm font-semibold transition cursor-pointer ${role === "pro" ? "bg-[#2F5D50] text-white" : "text-gray-700"}`}
        >
          I am a Professional
        </button>
      </div>

      <form onSubmit={(e) => e.preventDefault()}>
        <FormField label="User Name" placeholder="name" required />
        <FormField label="Email Address" type="email" placeholder="you@example.com" required />
        <FormField label="Password" type="password" placeholder="••••••••••••" required />
        <PrimaryButton type="submit">
          {isPro ? "Sign Up as Builder" : "Sign Up as Homeowner"}
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default Signup;
