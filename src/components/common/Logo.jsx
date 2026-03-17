import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const Logo = ({ className = "", src = "" }) => {
  return (
    <Link
      to="/"
      className={cn(
        "w-32 sm:w-36 md:w-40 lg:w-44 h-12 flex items-center",
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