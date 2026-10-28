import { step } from "../kit/spring";
import { clamp01 } from "../kit/time";
import { color } from "./tokens";

/**
 * The app icon (app-market-listing/source/icon.html) without its square: the swap arrows draw
 * on, their heads land, then the price tag turns in. `t` is seconds since the draw started.
 */
export function Logo({ t, size }: { t: number; size: number }) {
  const draw = clamp01(t / 0.85);
  const ease = 1 - Math.pow(1 - draw, 3);
  const heads = step(t - 0.72, { stiffness: 260, damping: 26 });
  const tag = step(t - 0.55, { stiffness: 140, damping: 18 });
  return (
    <svg width={size} height={size} viewBox="0 0 1000 1000" style={{ display: "block", overflow: "visible", rotate: `${(1 - ease) * -120}deg` }}>
      <g fill="none" stroke={color.white} strokeWidth={64} strokeLinecap="butt">
        <path d="M 227.5 400.8 A 290 290 0 0 1 772.5 400.8" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ease} />
        <path d="M 772.5 599.2 A 290 290 0 0 1 227.5 599.2" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ease} />
      </g>
      <g fill={color.white} opacity={clamp01(heads * 4)}>
        <polygon points="838,376 707,424 801,486" style={{ scale: String(heads), transformOrigin: "772px 410px" }} />
        <polygon points="162,624 293,576 199,514" style={{ scale: String(heads), transformOrigin: "228px 590px" }} />
      </g>
      <g style={{ scale: String(tag), rotate: `${(1 - tag) * 60}deg`, transformOrigin: "500px 500px" }} opacity={clamp01(tag * 3)}>
        <g transform="translate(-25 27) rotate(-45 500 500)">
          <path d="M 372 500 L 440 418 L 628 418 Q 640 418 640 430 L 640 570 Q 640 582 628 582 L 440 582 Z" fill={color.mint} stroke={color.mint} strokeWidth={22} strokeLinejoin="round" />
          <circle cx={456} cy={500} r={22} fill={color.brand} />
        </g>
      </g>
    </svg>
  );
}
