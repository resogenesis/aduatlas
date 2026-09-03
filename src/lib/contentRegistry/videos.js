// Editable content for src/pages/Videos.jsx. The heroImg passed to
// PageHeader as `bg` is a dead prop (PageHeader.jsx doesn't render `bg`) —
// left as-is, not wired here, per scope (only render-affecting content).
import img1 from "../../assets/home/choose_img1.png";
import img2 from "../../assets/home/choose_img2.png";
import img3 from "../../assets/home/choose_img3.png";
import img4 from "../../assets/home/how_it_works.png";
import img5 from "../../assets/home/container_img.png";

const PAGE = "Videos";

// Verbatim from the current `imgs`/`videos` consts: 6 cards, image reuse
// mapping (img1 appears at index 0 and 5) stays exactly as today.
const CARD_IMAGES = [img1, img2, img3, img4, img5, img1];
const CARD_TITLE_DEFAULT = "Demo Video Title";

export const VIDEOS_COUNT = CARD_IMAGES.length;

export const VIDEOS_CONTENT = {
  "videos.header.title": { page: PAGE, label: "Header title", type: "text", default: "Video Library" },
  "videos.intro": {
    page: PAGE, label: "Intro (three paragraphs)", type: "text",
    default:
      "The ADUAtlas Video Library features short and long form videos showcasing ADU builds, tiny homes, prefab ADUs, and modular home construction. Watch everything from a finished ADU delivered by crane to a custom backyard home built from the ground up, including step by step construction and installation footage.\n\nExplore videos covering ADU design ideas, building methods, costs, timelines, and real world projects. The library includes builder showcases, sponsor features, homeowner videos, AI generated concepts, and unique ADU builds across a wide range of styles and budgets.\n\nBrowse the ADUAtlas Video Library to discover real ADU projects, innovative designs, and expert insights across the growing accessory dwelling unit market.",
  },
  ...Object.fromEntries(
    CARD_IMAGES.map((img, i) => [
      `videos.card.${i}.title`,
      { page: PAGE, label: `Card ${i + 1} title`, type: "text", default: CARD_TITLE_DEFAULT },
    ])
  ),
  ...Object.fromEntries(
    CARD_IMAGES.map((img, i) => [
      `videos.card.${i}.image`,
      { page: PAGE, label: `Card ${i + 1} image`, type: "image", default: { src: img, alt: CARD_TITLE_DEFAULT } },
    ])
  ),
};
