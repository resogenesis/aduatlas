import { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

export const FormField = ({ label, type = "text", placeholder, required, hint, name, value, onChange }) => {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  const inputType = isPw ? (show ? "text" : "password") : type;
  const controlledProps = onChange ? { value: value ?? "", onChange } : {};
  return (
    <div className="mb-5">
      <label className="block text-paper text-xs font-medium mb-2">
        {label}{required && " *"}
      </label>
      <div className="relative">
        <input
          type={inputType}
          name={name}
          placeholder={placeholder}
          required={required}
          {...controlledProps}
          className="w-full px-4 py-3.5 rounded-xl bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition"
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-dim hover:text-paper transition"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <FiEyeOff /> : <FiEye />}
          </button>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs text-paper-dim/70">{hint}</p>}
    </div>
  );
};

export const PrimaryButton = ({ children, className = "", ...rest }) => (
  <button
    {...rest}
    className={`w-full cursor-pointer py-3.5 px-5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors ${className}`}
  >
    {children}
  </button>
);
