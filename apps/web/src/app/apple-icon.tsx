import { ImageResponse } from "next/og";
import { brandMarkUri } from "@/lib/brandMark";

// iPhone and iPad "Add to Home Screen": a square PNG; iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<img src={brandMarkUri(false)} width={180} height={180} alt="" />, size);
}
