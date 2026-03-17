import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import LogoSVG from "./LogoSVG";

const Logo = ({ className = "" }) => {
  return (
    <Link
      to="/"
      className={cn(
        "w-40 sm:w-48 md:w-56 lg:w-64 h-14 sm:h-16 flex items-center",
        className
      )}
    >
      <LogoSVG className="w-full h-full" />
    </Link>
  );
};

export default Logo;
