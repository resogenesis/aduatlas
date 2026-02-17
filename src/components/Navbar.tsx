import { useState } from 'react'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const base = import.meta.env.BASE_URL

  return (
    <nav className="w-full bg-white border-b border-light-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#" className="flex items-center gap-3">
          <img src={`${base}logo.png`} alt="ADUAtlas" className="h-10 w-auto" />
        </a>

        <div className="hidden md:flex items-center gap-8">
          <a href="#" className="text-gray-700 hover:text-forest font-medium transition-colors">Home</a>
          <a href="#builders" className="text-gray-700 hover:text-forest font-medium transition-colors">Builders</a>
          <a href="#suppliers" className="text-gray-700 hover:text-forest font-medium transition-colors">Suppliers</a>
          <a href="#faq" className="text-gray-700 hover:text-forest font-medium transition-colors">FAQ</a>
          <a
            href="#signup"
            className="bg-forest text-white px-6 py-2.5 rounded-lg font-medium hover:bg-forest-dark transition-colors"
          >
            Get Started
          </a>
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 text-gray-700"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-light-border bg-white px-6 py-4 space-y-3">
          <a href="#" className="block text-gray-700 font-medium">Home</a>
          <a href="#builders" className="block text-gray-700 font-medium">Builders</a>
          <a href="#suppliers" className="block text-gray-700 font-medium">Suppliers</a>
          <a href="#faq" className="block text-gray-700 font-medium">FAQ</a>
          <a href="#signup" className="block bg-forest text-white px-6 py-2.5 rounded-lg font-medium text-center">
            Get Started
          </a>
        </div>
      )}
    </nav>
  )
}
