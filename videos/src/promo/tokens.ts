import { loadFont } from "@remotion/google-fonts/Roboto";

// Brand tokens from app-market-listing/source/common.css (the listing slides) and the app icon.
export const color = {
  brand: "#0f5f4f",
  brandDeep: "#0a4a3d",
  mint: "#34d399",
  mintSoft: "#d1fae5",
  ink: "#111827",
  white: "#ffffff",
};

export const { fontFamily } = loadFont("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

// The listing slides' white UI cards: 24px radius at 2400px wide, soft deep shadow.
export const card = {
  radius: 22,
  shadow: "0 40px 90px rgba(4, 38, 31, 0.45), 0 8px 24px rgba(4, 38, 31, 0.25)",
};

// The UI's own transitions are short and un-bouncy; springs stay critically damped.
export const camera = { stiffness: 70, damping: 2 * Math.sqrt(70) };
export const glide = { stiffness: 120, damping: 2 * Math.sqrt(120) * 0.92 };
