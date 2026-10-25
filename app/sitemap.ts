import type { MetadataRoute } from "next";
import { loadSitemapSpaces } from "@/lib/views/app__sitemap";

// Reads listed spaces at request time, so the build never needs a database.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const now = new Date();
  const fixed = ["/", "/spaces", "/privacy", "/terms"].map((path) => ({ url: `${baseUrl}${path}`, lastModified: now }));
  const spaces = await loadSitemapSpaces();
  return [...fixed, ...spaces.map((space) => ({ url: `${baseUrl}/s/${space.slug}`, lastModified: space.updatedAt }))];
}
