export default function Hero() {
  return (
    <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=80)',
        }}
      />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 text-center px-6 max-w-3xl mx-auto py-24">
        <h1 className="font-serif text-5xl md:text-6xl font-bold text-white leading-tight mb-4">
          ADUAtlas is launching soon.
        </h1>
        <h2 className="font-serif text-2xl md:text-3xl font-semibold text-white mb-6">
          Every ADU rule. Every ZIP code.
        </h2>
        <p className="text-white/90 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
          Find statewide and local ADU guidance&mdash;then get matched with builders who already know your zoning.
        </p>
      </div>
    </section>
  )
}
