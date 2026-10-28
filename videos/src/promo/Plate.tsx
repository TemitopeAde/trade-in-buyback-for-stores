import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

import platesJson from "../../public/plates/plates.json";
import { track, type Key, type SpringConfig } from "../kit/spring";
import type { Rect } from "../kit/move";
import { card } from "./tokens";

/**
 * A plate is a 2x capture of the real app component (videos/scripts/plates.mjs). It is shown
 * through a crop window in its own CSS pixels, so the "camera" pans and zooms inside the UI.
 */
type PlateMeta = { size: [number, number]; rects: Record<string, [number, number, number, number]> };
export const plates = platesJson as unknown as Record<string, PlateMeta>;

/** x, y, width of the visible region in plate CSS px; the height follows the screen rect. */
export type Crop = { x: number; y: number; w: number };
export type CropKey = readonly [t: number, crop: Crop];

export function cropAt(t: number, keys: readonly CropKey[], config: SpringConfig): Crop {
  const along = (pick: (c: Crop) => number) => track(t, keys.map(([time, c]) => [time, pick(c)] as Key), config);
  return { x: along((c) => c.x), y: along((c) => c.y), w: along((c) => c.w) };
}

/** Where a plate CSS point lands on screen, for a plate shown at `rect` through `crop`. */
export function toScreen(rect: Rect, crop: Crop, x: number, y: number) {
  const s = rect.w / crop.w;
  return { x: rect.x + (x - crop.x) * s, y: rect.y + (y - crop.y) * s };
}

/** A point inside a measured element, on screen: `fx`/`fy` are shares of its box (0.5 = center). */
export function targetOf(plate: string, label: string, rect: Rect, crop: Crop, fx = 0.5, fy = 0.5) {
  const [x, y, w, h] = plates[plate].rects[label];
  return toScreen(rect, crop, x + w * fx, y + h * fy);
}

export function Plate({ name, rect, crop, style }: { name: string; rect: Rect; crop: Crop; style?: CSSProperties }) {
  const [w] = plates[name].size;
  const s = rect.w / crop.w;
  return (
    <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, overflow: "hidden", ...style }}>
      <Img src={staticFile(`plates/${name}.png`)} style={{ position: "absolute", left: -crop.x * s, top: -crop.y * s, width: w * s, maxWidth: "none" }} />
    </div>
  );
}

/** The white window every plate sits in (the listing slides' card). */
export function Window({ rect, children, style }: { rect: Rect; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: card.radius, overflow: "hidden", background: "#ffffff", boxShadow: card.shadow, ...style }}>
      <div style={{ position: "absolute", left: -rect.x, top: -rect.y }}>{children}</div>
    </div>
  );
}
