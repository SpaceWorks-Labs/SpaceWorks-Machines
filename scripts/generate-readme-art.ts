/**
 * Draws the README artwork in docs/readme/: the 1280×400 hero banner for light and dark mode. Run after
 * changing the brand masters or the banner copy, and commit the outputs:
 *
 *   npm run readme:art
 *
 * Laid out in HTML and rendered by headless Chromium (the Playwright browser the e2e tests install), so the
 * free Gilroy weights and the Unbounded variable font are embedded exactly as the app ships them. The lockup
 * is the unaltered master from public/brand/logo. sharp flattens and compresses the PNG. Adapted from
 * SpaceWorks-Events. (Node 22.18+ runs TypeScript directly; only erasable types are used.)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const out = (file: string) => path.join(root, "docs", "readme", file);
const fontFile = (file: string) => path.join(root, "public", "brand", "fonts", file);
const logoFile = (file: string) => path.join(root, "public", "brand", "logo", file);

const WIDTH = 1280;
const HEIGHT = 400;

/** The brand colours (SpaceWorks-Design tokens.json). */
const BRAND = { "deep-ink": "#142C2A", "maker-teal": "#006E63", "workshop-orange": "#FF7447", citron: "#DFFF8F", "sky-blue": "#B5CDFF", "warm-cream": "#FFF4E8" } as const;

type Theme = { file: string; field: string; ink: string; muted: string; rule: string; lockup: string; teal: string; line: string };
const THEMES: Theme[] = [
  { file: "banner.png", field: BRAND["warm-cream"], ink: BRAND["deep-ink"], muted: "#43544F", rule: "#C9CCC2", lockup: "lockup-horizontal.svg", teal: BRAND["maker-teal"], line: BRAND["deep-ink"] },
  // Dark mode uses only the brand's reversed pairings: Deep Ink field, Warm Cream text.
  { file: "banner-dark.png", field: BRAND["deep-ink"], ink: BRAND["warm-cream"], muted: "#D5D3CA", rule: "#4A5C58", lockup: "lockup-horizontal-reversed.svg", teal: "#579C90", line: BRAND["warm-cream"] },
];

async function dataUrl(file: string, type: string) {
  return `data:${type};base64,${(await readFile(file)).toString("base64")}`;
}

/** A flat, 1px-line printer: frame, gantry, nozzle and a part being printed, plus the brand shapes. */
function shapes(theme: Theme) {
  const stroke = `stroke="${theme.line}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const layers = Array.from({ length: 7 }, (_, index) => `<line x1="${1010 - index * 2}" y1="${300 - index * 9}" x2="${1090 + index * 2}" y2="${300 - index * 9}" ${stroke}/>`).join("");
  return `<svg class="shapes" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
    <circle cx="840" cy="440" r="140" fill="${BRAND.citron}"/>
    <path d="M${WIDTH} 170 A 230 230 0 0 0 ${WIDTH - 230} 400 L${WIDTH} 400 Z" fill="${theme.teal}"/>
    <rect x="940" y="70" width="220" height="250" rx="18" ${stroke}/>
    <line x1="940" y1="128" x2="1160" y2="128" ${stroke}/>
    <rect x="1030" y="118" width="40" height="22" rx="5" fill="${BRAND["sky-blue"]}" stroke="${theme.line}" stroke-width="1.5"/>
    <path d="M1042 140 L1058 140 L1050 156 Z" fill="${BRAND["workshop-orange"]}"/>
    ${layers}
    <line x1="960" y1="306" x2="1140" y2="306" ${stroke}/>
  </svg>`;
}

async function bannerHtml(theme: Theme) {
  const [light, extrabold, unbounded, lockup] = await Promise.all([
    dataUrl(fontFile("Gilroy-Light.woff2"), "font/woff2"), dataUrl(fontFile("Gilroy-ExtraBold.woff2"), "font/woff2"),
    dataUrl(fontFile("Unbounded-Variable.woff2"), "font/woff2"), dataUrl(logoFile(theme.lockup), "image/svg+xml"),
  ]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Gilroy; font-weight: 300; src: url(${light}) format("woff2"); }
    @font-face { font-family: Gilroy; font-weight: 800; src: url(${extrabold}) format("woff2"); }
    @font-face { font-family: Unbounded; font-weight: 200 900; src: url(${unbounded}) format("woff2"); }
    * { margin: 0; box-sizing: border-box; }
    html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: ${theme.field}; }
    body { position: relative; font-family: Gilroy; font-weight: 300; color: ${theme.ink}; font-synthesis: none; -webkit-font-smoothing: antialiased; }
    .brand { position: absolute; left: 72px; top: 56px; display: flex; align-items: center; }
    .brand img { width: 300px; height: 48px; display: block; }
    .brand .rule { width: 1.5px; height: 30px; background: ${theme.rule}; margin: 0 20px 0 24px; }
    .brand .product { font-weight: 800; font-size: 30px; line-height: 1; }
    .accent { position: absolute; left: 72px; top: 152px; font-family: Unbounded; font-weight: 500; font-size: 58px; line-height: 66px; letter-spacing: -0.01em; }
    .sub { position: absolute; left: 72px; top: 302px; font-size: 22px; line-height: 30px; color: ${theme.muted}; }
    svg.shapes { position: absolute; inset: 0; }
  </style></head><body>
    ${shapes(theme)}
    <div class="brand"><img src="${lockup}" alt=""><span class="rule"></span><span class="product">Machines</span></div>
    <p class="accent">Every machine.<br>Every job.</p>
    <p class="sub">Free, open-source machine management for makerspaces.</p>
  </body></html>`;
}

async function main() {
  await mkdir(out(""), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    for (const theme of THEMES) {
      await page.setContent(await bannerHtml(theme), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.screenshot({ type: "png" });
      const png = await sharp(shot).flatten({ background: theme.field }).png({ compressionLevel: 9, palette: true, colours: 128, dither: 0 }).toBuffer();
      await writeFile(out(theme.file), png);
      console.log("wrote", path.relative(root, out(theme.file)), `${png.length} bytes`);
    }
  } finally {
    await browser.close();
  }
}

await main();
