import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const Logo = ({ className = "", src = "" }) => {
  return (
    <Link
      to="/"
      className={cn(
        "w-40 sm:w-48 md:w-56 lg:w-64 h-14 sm:h-16 flex items-center",
        className
      )}
    >
      <img
        src={src}
        alt="logo"
        className="w-full h-full object-contain"
      />
    </Link>
  );
};

export default Logo;