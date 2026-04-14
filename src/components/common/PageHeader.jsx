const PageHeader = ({ title, subtitle, bg }) => {
  return (
    <section
      className="relative bg-no-repeat bg-cover bg-center py-16 sm:py-20 lg:py-28"
      style={bg ? { backgroundImage: `url(${bg})` } : { background: "linear-gradient(135deg,#0F3D33,#2F5D50)" }}
    >
      {bg && <div className="absolute inset-0 bg-black/50" />}
      <div className="relative container mx-auto px-4 sm:px-6 text-center text-white">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold drop-shadow-md">{title}</h1>
        {subtitle && (
          <p className="mt-3 max-w-2xl mx-auto text-sm sm:text-base text-white/90">{subtitle}</p>
        )}
      </div>
    </section>
  );
};

export default PageHeader;
