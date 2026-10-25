import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id so the installed app keeps its identity across hosts (e.g. a dev tunnel).
    id: "/",
    name: "Space Works Machines",
    short_name: "SW Machines",
    description: "Run your makerspace's machines: machine pages, jobs, the queue, payments and maintenance.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#FFF4E8",
    theme_color: "#006E63",
    // Space Works app icons, copied unaltered from SpaceWorks-Design (npm run design:sync).
    icons: [
      { src: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
