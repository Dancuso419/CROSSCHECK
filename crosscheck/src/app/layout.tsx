import type { Metadata } from "next";
import { Bodoni_Moda, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Bodoni carries the display voice: a Didone is the letterform of the printed
// research page, high-contrast enough to hold a full-measure statement without
// shouting. Inter sets the reading copy. Mono is reserved for identifiers and
// measured figures — tool names, latencies, indicator values — never as costume.
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-bodoni",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crosscheck, a multi-source disagreement desk",
  description:
    "Queries five independent research Skills on one ticker and shows where they disagree and why it matters. Reports disagreement, never a verdict.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodoni.variable} ${inter.variable} ${mono.variable}`}>
      <body>
        {/* The direction contract must survive the production build, so it is emitted as
            a real HTML comment rather than a JSX one, which the compiler strips. */}
        <div
          hidden
          aria-hidden
          dangerouslySetInnerHTML={{
            __html: `<!--
          THESIS: A research page that reports disagreement and refuses to resolve it. It
          declines the crypto-dashboard arrangement - tiles, gauges, glowing deltas -
          because every one of those devices implies a direction.
          OWN-WORLD: Bone paper and warm near-black ink. Bodoni display over Inter copy,
          mono for measured figures. Full-measure hairlines do all the dividing; there are
          no cards and no nested containers. Near-monochrome on purpose: no traffic lights,
          since colour-ranked risk is itself a verdict. Rank is drawn, not coloured.
          STORY: The reader arrives holding two contradictory takes, reads which sources
          actually disagree and how much that matters, sees what each side needs to be
          true, and leaves with an observable to watch - not an answer.
          FIRST VIEWPORT: Masthead rule, wordmark left, read-only vow right. Beneath it the
          query line sitting on a hairline: ticker set in Bodoni, the three data modes as
          text, the action right-aligned. Then the count of reporting sources at display
          scale with the agreement state italic beneath it.
          FORM: Editorial research page. Direction pinned by the user's own reference image
          (VETT2), so no concept roll was dealt; rendered away from the cream-and-serif
          default by holding the palette to two inks and encoding rank in rule weight and
          drawn marks rather than colour.
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
        -->`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
