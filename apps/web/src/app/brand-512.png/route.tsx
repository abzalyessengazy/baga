import { ImageResponse } from "next/og";
import { brandMarkUri } from "@/lib/brandMark";

/** The full mark at 512 px for the web app manifest (Android home screen). Static, built once. */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<img src={brandMarkUri(true)} width={512} height={512} alt="" />, { width: 512, height: 512 });
}
