import { cn } from "../../lib/utils";

const CommonSectionTitle = ({ text = "Demo Title", className }) => {
  return (
    <h3 className={cn("text-primary text-3xl sm:text-4xl md:text-[44px] lg:text-[54px] font-semibold leading-tight", className)}>
      {text}
    </h3>
  );
};

export default CommonSectionTitle;