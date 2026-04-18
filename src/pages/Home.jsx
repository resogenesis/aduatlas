import AduCTA from "../components/common/AduCTA";
import ChooseAtlas from "../components/home/ChooseAtlas";
import Hero from "../components/home/Hero";
import WeProvide from "../components/home/WeProvide";
import WhyChooseUs from "../components/home/WhyChooseUs";

const Home = () => {
    return (
        <div className="w-full">
            <Hero />
            <WeProvide />
            <ChooseAtlas />
            <WhyChooseUs />
            <AduCTA />
        </div>
    );
};

export default Home;