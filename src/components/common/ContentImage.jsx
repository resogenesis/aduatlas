// Renders an admin-editable image: the published override if one exists,
// otherwise the bundled default asset passed as fallbackSrc. Same
// object-cover-friendly <img> either way, so admin previews match the live
// site exactly.
import { useContentImage } from "../../lib/content";

const ContentImage = ({ contentKey, className }) => {
  const image = useContentImage(contentKey);
  return <img src={image.src} alt={image.alt} className={className} />;
};

export default ContentImage;
