import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiMapPin } from "react-icons/fi";
import { AddressAutofill } from "@mapbox/search-js-react";
import { EV, track } from "../../lib/analytics";

// Address-first CTA. The visitor enters an address and lands on the free
// /property check, which shows what we know, what is estimated and what is
// unknown before any paid analysis.
//
// With VITE_MAPBOX_TOKEN set, AddressAutofill adds US address autocomplete;
// without it this is a plain text input.

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const AddressIntake = ({ size = "lg", cta = "Check My Property", placeholder = "Enter your property address", className = "", buttonClassName = "" }) => {
  const navigate = useNavigate();
  const [value, setValue] = useState("");

  const submit = (e) => {
    e?.preventDefault?.();
    const trimmed = value.trim();
    if (trimmed.length < 5) return;
    track(EV.ADDRESS_SUBMITTED, { length: trimmed.length, autocompleted: Boolean(MAPBOX_TOKEN) });
    navigate(`/property?q=${encodeURIComponent(trimmed)}`);
  };

  const isLg = size === "lg";

  const inputEl = (
    <input
      type="text"
      name="address-line1"
      autoComplete="address-line1"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      aria-label="Property address"
      className={`flex-1 min-w-0 bg-transparent text-paper placeholder:text-paper-dim/70 focus:outline-none ${ isLg ?"py-3 text-sm sm:text-base":"py-2.5 text-sm"}`}
    />
  );

  const wrappedInput = MAPBOX_TOKEN ? (
    <AddressAutofill
      accessToken={MAPBOX_TOKEN}
      onRetrieve={(res) => {
        const f = res?.features?.[0];
        if (f?.properties?.full_address) setValue(f.properties.full_address);
      }}
      options={{ country: "us", types: "address" }}
      theme={{
        variables: {
          colorBackground: "#FFFFFF",
          colorText: "#17201B",
          colorPrimary: "#2E5E44",
          fontFamily: "Inter, sans-serif",
          border: "1px solid #E1E6E0",
          borderRadius: "12px",
          unit: "14px",
        },
      }}
    >
      {inputEl}
    </AddressAutofill>
  ) : (
    inputEl
  );

  return (
    <form onSubmit={submit} className={`w-full ${className}`}>
      <div
        className={`flex items-stretch gap-2 bg-canvas border border-stroke rounded-2xl shadow-[0_10px_30px_-12px_rgba(23,32,27,0.18)] focus-within:border-accent transition ${ isLg ?"p-2":"p-1.5"}`}
      >
        <span className={`flex items-center pl-3 sm:pl-4 text-paper-dim ${isLg ?"text-lg":"text-base"}`}>
          <FiMapPin />
        </span>
        {wrappedInput}
        <button
          type="submit"
          className={`group inline-flex items-center gap-2 rounded-xl font-semibold transition-colors shrink-0 ${ buttonClassName ||"bg-accent text-accent-fg hover:bg-accent-dim"} ${isLg ?"px-4 sm:px-5 py-3 text-sm":"px-4 py-2.5 text-sm"}`}
        >
          {cta}
          <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </form>
  );
};

export default AddressIntake;
