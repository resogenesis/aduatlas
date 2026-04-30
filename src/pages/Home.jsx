import FunnelSteps from "../components/home/FunnelSteps";
import QuizHero from "../components/home/QuizHero";
import RiskCallouts from "../components/home/RiskCallouts";

const Home = () => {
    return (
        <div className="w-full">
            <QuizHero />
            <RiskCallouts />
            <FunnelSteps />
        </div>
    );
};

export default Home;
