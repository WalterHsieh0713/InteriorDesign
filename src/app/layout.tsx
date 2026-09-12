import type { Metadata } from "next";
import { Familjen_Grotesk, Hanken_Grotesk, DM_Mono } from "next/font/google";
import "./globals.css";

/**
 * Type for the whole app, loaded once at the root.
 *
 * These used to be declared per-area: Geist here, Archivo and IBM Plex Mono
 * again inside the social shell. That is why the scanner and the feed read
 * as two different products. One set at the root instead:
 *
 *   display  Familjen Grotesk, for titles. A modern grotesk with enough
 *            character to carry a headline once it is tracked in tight.
 *   ui       Hanken Grotesk, for everything you read. Warm and quiet.
 *   mono     DM Mono, reserved for measurements. Rooms are the one thing
 *            this product knows for certain, so the numbers get their own
 *            voice rather than being set as ordinary text.
 */

const display = Familjen_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const ui = Hanken_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const mono = DM_Mono({
  variable: "--font-mono-rs",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Room Scanner",
  description: "Scan your room, get an editable 3D layout, and see what fits.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${ui.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
