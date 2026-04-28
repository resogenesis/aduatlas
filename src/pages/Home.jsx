import AduCTA from "../components/common/AduCTA";
import ChooseAtlas from "../components/home/ChooseAtlas";
import Hero from "../components/home/Hero";
import SaveTimeMoney from "../components/home/SaveTimeMoney";
import WhyChooseUs from "../components/home/WhyChooseUs";

const Home = () => {
    return (
        <div className="w-full">
            <Hero />
            <SaveTimeMoney />
            <ChooseAtlas />
            <WhyChooseUs />
            <AduCTA />
        </div>
    );
};

export default Home;