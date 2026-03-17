import { cn } from "../../lib/utils";

const CommonSectionTitle = ({ text = "Demo Title", className }) => {
  return (
    <h3 className={cn("text-primary text-[54px] font-semibold", className)}>
      {text}
    </h3>
  );
};

export default CommonSectionTitle;