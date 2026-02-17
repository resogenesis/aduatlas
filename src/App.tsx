import Navbar from './components/Navbar'
import Hero from './components/Hero'
import SignUp from './components/SignUp'
import HowItWorks from './components/HowItWorks'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar />
      <Hero />
      <SignUp />
      <HowItWorks />
      <Footer />
    </div>
  )
}
