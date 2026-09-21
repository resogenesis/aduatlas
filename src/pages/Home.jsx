import Hero from "../components/home/Hero";
import Stages from "../components/home/Stages";
import Possible from "../components/home/Possible";
import Plans from "../components/home/Plans";
import BuilderTeaser from "../components/home/BuilderTeaser";
import Mission from "../components/home/Mission";
import ClosingCta from "../components/home/ClosingCta";

// Phase 1 homepage: hero with the address box and live sample check,
// what is possible, plans, builder access, mission, final address CTA.
const Home = () => (
  <div className="w-full">
    <Hero />
    <Stages />
    <Possible />
    <Plans />
    <BuilderTeaser />
    <Mission />
    <ClosingCta />
  </div>
);

export default Home;
