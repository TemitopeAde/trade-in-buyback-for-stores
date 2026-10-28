import { AbsoluteFill, Easing } from "remotion";

import { cursorAt, UserCursor, type CursorKey } from "../kit/cursor";
import { move, type Rect } from "../kit/move";
import { Punchlines, type Card } from "../kit/punchlines";
import { step, track } from "../kit/spring";
import { clamp01, useTime } from "../kit/time";
import { acts } from "./cues";
import { Logo } from "./Logo";
import { cropAt, Plate, targetOf, toScreen, Window, type Crop } from "./Plate";
import { camera, color, fontFamily, glide } from "./tokens";

const land = Easing.bezier(0.22, 1, 0.36, 1);

/** Enter (rise and fade) at `start`, leave (fade and blur) just before `end`. */
function presence(t: number, start: number, end: number, rise = 48) {
  const enter = land(clamp01((t - start) / 0.45));
  const leave = clamp01((t - (end - 0.25)) / 0.25);
  return {
    visible: t >= start && t <= end,
    style: { opacity: enter * (1 - leave), translate: `0 ${(1 - enter) * rise}px`, filter: leave > 0 ? `blur(${leave * 12}px)` : undefined },
  };
}

/** A plate state that replaces the previous one when the UI reacts (a click): a 0.12 s cross-fade. */
const after = (t: number, at: number) => clamp01((t - at) / 0.12);

// ---- Layout (screen px). The main window keeps the 1.625 aspect of every crop below. ----------
const D: Rect = { x: 210, y: 78, w: 1500, h: 923 };
const FULL_CTA: Crop = { x: 0, y: 0, w: 1020 };
const CTA_ZOOM: Crop = { x: 340, y: 92, w: 680 }; // title through "Up to $90.00"
const FULL_FORM: Crop = { x: 0, y: 0, w: 1020 };
const QUESTIONS: Crop = { x: 170, y: 492, w: 680 };
const ESTIMATE: Crop = { x: 210, y: 652, w: 600 };
const ESTIMATE_CARD = { x: 219, y: 767, w: 581, h: 140 }; // form-all.png, measured off the 2x plate
const FULL_DASH: Crop = { x: 0, y: 0, w: 1180 };
const DASH_PHOTOS: Crop = { x: 0, y: 274, w: 1180 };
const DASH_ACTIONS: Crop = { x: 560, y: 100, w: 620 };
const DASH_BADGE: Crop = { x: 700, y: 50, w: 480 };
const BREAKDOWN_CARD = { x: 268, y: 479, w: 523 }; // dash-detail.png, measured off the 2x plate
const OVERVIEW_CREDIT: Crop = { x: 700, y: 400, w: 480 };
const PHONE: Rect = { x: 745, y: 75, w: 430, h: 930 };
const DESIGN_FORM: Rect = { x: 170, y: 207, w: 1080, h: 665 };
const DESIGN_PANEL: Rect = { x: 1390, y: 84, w: 360, h: 912 };
const PANEL_CROP: Crop = { x: 0, y: 0, w: 300 };
const PRESET_DROPDOWN = { x: 259, y: 156 }; // panel-*.png, the "Preset theme" select's chevron

// ---- Cursor: one pass per scene, each click lands on a measured element. ---------------------
// Each click lands beside the label (a radio, a button's free end, a chevron), never on its words.
const ctaClick = targetOf("cta", "Trade in", D, CTA_ZOOM, 0.72, 0.55);
const yesClick = targetOf("form-none", "Yes, fully working", D, QUESTIONS, 0.11, 0.55);
const lightClick = targetOf("form-works", "Light wear", D, QUESTIONS, 0.11, 0.55);
const confirmClick = targetOf("dash-detail", "Confirm value & issue credit", D, DASH_ACTIONS, 0.93, 0.6);
const presetClick = toScreen(DESIGN_PANEL, PANEL_CROP, PRESET_DROPDOWN.x, PRESET_DROPDOWN.y);

const cursorPasses: { from: number; to: number; keys: CursorKey[] }[] = [
  { from: 6.5, to: 9.4, keys: [{ t: 6.5, x: 1760, y: 1060 }, { t: 8.0, ...ctaClick, click: true }, { t: 9.4, x: 1560, y: 980 }] },
  { from: 10.9, to: 13.3, keys: [{ t: 10.9, x: 1720, y: 1040 }, { t: 11.6, ...yesClick, click: true }, { t: 12.6, ...lightClick, click: true }, { t: 13.3, x: 1500, y: 1000 }] },
  { from: 17.6, to: 19.6, keys: [{ t: 17.6, x: 1760, y: 1060 }, { t: 18.8, ...confirmClick, click: true }, { t: 19.6, x: 1640, y: 980 }] },
  { from: 27.2, to: 29.4, keys: [{ t: 27.2, x: 1500, y: 1060 }, { t: 28.1, ...presetClick, click: true }, { t: 29.4, x: 1640, y: 900 }] },
];

function Cursor({ t }: { t: number }) {
  const pass = cursorPasses.find((p) => t >= p.from && t <= p.to);
  if (!pass) return null;
  const { x, y, squash } = cursorAt(t, pass.keys, (px, py) => ({ x: px, y: py }));
  const opacity = clamp01((t - pass.from) / 0.2) * (1 - clamp01((t - (pass.to - 0.2)) / 0.2));
  return (
    <div style={{ position: "absolute", inset: 0, opacity, scale: "1.5", transformOrigin: `${x}px ${y}px` }}>
      <UserCursor x={x} y={y} squash={squash} />
    </div>
  );
}

// ---- Lockup: icon, wordmark, teaser. Opens the film and closes it. ----------------------------
// Measured in review stills: icon left edge to wordmark right edge spans 1076px, centered here.
const ICON_END = { size: 210, cx: 527, cy: 470 };
const TEXT_LEFT = 684;

function Lockup({ t, drawAt, moveAt, wordsAt, teaserAt }: { t: number; drawAt: number; moveAt?: number; wordsAt: number; teaserAt: number }) {
  const m = moveAt === undefined ? 1 : step(t - moveAt, glide);
  const size = 340 + (ICON_END.size - 340) * m;
  const cx = 960 + (ICON_END.cx - 960) * m;
  const cy = 520 + (ICON_END.cy - 520) * m;
  const teaser = land(clamp01((t - teaserAt) / 0.45));
  return (
    <>
      <div style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2 }}>
        <Logo t={t - drawAt} size={size} />
      </div>
      <div style={{ position: "absolute", left: TEXT_LEFT, top: ICON_END.cy, translate: "0 -52%", display: "flex", gap: "0.24em", fontFamily, fontWeight: 700, fontSize: 128, letterSpacing: "-0.02em", color: color.white, whiteSpace: "nowrap" }}>
        {["Trade", "In", "Credit"].map((word, i) => {
          const u = land(clamp01((t - (wordsAt + i * 0.18)) / 0.32));
          return <span key={word} style={{ opacity: u, translate: `0 ${(1 - u) * 30}px`, filter: u < 1 ? `blur(${(1 - u) * 14}px)` : undefined }}>{word}</span>;
        })}
      </div>
      <div style={{ position: "absolute", left: TEXT_LEFT + 6, top: 572, fontFamily, fontSize: 46, color: color.mintSoft, opacity: teaser, translate: `0 ${(1 - teaser) * 20}px`, whiteSpace: "nowrap" }}>
        Take trade-ins and pay customers in store credit.
      </div>
    </>
  );
}

// ---- Punchlines ------------------------------------------------------------------------------
const punchTheme = { font: fontFamily, color: color.white, accent: color.mint, weight: 700 };
const punchCards: Card[] = [
  {
    lines: [
      [{ text: "Old", at: 4.0 }, { text: "gear", at: 4.22 }, { text: "in.", at: 4.44 }],
      [{ text: "Store", at: 4.95, accent: true }, { text: "credit", at: 5.15, accent: true }, { text: "out.", at: 5.37 }],
    ],
    out: 5.78, y: 540, size: 140,
  },
  {
    lines: [
      [{ text: "Paid", at: 21.0 }, { text: "as", at: 21.18 }, { text: "store", at: 21.36, accent: true }, { text: "credit.", at: 21.54, accent: true }],
      [{ text: "Issued", at: 22.0 }, { text: "with", at: 22.15 }, { text: "Wix", at: 22.3 }, { text: "Gift", at: 22.42 }, { text: "Cards.", at: 22.54 }],
    ],
    out: 22.78, y: 540, size: 112,
  },
];

// ---- The film --------------------------------------------------------------------------------
export function Promo() {
  const t = useTime();

  const logo = presence(t, acts.logo[0], acts.logo[1], 0);
  const cta = presence(t, acts.cta[0], acts.cta[1]);
  const form = presence(t, acts.form[0], acts.form[1] + 0.2);
  const dashIn = clamp01((t - 15.25) / 0.35);
  const dash = presence(t, acts.dash[0], acts.dash[1]);
  const phone = presence(t, acts.phone[0], acts.phone[1], 160);
  const design = presence(t, acts.design[0], acts.design[1]);
  const designPanel = presence(t, acts.design[0] + 0.12, acts.design[1]);
  const proof = presence(t, acts.proof[0], acts.proof[1]);
  const end = presence(t, acts.end[0], acts.end[1] + 1, 0);

  const ctaCrop = cropAt(t, [[0, FULL_CTA], [7.0, CTA_ZOOM], [8.15, FULL_CTA]], camera);
  const formCrop = cropAt(t, [[0, FULL_FORM], [10.6, QUESTIONS], [13.2, ESTIMATE]], camera);
  const dashCrop = cropAt(t, [[0, FULL_DASH], [16.3, DASH_PHOTOS], [17.4, DASH_ACTIONS], [19.2, DASH_BADGE]], camera);
  const proofCrop = cropAt(t, [[0, FULL_DASH], [32.2, OVERVIEW_CREDIT]], camera);

  // Magic move: the live estimate card leaves the form and lands where the dashboard shows it.
  const source = toScreen(D, ESTIMATE, ESTIMATE_CARD.x, ESTIMATE_CARD.y);
  const sourceRect: Rect = { ...source, w: ESTIMATE_CARD.w * (D.w / ESTIMATE.w), h: ESTIMATE_CARD.h * (D.w / ESTIMATE.w) };
  const dest = toScreen(D, FULL_DASH, BREAKDOWN_CARD.x, BREAKDOWN_CARD.y);
  const destW = BREAKDOWN_CARD.w * (D.w / FULL_DASH.w);
  const destRect: Rect = { ...dest, w: destW, h: destW * (ESTIMATE_CARD.h / ESTIMATE_CARD.w) };
  const travel = move(t, 14.65, sourceRect, destRect, glide);
  const travelerOpacity = t < 14.6 || t > 15.95 ? 0 : 1 - clamp01((t - 15.6) / 0.3);

  const phoneZoom = track(t, [[0, 1], [24.3, 1.24]], camera);
  const wipe = land(clamp01((t - 28.3) / 0.6));

  return (
    <AbsoluteFill style={{ background: color.brand, fontFamily }}>
      {logo.visible && (
        <AbsoluteFill style={logo.style}>
          <Lockup t={t} drawAt={0.25} moveAt={1.55} wordsAt={2.0} teaserAt={2.6} />
        </AbsoluteFill>
      )}

      {cta.visible && (
        <AbsoluteFill style={cta.style}>
          <Window rect={D}>
            <Plate name="cta" rect={D} crop={ctaCrop} />
            <Plate name="cta-open" rect={D} crop={ctaCrop} style={{ opacity: after(t, 8.1) }} />
          </Window>
        </AbsoluteFill>
      )}

      {form.visible && (
        <AbsoluteFill style={{ ...form.style, opacity: Number(form.style.opacity) * (1 - clamp01((t - 14.6) / 0.2)) }}>
          <Window rect={D}>
            <Plate name="form-none" rect={D} crop={formCrop} />
            <Plate name="form-works" rect={D} crop={formCrop} style={{ opacity: after(t, 11.62) }} />
            <Plate name="form-all" rect={D} crop={formCrop} style={{ opacity: after(t, 12.62) }} />
          </Window>
        </AbsoluteFill>
      )}

      {dash.visible && dashIn > 0 && (
        <AbsoluteFill style={{ ...dash.style, opacity: Number(dash.style.opacity) * dashIn, scale: String(0.97 + 0.03 * land(dashIn)) }}>
          <Window rect={D}>
            <Plate name="dash-detail" rect={D} crop={dashCrop} />
            <Plate name="dash-credit" rect={D} crop={dashCrop} style={{ opacity: after(t, 18.85) }} />
          </Window>
        </AbsoluteFill>
      )}

      {travelerOpacity > 0 && (
        <Window rect={travel} style={{ opacity: travelerOpacity, borderRadius: 14 }}>
          <Plate name="form-all" rect={travel} crop={ESTIMATE_CARD} />
        </Window>
      )}

      {phone.visible && (
        <AbsoluteFill style={phone.style}>
          <div style={{ position: "absolute", left: PHONE.x - 14, top: PHONE.y - 14, width: PHONE.w + 28, height: PHONE.h + 28, borderRadius: 64, background: color.ink, boxShadow: "0 40px 90px rgba(4, 38, 31, 0.45)", scale: String(phoneZoom), transformOrigin: "50% 48%" }}>
            <div style={{ position: "absolute", left: 14, top: 14, width: PHONE.w, height: PHONE.h, borderRadius: 50, overflow: "hidden", background: "#ffffff" }}>
              <Plate name="status-credit" rect={{ ...PHONE, x: 0, y: 0 }} crop={{ x: 0, y: 0, w: 390 }} />
            </div>
          </div>
        </AbsoluteFill>
      )}

      {design.visible && (
        <AbsoluteFill>
          <div style={{ position: "absolute", inset: 0, ...design.style }}>
            <Window rect={DESIGN_FORM}>
              <Plate name="form-all" rect={DESIGN_FORM} crop={QUESTIONS} />
              <Plate name="form-brand" rect={DESIGN_FORM} crop={QUESTIONS} style={{ clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }} />
            </Window>
          </div>
          <div style={{ position: "absolute", inset: 0, ...designPanel.style }}>
            <Window rect={DESIGN_PANEL} style={{ borderRadius: 18 }}>
              <Plate name="panel-light" rect={DESIGN_PANEL} crop={PANEL_CROP} />
              <Plate name="panel-brand" rect={DESIGN_PANEL} crop={PANEL_CROP} style={{ clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }} />
            </Window>
          </div>
        </AbsoluteFill>
      )}

      {proof.visible && (
        <AbsoluteFill style={proof.style}>
          <Window rect={D}>
            <Plate name="dash-overview" rect={D} crop={proofCrop} />
          </Window>
          <div style={{ position: "absolute", left: 0, right: 0, top: 1022, textAlign: "center", fontSize: 24, color: color.mintSoft, opacity: 0.8 }}>Sample store data</div>
        </AbsoluteFill>
      )}

      {end.visible && (
        <AbsoluteFill style={end.style}>
          <Lockup t={t} drawAt={34.6} wordsAt={35.2} teaserAt={35.8} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 850, textAlign: "center", fontSize: 34, color: color.white, opacity: land(clamp01((t - 36.6) / 0.45)) * 0.85 }}>
            Requires Wix Stores · Credit issued with Wix Gift Cards
          </div>
        </AbsoluteFill>
      )}

      <Punchlines t={t} cards={punchCards} theme={punchTheme} />
      <Cursor t={t} />
    </AbsoluteFill>
  );
}
