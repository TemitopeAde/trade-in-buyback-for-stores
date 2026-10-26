import { useCallback, useEffect, useRef, useState } from 'react';
import { elements, widget } from '@wix/editor';
import {
  fontsToPreload,
  parseStyleConfig,
  serializeStyleConfig,
  STYLE_PROP,
  type TradeInWidgetStyle,
  type WidgetKind,
} from '../../lib/style/style-config';

// Binds the settings panel to the selected widget's persisted `style-config` property.
// The widget property — not React state — is the source of truth: we read it on open and on
// selection change, and apply edits locally for instant feedback.
//
// Writes are coalesced rather than timer-debounced: each edit is sent right away, and while a
// write is in flight only the latest value is queued (so slider drags don't flood setProp and
// the final value is never lost). A timer would be unsafe here — a delayed write that fires
// after the merchant selects another widget would land on that other instance. On selection
// change, anything not yet sent is discarded via a generation counter.

export type StylePropState = {
  style?: TradeInWidgetStyle;
  saveError: boolean;
  update: (updater: (current: TradeInWidgetStyle) => TradeInWidgetStyle) => void;
  replace: (next: TradeInWidgetStyle) => void;
};

export function useWidgetStyleProp(kind: WidgetKind): StylePropState {
  const [style, setStyle] = useState<TradeInWidgetStyle>();
  const [saveError, setSaveError] = useState(false);
  const latest = useRef<TradeInWidgetStyle>();
  const inFlight = useRef(false);
  const queued = useRef(false);
  const generation = useRef(0);
  const lastFonts = useRef('');

  const write = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    const gen = generation.current;
    try {
      do {
        queued.current = false;
        const value = latest.current;
        if (!value || gen !== generation.current) break;
        await widget.setProp(STYLE_PROP, serializeStyleConfig(value, kind));
        const fonts = fontsToPreload(value);
        const key = fonts.join('|');
        // setPreloadFonts overwrites the whole list, so always pass every font in use.
        if (key !== lastFonts.current) {
          lastFonts.current = key;
          await widget.setPreloadFonts(fonts);
        }
      } while (queued.current);
      setSaveError(false);
    } catch {
      setSaveError(true);
    } finally {
      inFlight.current = false;
    }
  }, [kind]);

  const load = useCallback(async () => {
    try {
      const parsed = parseStyleConfig(await widget.getProp(STYLE_PROP), kind);
      latest.current = parsed;
      lastFonts.current = fontsToPreload(parsed).join('|');
      setStyle(parsed);
    } catch {
      // Unreadable props fall back to defaults; the first edit persists a valid config.
      const parsed = parseStyleConfig(null, kind);
      latest.current = parsed;
      setStyle(parsed);
    }
  }, [kind]);

  useEffect(() => {
    void load();
    // If the merchant selects another instance while the panel stays open, drop unsent edits
    // (they belong to the previous instance) and load the newly selected instance's config.
    elements.onSelectionChange(() => {
      generation.current++;
      queued.current = false;
      void load();
    }).catch(() => undefined);
  }, [load]);

  const replace = useCallback((next: TradeInWidgetStyle) => {
    latest.current = next;
    setStyle(next);
    void write();
  }, [write]);

  const update = useCallback((updater: (current: TradeInWidgetStyle) => TradeInWidgetStyle) => {
    if (!latest.current) return;
    // Re-validate after every edit so out-of-range or malformed values never persist.
    replace(parseStyleConfig(JSON.stringify(updater(latest.current)), kind));
  }, [kind, replace]);

  return { style, saveError, update, replace };
}
