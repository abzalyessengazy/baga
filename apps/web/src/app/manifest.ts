import type { MetadataRoute } from "next";

/** Android "Add to Home Screen" and installed-app details: the BAĞA mark and the counter colour. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BAĞA",
    short_name: "BAĞA",
    start_url: "/",
    display: "browser",
    background_color: "#dde0e4",
    theme_color: "#5b47e0",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
