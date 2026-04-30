const PageHeader = ({ title, subtitle }) => {
  return (
    <section className="relative bg-canvas py-20 sm:py-24 lg:py-28 border-b border-stroke">
      <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/5 blur-3xl" />
      <div className="relative container mx-auto px-5 sm:px-8 text-center max-w-3xl">
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-5 text-paper-dim text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">{subtitle}</p>
        )}
      </div>
    </section>
  );
};

export default PageHeader;
