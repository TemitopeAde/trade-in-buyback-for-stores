// Simulated Editor host for the settings panel: the selected widget's style-config prop
// comes from window.__styleConfig (set by the scene).
declare global { interface Window { __styleConfig?: string } }

export const widget = {
  getProp: async () => window.__styleConfig ?? '',
  setProp: async () => undefined,
  setPreloadFonts: async () => undefined,
};
export const elements = { onSelectionChange: async () => undefined };
export const info = { getLanguageCode: async () => 'en' };
export const inputs = { selectColor: async () => undefined, selectFont: async () => undefined };
export const application = {};
