// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeStyleConfig, themeDefaults } from '../../src/lib/style/style-config';

// Wix SDK modules are mocked in tests only.
const viewMode = vi.fn(async () => 'Site');
vi.mock('@wix/site-window', () => ({
  window: { viewMode: () => viewMode() },
  multilingual: { currentLanguage: async () => 'en' },
}));
const fetchWithAuth = vi.fn();
vi.mock('@wix/essentials', () => ({ httpClient: { fetchWithAuth: (...a: unknown[]) => fetchWithAuth(...a) } }));
vi.mock('tus-js-client', () => ({ Upload: class {} }));

const { TradeInFormWidget } = await import('../../src/components/widgets/TradeInFormWidget');
const { TradeInStatusWidget } = await import('../../src/components/widgets/TradeInStatusWidget');
const { TradeInProductButtonWidget } = await import('../../src/components/widgets/TradeInProductButtonWidget');

function respond(routes: Record<string, unknown>) {
  fetchWithAuth.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    const body = routes[path];
    if (body === undefined) return new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

const root = (container: HTMLElement) => container.querySelector('.ti-root') as HTMLElement;

beforeEach(() => {
  viewMode.mockResolvedValue('Site');
  respond({ '/api/catalog/order-items': [], '/api/catalog/search': [] });
  history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TradeInFormWidget', () => {
  it('renders with the default theme', async () => {
    const { container } = render(<TradeInFormWidget />);
    await screen.findByRole('heading', { name: 'Trade in your item' });
    expect(root(container).style.getPropertyValue('--ti-primary')).toBe(themeDefaults().colors.primary);
  });

  it('applies a custom per-instance style configuration', async () => {
    const style = { ...themeDefaults('dark'), content: { ...themeDefaults().content, title: 'Swap your gear' } };
    const { container } = render(<TradeInFormWidget styleConfig={serializeStyleConfig(style, 'form')} />);
    await screen.findByRole('heading', { name: 'Swap your gear' });
    expect(root(container).style.getPropertyValue('--ti-background')).toBe(themeDefaults('dark').colors.background);
  });

  it('renders safely with a corrupt or legacy configuration', async () => {
    const { container } = render(<TradeInFormWidget styleConfig={'{"version":0,"primaryColor":"red;}","typography":{"headingSize":"huge"}}'} />);
    await screen.findByRole('heading', { name: 'Trade in your item' });
    expect(root(container).style.getPropertyValue('--ti-size-heading')).toBe(`${themeDefaults().typography.headingSize}px`);
  });

  it('keeps an accessible name when the title is hidden', async () => {
    const style = { ...themeDefaults(), content: { ...themeDefaults().content, showTitle: false, showDescription: false } };
    render(<TradeInFormWidget styleConfig={serializeStyleConfig(style, 'form')} />);
    expect(await screen.findByRole('region', { name: 'Trade in your item' })).toBeTruthy();
  });

  it('shows an error summary and blocks Continue without an item', async () => {
    render(<TradeInFormWidget />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Choose an item to trade in.')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows a styled preview without data calls in the Editor', async () => {
    viewMode.mockResolvedValue('Editor');
    render(<TradeInFormWidget />);
    await screen.findByText('Live trade-in data appears on your published site.');
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('never lets appearance settings hide the terms checkbox', async () => {
    const hidden = { ...themeDefaults(), content: { ...themeDefaults().content, showHelperText: false, showOptionalFields: false, showOfferEstimate: false } };
    history.replaceState(null, '', '/?product=p1');
    respond({
      '/api/catalog/order-items': [],
      '/api/catalog/search': [],
      '/api/trade-ins/form-config': {
        eligible: true, product: { productId: 'p1', title: 'Phone' }, questions: [],
        media: { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 60 },
        handoffMethods: [{ method: 'drop_off' }], termsText: 'Terms apply', currency: 'USD',
      },
      '/api/trade-ins/estimate': { eligible: true, offerMinor: 5000, currency: 'USD', complete: true },
    });
    render(<TradeInFormWidget styleConfig={serializeStyleConfig(hidden, 'form')} />);
    await screen.findByText('Phone');
    for (let i = 0; i < 3; i++) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(await screen.findByRole('checkbox', { name: /I accept the trade-in terms/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Phone/)).toBeNull();
  });
});

describe('TradeInStatusWidget', () => {
  it('loads by access token, removes it from the URL and shows the timeline', async () => {
    history.replaceState(null, '', '/status?ti=abcdefghijklmnopqrstuvwxyz012345');
    respond({
      '/api/trade-ins/status': {
        tradeInId: 't1', reference: 'TI-AAAA-BBBB', status: 'approved', revision: 2, createdAt: '2026-01-01T00:00:00Z',
        product: { title: 'Phone' }, currency: 'USD', estimatedValueMinor: 5000,
        handoff: { method: 'drop_off', address: '1 Main St', allowTracking: false }, actions: ['cancel'],
        timeline: [{ status: 'submitted', at: '2026-01-01T00:00:00Z' }, { status: 'approved', at: '2026-01-02T00:00:00Z' }],
      },
    });
    render(<TradeInStatusWidget />);
    expect(await screen.findByText('TI-AAAA-BBBB')).toBeTruthy();
    expect(location.search).toBe('');
    expect(screen.getByText('1 Main St')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
  });

  it('shows a lookup hint when opened without a link', async () => {
    render(<TradeInStatusWidget />);
    expect(await screen.findByText('Open the tracking link from your email to see your trade-in.')).toBeTruthy();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });
});

describe('TradeInProductButtonWidget', () => {
  it('renders nothing for ineligible products on the live site', async () => {
    respond({ '/api/catalog/product-cta': { eligible: false } });
    const { container } = render(<TradeInProductButtonWidget productId="p1" />);
    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalled());
    expect(container.querySelector('.ti-button')).toBeNull();
  });

  it('links to the form page with the product and shows "up to"', async () => {
    respond({ '/api/catalog/product-cta': { eligible: true, upToMinor: 4500, currency: 'USD', formPageUrl: 'https://shop.example.com/trade-in' } });
    render(<TradeInProductButtonWidget productId="p1" />);
    const link = await screen.findByRole('link', { name: 'Trade in your old one' });
    expect(link.getAttribute('href')).toBe('https://shop.example.com/trade-in?product=p1');
    expect(screen.getByText('Up to $45.00')).toBeTruthy();
  });
});
