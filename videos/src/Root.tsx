import { Composition } from "remotion";
import { Promo } from "./promo/Promo";
import { DURATION } from "./promo/cues";

export function Root() {
  return <Composition id="Promo" component={Promo} width={1920} height={1080} fps={60} durationInFrames={Math.round(DURATION * 60)} />;
}
