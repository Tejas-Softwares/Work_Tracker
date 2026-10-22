import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tejas Work Tracker",
    short_name: "Work Tracker",
    description: "Tasks, roles and reviews for the Tejas Group office.",
    start_url: "/my",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#23305a",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
