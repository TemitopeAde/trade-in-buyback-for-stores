// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStyleConfig, serializeStyleConfig, themeDefaults } from '../../src/lib/style/style-config';

// Simulated Editor: each "instance" has its own props, like separate widget instances on a page.
const instances: Record<string, Record<string, string>> = {};
let selected = 'a';
let selectionCb: (() => void) | undefined;
const setProp = vi.fn(async (name: string, value: string) => {
  instances[selected][name] = value;
});
const setPreloadFonts = vi.fn(async (_fonts: string[]) => undefined);
let colorPick: string | undefined;

vi.mock('@wix/editor', () => ({
  widget: {
    getProp: async (name: string) => instances[selected][name] ?? '',
    setProp: (n: string, v: string) => setProp(n, v),
    setPreloadFonts: (f: string[]) => setPreloadFonts(f),
  },
  elements: { onSelectionChange: async (cb: () => void) => { selectionCb = cb; } },
  info: { getLanguageCode: async () => 'en' },
  inputs: {
    selectColor: (_v: string, opts: { onChange: (v: string) => void }) => { if (colorPick) opts.onChange(colorPick); return Promise.resolve(colorPick); },
    selectFont: (_v: unknown, opts: { onChange: (v: { font: string }) => void }) => { opts.onChange({ font: 'normal normal 400 16px/1.4em avenir-lt-w01_35-light1475496,sans-serif' }); return Promise.resolve(); },
  },
}));

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const { TradeInWidgetSettingsPanel } = await import('../../src/components/editor/TradeInWidgetSettingsPanel');

const saved = (id = selected) => parseStyleConfig(instances[id]['style-config']);
const flushDebounce = () => act(async () => { await vi.advanceTimersByTimeAsync(400); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const custom = { ...themeDefaults('dark'), content: { ...themeDefaults().content, title: 'Instance A' } };
  instances.a = { 'style-config': serializeStyleConfig(custom, 'form') };
  instances.b = { 'style-config': serializeStyleConfig(themeDefaults('minimal'), 'form') };
  selected = 'a';
  colorPick = undefined;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const renderPanel = () => render(<TradeInWidgetSettingsPanel kind="form" defaults={{ title: 'form.title' }} />);

async function openSection(name: string) {
  fireEvent.click(await screen.findByText(name));
}

describe('TradeInWidgetSettingsPanel', () => {
  it('initializes from the saved widget properties', async () => {
    renderPanel();
    await openSection('Content & visibility');
    expect((await screen.findByDisplayValue('Instance A'))).toBeTruthy();
  });

  it('writes edits to the selected widget property (coalesced, latest value wins)', async () => {
    renderPanel();
    await openSection('Content & visibility');
    const input = await screen.findByDisplayValue('Instance A');
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.change(input, { target: { value: 'New title' } });
    await flushDebounce();
    expect(setProp.mock.calls.length).toBeLessThanOrEqual(2);
    expect(saved().content.title).toBe('New title');
    expect(saved().colors.background).toBe(themeDefaults('dark').colors.background);
  });

  it('updates a color through the Editor color picker', async () => {
    colorPick = '#ff0066';
    renderPanel();
    fireEvent.click(await screen.findByLabelText('Change Accent color'));
    await flushDebounce();
    expect(saved().colors.primary).toBe('#ff0066');
  });

  it('preloads fonts chosen in the font picker', async () => {
    renderPanel();
    await openSection('Text');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Choose font' }))[0]);
    await flushDebounce();
    expect(saved().typography.headingFont).toContain('avenir');
    expect(setPreloadFonts).toHaveBeenCalledWith([expect.stringContaining('avenir')]);
  });

  it('loads the other instance after a selection change without restyling it', async () => {
    renderPanel();
    await openSection('Content & visibility');
    await screen.findByDisplayValue('Instance A');
    const before = instances.b['style-config'];
    selected = 'b';
    await act(async () => { selectionCb?.(); await vi.advanceTimersByTimeAsync(50); });
    await waitFor(() => expect(screen.queryByDisplayValue('Instance A')).toBeNull());
    expect(saved('a').content.title).toBe('Instance A');
    expect(instances.b['style-config']).toBe(before);
    expect(saved('b').theme).toBe('minimal');
  });

  it('resets all settings after confirmation', async () => {
    renderPanel();
    await openSection('Advanced');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset widget to defaults' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset widget to defaults' }));
    await flushDebounce();
    expect(saved()).toEqual(parseStyleConfig(serializeStyleConfig(themeDefaults(), 'form')));
  });

  it('warns about poor contrast', async () => {
    instances.a['style-config'] = serializeStyleConfig({ ...themeDefaults(), colors: { ...themeDefaults().colors, text: '#dddddd' } }, 'form');
    renderPanel();
    expect(await screen.findByText(/Body text on background contrast/)).toBeTruthy();
  });
});
