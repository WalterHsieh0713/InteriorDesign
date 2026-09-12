/**
 * Wall posters.
 *
 * Artwork is drawn here rather than shipped as image files, for two reasons:
 * a poster of a real car, athlete or comic character is someone else's
 * copyright and this app publishes rooms to a public feed; and generated art
 * scales to any frame size without a separate asset per size.
 *
 * Posters carry a `custom` binding rather than a `catalog` one — they are not
 * a product with a price and a buy link, and inventing one would put a fake
 * number into the feed's budget totals.
 */

export type PosterArt = "car" | "portrait" | "comic" | "athlete";

export type PosterSize = {
  id: string;
  label: string;
  /** Printed size in metres, width x height. */
  width: number;
  height: number;
};

/** Frame depth is the same whatever the print size — it is the moulding, not the art. */
export const FRAME_DEPTH = 0.03;

export const POSTER_SIZES: PosterSize[] = [
  { id: "a3", label: 'A3 · 12×17"', width: 0.297, height: 0.42 },
  { id: "a2", label: 'A2 · 17×23"', width: 0.42, height: 0.594 },
  { id: "a1", label: 'A1 · 23×33"', width: 0.594, height: 0.841 },
  { id: "sq", label: 'Square · 20×20"', width: 0.5, height: 0.5 },
];

export const POSTER_ART: { id: PosterArt; label: string }[] = [
  { id: "car", label: "Car" },
  { id: "portrait", label: "Portrait" },
  { id: "comic", label: "Comic" },
  { id: "athlete", label: "Athlete" },
];

type Palette = { bg: string; ink: string; accent: string; soft: string };

const PALETTES: Record<PosterArt, Palette> = {
  car: { bg: "#101418", ink: "#F2F4F7", accent: "#E2483D", soft: "#2A3340" },
  portrait: { bg: "#F3EDE4", ink: "#20242B", accent: "#C2654A", soft: "#D6C9B6" },
  comic: { bg: "#FDF6E3", ink: "#16181D", accent: "#3E6DC4", soft: "#F2C94C" },
  athlete: { bg: "#16351F", ink: "#F4F7F2", accent: "#E8C547", soft: "#27502F" },
};

/**
 * Renders one poster's artwork to a canvas.
 *
 * Exported so both the 3D mesh and the catalog panel's thumbnail draw from the
 * same source — a preview that does not match what lands on the wall is worse
 * than no preview.
 */
export function drawPoster(
  art: PosterArt,
  aspect: number,
  pixels = 512
): HTMLCanvasElement {
  const w = pixels;
  const h = Math.round(pixels / aspect);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return c;
  const p = PALETTES[art];

  g.fillStyle = p.bg;
  g.fillRect(0, 0, w, h);

  if (art === "car") {
    // Low, wide silhouette over a sun-and-horizon band.
    g.fillStyle = p.accent;
    g.beginPath();
    g.arc(w * 0.5, h * 0.42, w * 0.26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.soft;
    for (let i = 0; i < 5; i++) g.fillRect(0, h * (0.44 + i * 0.035), w, h * 0.012);
    g.fillStyle = p.ink;
    g.beginPath();
    const y = h * 0.6;
    g.moveTo(w * 0.12, y);
    g.lineTo(w * 0.26, y - h * 0.055);
    g.lineTo(w * 0.4, y - h * 0.095);
    g.lineTo(w * 0.62, y - h * 0.1);
    g.lineTo(w * 0.8, y - h * 0.05);
    g.lineTo(w * 0.88, y);
    g.closePath();
    g.fill();
    g.fillStyle = p.bg;
    for (const cx of [0.3, 0.72]) {
      g.beginPath();
      g.arc(w * cx, y, w * 0.045, 0, Math.PI * 2);
      g.fill();
    }
    band(g, w, h, p, "OVERDRIVE");
  } else if (art === "portrait") {
    // Cut-paper face: circle, offset jaw, single accent shape.
    g.fillStyle = p.soft;
    g.fillRect(w * 0.12, h * 0.1, w * 0.76, h * 0.62);
    g.fillStyle = p.ink;
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.42, w * 0.2, h * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.accent;
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.25);
    g.lineTo(w * 0.72, h * 0.42);
    g.lineTo(w * 0.5, h * 0.59);
    g.closePath();
    g.fill();
    g.fillStyle = p.ink;
    g.fillRect(w * 0.3, h * 0.66, w * 0.4, h * 0.012);
    band(g, w, h, p, "STUDY NO. 4");
  } else if (art === "comic") {
    // Panel grid with halftone and a speech bar.
    const pads = w * 0.06;
    const cells = [
      [0.0, 0.0, 0.62, 0.42],
      [0.64, 0.0, 0.36, 0.42],
      [0.0, 0.44, 0.36, 0.34],
      [0.38, 0.44, 0.62, 0.34],
    ];
    for (const [cx, cy, cw, ch] of cells) {
      const x = pads + cx * (w - pads * 2);
      const yy = pads + cy * (h * 0.78 - pads);
      const ww = cw * (w - pads * 2);
      const hh = ch * (h * 0.78 - pads);
      g.fillStyle = p.soft;
      g.fillRect(x, yy, ww, hh);
      g.fillStyle = p.accent;
      for (let i = 0; i * 9 < ww; i++)
        for (let j = 0; j * 9 < hh; j++) {
          if ((i + j) % 3) continue;
          g.beginPath();
          g.arc(x + i * 9 + 4, yy + j * 9 + 4, 1.9, 0, Math.PI * 2);
          g.fill();
        }
      g.strokeStyle = p.ink;
      g.lineWidth = Math.max(2, w * 0.008);
      g.strokeRect(x, yy, ww, hh);
    }
    band(g, w, h, p, "ISSUE #1");
  } else {
    // Sprinting figure, stadium number behind.
    g.fillStyle = p.soft;
    g.font = `700 ${h * 0.46}px Geist, system-ui, sans-serif`;
    g.textAlign = "center";
    g.fillText("09", w * 0.5, h * 0.52);
    g.fillStyle = p.accent;
    g.fillRect(0, h * 0.63, w, h * 0.01);
    g.fillStyle = p.ink;
    const fx = w * 0.5;
    const fy = h * 0.6;
    g.beginPath();
    g.arc(fx + w * 0.03, fy - h * 0.24, w * 0.045, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = w * 0.05;
    g.strokeStyle = p.ink;
    g.lineCap = "round";
    line(g, fx + w * 0.02, fy - h * 0.19, fx - w * 0.03, fy - h * 0.07);
    line(g, fx - w * 0.03, fy - h * 0.07, fx - w * 0.14, fy);
    line(g, fx - w * 0.03, fy - h * 0.07, fx + w * 0.13, fy - h * 0.01);
    line(g, fx + w * 0.01, fy - h * 0.17, fx + w * 0.16, fy - h * 0.21);
    line(g, fx + w * 0.01, fy - h * 0.16, fx - w * 0.14, fy - h * 0.2);
    band(g, w, h, p, "FINALS");
  }

  return c;
}

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

/** The title bar every poster carries, so all four read as one series. */
function band(g: CanvasRenderingContext2D, w: number, h: number, p: Palette, text: string) {
  g.fillStyle = p.ink;
  g.fillRect(0, h * 0.82, w, h * 0.18);
  g.fillStyle = p.bg;
  g.font = `600 ${h * 0.055}px Geist, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = `${w * 0.012}px`;
  g.fillText(text, w * 0.5, h * 0.91);
  g.letterSpacing = "0px";
}

export function posterLabel(art: PosterArt, size: PosterSize): string {
  const name = POSTER_ART.find((a) => a.id === art)?.label ?? art;
  return `${name} poster · ${size.label.split(" · ")[0]}`;
}
