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

function respond(routes: Record<string, unknown | ((url: string) => unknown)>) {
  fetchWithAuth.mockImplementation(async (url: string) => {
    const parsed = new URL(url);
    const handler = routes[parsed.pathname];
    if (handler === undefined) return new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 });
    const body = typeof handler === 'function' ? handler(url) : handler;
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
    await screen.findAllByText('Phone');
    for (let i = 0; i < 3; i++) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(await screen.findByRole('checkbox', { name: /I accept the trade-in terms/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Phone/)).toBeNull();
  });

  it('supports infinite scrolling and pagination in product picker', async () => {
    respond({
      '/api/catalog/order-items': [],
      '/api/catalog/search': (url: string) => {
        const cursor = new URL(url).searchParams.get('cursor');
        if (!cursor) {
          return {
            items: [{ productId: 'p1', title: 'Product One', imageUrl: 'https://example.com/p1.png', source: 'catalog' }],
            nextCursor: 'cursor-token-2',
            hasMore: true,
          };
        }
        return {
          items: [{ productId: 'p2', title: 'Product Two', imageUrl: 'https://example.com/p2.png', source: 'catalog' }],
          nextCursor: undefined,
          hasMore: false,
        };
      },
    });

    render(<TradeInFormWidget />);
    await screen.findByRole('button', { name: 'Select Product One' });

    // The load more button is rendered when hasMore is true
    const loadMoreBtn = await screen.findByRole('button', { name: 'Load more products' });
    expect(loadMoreBtn).toBeTruthy();

    // Verify smaller image element exists within the product button
    const img = screen.getByRole('button', { name: 'Select Product One' }).querySelector('.ti-product__image');
    expect(img).toBeTruthy();

    // Clicking load more fetches the next page using cursor
    fireEvent.click(loadMoreBtn);

    // Both products are now visible
    await screen.findByRole('button', { name: 'Select Product Two' });
    expect(screen.getByRole('button', { name: 'Select Product One' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more products' })).toBeNull();
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

  it('shows a preloader until data is ready', async () => {
    let resolveCta!: (value: Response) => void;
    fetchWithAuth.mockImplementation(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/api/catalog/product-cta') {
        return new Promise<Response>((res) => {
          resolveCta = res;
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const { container } = render(<TradeInProductButtonWidget productId="p1" />);
    await waitFor(() => expect(resolveCta).toBeDefined());
    expect(container.querySelector('.ti-button__spinner')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Trade in' })).toBeNull();

    await act(async () => {
      resolveCta(new Response(JSON.stringify({ eligible: true, upToMinor: 4500, currency: 'USD', formPageUrl: 'https://shop.example.com/trade-in' }), { status: 200 }));
    });

    expect(await screen.findByRole('button', { name: 'Trade in' })).toBeTruthy();
    expect(container.querySelector('.ti-button__spinner')).toBeNull();
  });

  it('stores the form page URL on data-href with the product and shows "up to"', async () => {
    respond({ '/api/catalog/product-cta': { eligible: true, upToMinor: 4500, currency: 'USD', formPageUrl: 'https://shop.example.com/trade-in' } });
    render(<TradeInProductButtonWidget productId="p1" />);
    const btn = await screen.findByRole('button', { name: 'Trade in' });
    expect(btn.getAttribute('data-href')).toBe('https://shop.example.com/trade-in?product=p1');
    expect(screen.getByText('Up to $45.00')).toBeTruthy();
  });

  it('shows the element and stores /trade-in on data-href when formPageUrl is omitted', async () => {
    respond({ '/api/catalog/product-cta': { eligible: true, upToMinor: 800, currency: 'USD' } });
    render(<TradeInProductButtonWidget productId="p1" />);
    const btn = await screen.findByRole('button', { name: 'Trade in' });
    expect(btn.getAttribute('data-href')).toBe('/trade-in?product=p1');
    expect(screen.getByText('Up to $8.00')).toBeTruthy();
  });

  it('opens a popup drawer on the right when the button is clicked, and closes on close button click', async () => {
    respond({
      '/api/catalog/product-cta': { eligible: true, upToMinor: 800, currency: 'USD' },
      '/api/catalog/form-config': { eligible: true, questions: [], media: { photoMinimum: 1, videoMode: 'off', videoMaxSeconds: 60 }, handoffMethods: [] },
    });
    render(<TradeInProductButtonWidget productId="p1" />);
    const btn = await screen.findByRole('button', { name: 'Trade in' });

    // Dialog is initially closed
    expect(screen.queryByRole('dialog')).toBeNull();

    // Click trade in button
    fireEvent.click(btn);

    // Popup drawer opens
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.classList.contains('ti-drawer')).toBe(true);
    expect(screen.getAllByRole('heading', { name: 'Trade in your item' }).length).toBeGreaterThanOrEqual(1);

    // Click close button
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    // Popup drawer closes
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aligns the plugin elements to the left by default', async () => {
    respond({ '/api/catalog/product-cta': { eligible: true, upToMinor: 800, currency: 'USD' } });
    const { container } = render(<TradeInProductButtonWidget productId="p1" />);
    await screen.findByRole('button', { name: 'Trade in' });
    const cta = container.querySelector('.ti-cta') as HTMLElement;
    expect(cta).toBeTruthy();
    expect(cta.style.getPropertyValue('--ti-cta-align')).toBe('flex-start');
  });

  it('updates alignment and element spacing from styleConfig', async () => {
    respond({ '/api/catalog/product-cta': { eligible: true, upToMinor: 800, currency: 'USD' } });
    const config = JSON.stringify({
      version: 1,
      layout: { alignment: 'center', buttonGap: 24 },
    });
    const { container } = render(<TradeInProductButtonWidget productId="p1" styleConfig={config} />);
    await screen.findByRole('button', { name: 'Trade in' });
    const cta = container.querySelector('.ti-cta') as HTMLElement;
    expect(cta).toBeTruthy();
    expect(cta.style.getPropertyValue('--ti-cta-align')).toBe('center');

    const root = container.querySelector('.ti-root--cta') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.getPropertyValue('--ti-button-gap')).toBe('24px');
    expect(root.style.getPropertyValue('--ti-align')).toBe('center');
  });

  it('defaults the main container background to transparent for the plugin', async () => {
    respond({ '/api/catalog/product-cta': { eligible: true, upToMinor: 800, currency: 'USD' } });
    const { container } = render(<TradeInProductButtonWidget productId="p1" />);
    await screen.findByRole('button', { name: 'Trade in' });

    const root = container.querySelector('.ti-root--cta') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.getPropertyValue('--ti-background')).toBe('transparent');
  });

  it('defaults button font weight to 400 and button border to none', async () => {
    respond({ '/api/catalog/product-cta': { eligible: true, upToMinor: 800, currency: 'USD' } });
    const { container } = render(<TradeInProductButtonWidget productId="p1" />);
    const btn = await screen.findByRole('button', { name: 'Trade in' });
    expect(btn).toBeTruthy();

    const root = container.querySelector('.ti-root--cta') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.getPropertyValue('--ti-weight-button')).toBe('400');
    expect(root.style.getPropertyValue('--ti-btn-border')).toBe('none');
  });
});


