// Shared UI cells and shells for the six Feasibility Study worksheets.
export const NumCell = ({ value, onChange, w = "w-24", prefix = "$" }) => (
  <div className="flex items-center justify-end gap-1">
    {prefix && <span className="text-paper-dim">{prefix}</span>}
    <input
      type="number"
      min="0"
      value={value ?? ""}
      placeholder="0"
      onChange={(e) => onChange(e.target.value)}
      className={`${w} px-2 py-1 rounded-lg bg-canvas border border-stroke text-paper text-sm text-right focus:outline-none focus:border-accent transition`}
    />
  </div>
);

export const TextCell = ({ value, onChange, placeholder = "", w = "w-full" }) => (
  <input
    type="text"
    value={value ?? ""}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    className={`${w} px-2 py-1 rounded-lg bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/40 focus:outline-none focus:border-accent transition`}
  />
);

export const WsHeader = ({ kicker = "Feasibility Report · Worksheet", title, children }) => (
  <>
    <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">{kicker}</p>
    <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-4">
      {title}
    </h1>
    <div className="text-paper-dim text-base sm:text-lg max-w-2xl mb-8">{children}</div>
  </>
);

export const GroupRow = ({ label, cols = 1 }) => (
  <tr className="bg-canvas/60">
    <td colSpan={cols} className="px-4 py-2.5 text-accent text-xs font-semibold tracking-[0.14em] uppercase">
      {label}
    </td>
  </tr>
);

export const Disclaimer = ({ children }) => (
  <p className="text-paper-dim text-xs leading-relaxed mt-8">
    {children || "Planning worksheet, not a quote. Fees, requirements, and timelines vary by municipality — verify with your city, utility providers, and licensed professionals, and replace estimates with written quotes as they arrive."}
  </p>
);
