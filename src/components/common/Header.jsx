import Logo from "./Logo";
import logo from "../../assets/logo.svg";
import AuthButtons from "./AuthButtons";

const Header = () => {
  return (
    <header className="w-full sticky top-0 bg-white z-50 shadow-md py-2 lg:py-5">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* logo */}
        <Logo src={logo} />

        {/* nav buttons */}
        <AuthButtons />
      </div>
    </header>
  );
};

export default Header;