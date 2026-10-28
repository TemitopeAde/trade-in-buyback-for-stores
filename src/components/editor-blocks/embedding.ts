import { createContext, useContext } from 'react';

// Set by each Editor React component's preview entry from useIsEditMode(), so the embedded
// widget shows its sample preview (and makes no backend calls) while the site owner designs.
export const DesignModeContext = createContext(false);

export function useDesignMode(): boolean {
  return useContext(DesignModeContext);
}

// The editor sizes the component, so the embedded widget fills it and lines up with the
// component's own header instead of centring itself at the custom element's max width.
export const EMBEDDED_STYLE_CONFIG = JSON.stringify({ version: 1, layout: { maxWidth: 1200, alignment: 'start' } });
