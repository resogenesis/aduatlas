import { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

export const FormField = ({ label, type = "text", placeholder, required, hint, name }) => {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  const inputType = isPw ? (show ? "text" : "password") : type;
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-gray-800 mb-1.5">
        {label}{required && "*"}
      </label>
      <div className="relative">
        <input
          type={inputType}
          name={name}
          placeholder={placeholder}
          required={required}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#2F5D50] focus:ring-1 focus:ring-[#2F5D50]"
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          >
            {show ? <FiEyeOff /> : <FiEye />}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
};

export const PrimaryButton = ({ children, className = "", ...rest }) => (
  <button
    {...rest}
    className={`w-full cursor-pointer py-3 px-5 rounded-lg bg-[#2F5D50] text-white font-semibold text-sm hover:bg-[#244A40] transition ${className}`}
  >
    {children}
  </button>
);
