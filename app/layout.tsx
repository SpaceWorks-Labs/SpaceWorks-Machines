import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ChromeSwitch } from "@/components/chrome/ChromeSwitch";
import { COLOR_MODE_COOKIE, resolveColorMode } from "@/lib/colorMode";

export const metadata: Metadata = {
  title: {
    default: "Space Works Machines",
    template: "%s · Space Works Machines",
  },
  description: "Run your makerspace's machines: machine pages, jobs, the queue, payments and maintenance.",
  applicationName: "Space Works Machines",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  icons: {
    icon: [
      { url: "/brand/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/icons/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/brand/icons/icon-180.png",
  },
  openGraph: {
    siteName: "Space Works Machines",
    images: [{ url: "/brand/icons/og-1200x630.png", width: 1200, height: 630, alt: "Space Works" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/icons/og-1200x630.png"] },
};

export const viewport: Viewport = {
  // Browser chrome matches the canvas: Warm Cream. Dark mode is a per-person choice (no media query).
  themeColor: "#FFF4E8",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // A per-request CSP nonce will be injected by proxy.ts; waiting for the request lets Next.js
  // attach it to every framework script.
  await connection();
  const mode = resolveColorMode((await cookies()).get(COLOR_MODE_COOKIE)?.value);

  return (
    <html lang="en-GB" className={mode === "dark" ? "dark" : undefined} style={{ colorScheme: mode }} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <Providers initialColorMode={mode}>
          <ChromeSwitch>{children}</ChromeSwitch>
        </Providers>
      </body>
    </html>
  );
}
