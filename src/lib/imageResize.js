// Client-side image downscale before upload. The site renders hero/header
// images with CSS object-cover, so there's no need for a crop tool — just
// keep files a sane size and let the admin's preview (identical object-cover
// rendering) confirm it looks right before publish.
const MAX_WIDTH = 2000;
const JPEG_QUALITY = 0.85;

export const resizeImageFile = (file, { maxWidth = MAX_WIDTH, quality = JPEG_QUALITY } = {}) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(objectUrl);
      const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
      resolve({
        dataUrl: canvas.toDataURL(outType, quality),
        width,
        height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("could not read image"));
    };
    img.src = objectUrl;
  });
