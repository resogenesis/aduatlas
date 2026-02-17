import { useState } from 'react'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [zip, setZip] = useState('')
  const [state, setState] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  return (
    <section id="signup" className="bg-warm-gray py-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-10">
          {/* Email Sign-Up */}
          <div className="bg-white rounded-xl border border-light-border p-8 shadow-sm">
            <h3 className="font-serif text-2xl font-bold text-gray-900 mb-6">
              Get notified when we launch in your area
            </h3>

            {submitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-forest/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-900 font-semibold text-lg">You're on the list!</p>
                <p className="text-gray-500 mt-2">We'll email you once we launch in your area.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest transition-colors"
                  >
                    <option value="">State or Region</option>
                    <option value="TX">Texas</option>
                    <option value="CA">California</option>
                    <option value="FL">Florida</option>
                    <option value="NY">New York</option>
                    <option value="WA">Washington</option>
                    <option value="OR">Oregon</option>
                    <option value="CO">Colorado</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="email"
                    placeholder="Email (required)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest transition-colors"
                  />
                  <input
                    type="text"
                    placeholder="ZIP Code (optional)"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-forest/30 focus:border-forest transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-forest text-white py-3.5 rounded-lg font-semibold hover:bg-forest-dark transition-colors"
                >
                  Notify Me
                </button>

                <p className="text-center text-gray-400 text-sm">
                  We'll only email you once we launch in your area.
                </p>
                <p className="text-center text-gray-400 text-sm">
                  Launching first in Texas + California. Expanding nationwide.
                </p>
              </form>
            )}
          </div>

          {/* Builder CTA */}
          <div id="builders" className="bg-white rounded-xl border border-light-border p-8 shadow-sm flex flex-col">
            <h3 className="font-serif text-2xl font-bold text-gray-900 mb-6">
              Builders &amp; Suppliers&mdash;<br />Want to Get Listed?
            </h3>

            <ul className="space-y-4 text-gray-700 flex-1">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-forest mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>State + ZIP coverage</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-forest mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Featured placement options</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-forest mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Leads from homeowners ready to build.</span>
              </li>
            </ul>

            <a
              href="#"
              className="mt-8 block text-center bg-forest text-white py-3.5 rounded-lg font-semibold hover:bg-forest-dark transition-colors"
            >
              Join the Directory
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
