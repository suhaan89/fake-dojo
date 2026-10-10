import sharp from "sharp";
import { JPEG_QUALITY, MAX_INPUT_BYTES, planCrop, type PreparedImage } from "./crop";

/**
 * Node twin of the browser's prepare step, used by the scripts: apply EXIF orientation,
 * center-crop to the nearest supported aspect ratio, resize to a 1024 px long edge and
 * encode as JPEG. sharp drops all metadata (EXIF, GPS) unless told otherwise.
 */
export async function prepareBuffer(input: Buffer): Promise<PreparedImage> {
  if (input.length > MAX_INPUT_BYTES) throw new Error("Image is larger than 15 MB");
  // rotate() without arguments bakes the EXIF orientation into the pixels.
  const upright = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  const plan = planCrop(upright.info.width, upright.info.height);
  const jpeg = await sharp(upright.data)
    .extract({ left: plan.sx, top: plan.sy, width: plan.sw, height: plan.sh })
    .resize(plan.width, plan.height, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .jpeg({ quality: Math.round(JPEG_QUALITY * 100), chromaSubsampling: "4:2:0" })
    .toBuffer();
  return {
    data: jpeg.toString("base64"),
    mimeType: "image/jpeg",
    width: plan.width,
    height: plan.height,
    aspectRatio: plan.aspectRatio,
  };
}
