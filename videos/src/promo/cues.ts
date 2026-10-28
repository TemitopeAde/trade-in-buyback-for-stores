// The beat sheet as data. Silent film on a fixed 120 bpm grid: one bar = 2 s.
import { at, type Grid } from "../kit/time";

export const grid: Grid = { bpm: 120, firstBeat: 0, pickupBeats: 0, beatsPerBar: 4 };
export const b = (bar: number, beat = 1, fraction = 0) => at(grid, bar, beat, fraction);

export const DURATION = b(21); // 40 s

export const acts = {
  logo: [b(1), b(3)], // 0 – 4: the icon draws itself, wordmark and teaser
  punch1: [b(3), b(4)], // 4 – 6: "Old gear in. Store credit out."
  cta: [b(4), b(6)], // 6 – 10: product page button, cursor taps "Trade in"
  form: [b(6), b(8, 3, 0.2)], // 10 – 14.6: condition answers drive the live estimate
  dash: [b(8, 3, 0.2), b(11, 3)], // 14.6 – 21: estimate travels into the dashboard; merchant confirms
  punch2: [b(11, 3), b(12, 3)], // 21 – 23: "Paid as store credit."
  phone: [b(12, 3), b(14, 2)], // 23 – 26.5: customer's status page shows the credit
  design: [b(14, 2), b(16, 3)], // 26.5 – 31: Editor theme preset restyles the form
  proof: [b(16, 3), b(18, 2)], // 31 – 34.5: dashboard overview, credit issued
  end: [b(18, 2), DURATION], // 34.5 – 40: lockup
} as const;
