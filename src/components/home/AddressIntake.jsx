import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiMapPin } from "react-icons/fi";
import { AddressAutofill } from "@mapbox/search-js-react";
import { EV, track } from "../../lib/analytics";

// Address-first hero CTA. The user enters an address; we route to the free
// /property output page where confidence chips surface what we know vs.
// what's estimated vs. unknown.
//
// When VITE_MAPBOX_TOKEN is set, AddressAutofill provides Places autocomplete
// (US-only, address-class). When unset, falls back to a plain text input.

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const AddressIntake = ({ size = "lg" }) => {
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
      placeholder="123 Main St, Pasadena CA 91103"
      className={`flex-1 bg-transparent text-paper placeholder:text-paper-dim/60 focus:outline-none ${
        isLg ? "py-3 sm:py-4 text-base sm:text-lg" : "py-2.5 text-sm"
      }`}
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
          colorBackground: "#161814",
          colorText: "#F5F1E8",
          colorPrimary: "#C6F24E",
          fontFamily: "Inter, sans-serif",
          border: "1px solid #2A2D26",
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
    <form onSubmit={submit} className="w-full max-w-2xl">
      <div className="flex items-stretch gap-2 bg-surface-1-solid border border-stroke rounded-full p-1.5 focus-within:border-accent transition">
        <span className={`flex items-center pl-4 sm:pl-5 text-paper-dim ${isLg ? "text-lg" : "text-base"}`}>
          <FiMapPin />
        </span>
        {wrappedInput}
        <button
          type="submit"
          className={`group inline-flex items-center gap-2 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors shrink-0 ${
            isLg ? "px-5 sm:px-7 py-3 sm:py-4 text-sm sm:text-base" : "px-5 py-2.5 text-sm"
          }`}
        >
          Check your property
          <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </form>
  );
};

export default AddressIntake;
