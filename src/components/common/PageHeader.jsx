// Page header for public pages: left-aligned, no decoration, same headline
// treatment as the homepage.
const PageHeader = ({ title, subtitle, children }) => (
  <section className="bg-surface-1-solid border-b border-stroke">
    <div className="container mx-auto px-5 sm:px-8 py-14 sm:py-20 max-w-6xl">
      <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.02] max-w-3xl">{title}</h1>
      {subtitle && <p className="mt-5 text-paper-dim text-base sm:text-lg leading-relaxed max-w-2xl">{subtitle}</p>}
      {children && <div className="mt-8">{children}</div>}
    </div>
  </section>
);

export default PageHeader;
