import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import logo from "../../assets/logo.svg";

const Logo = ({ className = "" }) => {
  return (
    <Link
      to="/"
      className={cn(
        "w-32 sm:w-40 md:w-48 lg:w-56 h-12 sm:h-14 md:h-16 flex items-center",
        className
      )}
    >
      <img src={logo} alt="ADUAtlas.com" className="w-full h-full object-contain" />
    </Link>
  );
};

export default Logo;
