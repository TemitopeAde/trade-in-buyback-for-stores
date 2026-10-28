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
const currentMember = vi.fn(async () => ({ member: undefined as { loginEmail?: string } | undefined }));
vi.mock('@wix/members', () => ({ members: { getCurrentMember: () => currentMember() } }));
vi.mock('tus-js-client', () => ({ Upload: class {} }));
// A plain stub (Vitest reports a vi.fn's rejection even when the widget handles it).
let siteCurrency: () => Promise<string> = async () => 'EUR';
vi.mock('@wix/site-site', () => ({ site: { currency: () => siteCurrency() } }));

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

  it('shows Editor sample amounts in the site currency, or none when it is unknown', async () => {
    viewMode.mockResolvedValue('Editor');
    const { unmount } = render(<TradeInFormWidget />);
    expect(await screen.findByText('€120.00')).toBeTruthy();
    unmount();
    siteCurrency = async () => { throw new Error('no host'); };
    try {
      render(<TradeInFormWidget />);
      await screen.findByText('Live trade-in data appears on your published site.');
      expect(screen.queryByText(/120\.00/)).toBeNull();
    } finally {
      siteCurrency = async () => 'EUR';
    }
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
        handoffMethods: [{ method: 'drop_off' }], termsHtml: '<p>Terms apply</p>', currency: 'USD',
      },
      '/api/trade-ins/estimate': { eligible: true, offerMinor: 5000, currency: 'USD', complete: true },
    });
    render(<TradeInFormWidget styleConfig={serializeStyleConfig(hidden, 'form')} />);
    await screen.findAllByText('Phone');
    for (let i = 0; i < 3; i++) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(await screen.findByRole('checkbox', { name: /I accept the trade-in terms/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Phone/)).toBeNull();
  });

  it('shows the store terms as formatted HTML', async () => {
    history.replaceState(null, '', '/?product=p1');
    respond({
      '/api/catalog/order-items': [],
      '/api/catalog/search': [],
      '/api/trade-ins/form-config': {
        eligible: true, accepting: true, product: { productId: 'p1', title: 'Phone' }, questions: [],
        media: { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 60 },
        handoffMethods: [{ method: 'drop_off' }], termsHtml: '<h2>Our terms</h2><ul><li>Credit is final</li></ul>', currency: 'USD',
      },
      '/api/trade-ins/estimate': { eligible: true, offerMinor: 5000, currency: 'USD', complete: true },
    });
    render(<TradeInFormWidget />);
    await screen.findAllByText('Phone');
    for (let i = 0; i < 3; i++) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    await screen.findByRole('checkbox', { name: /I accept the trade-in terms/ });
    expect(screen.getByRole('heading', { name: 'Our terms', hidden: true })).toBeTruthy();
    expect(screen.getByText('Credit is final').tagName).toBe('LI');
  });

  it('skips the photo step when uploads are not on the store plan', async () => {
    history.replaceState(null, '', '/?product=p1');
    respond({
      '/api/catalog/order-items': [],
      '/api/catalog/search': [],
      '/api/trade-ins/form-config': {
        eligible: true, accepting: true, uploads: false, product: { productId: 'p1', title: 'Phone' }, questions: [],
        media: { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 0 },
        handoffMethods: [{ method: 'drop_off' }], termsHtml: '<p>Terms apply</p>', currency: 'USD',
      },
      '/api/trade-ins/estimate': { eligible: true, offerMinor: 5000, currency: 'USD', complete: true },
    });
    render(<TradeInFormWidget />);
    await screen.findAllByText('Phone');
    for (let i = 0; i < 2; i++) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(await screen.findByRole('checkbox', { name: /I accept the trade-in terms/ })).toBeTruthy();
    expect(screen.getAllByRole('listitem').length).toBe(3);
  });

  it('lets shoppers describe an item that is not in the catalog and submits it without an estimate', async () => {
    respond({
      '/api/catalog/order-items': [],
      '/api/catalog/search': [],
      '/api/trade-ins/custom-item-config': {
        eligible: true, accepting: true, uploads: false, custom: true, questions: [],
        media: { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 0 },
        handoffMethods: [{ method: 'drop_off' }], termsHtml: '', currency: 'USD',
      },
      '/api/trade-ins/create': { tradeInId: 't1', reference: 'TI-CUST-0001', accessToken: 'a'.repeat(32) },
      '/api/trade-ins/status': {
        tradeInId: 't1', reference: 'TI-CUST-0001', status: 'submitted', revision: 1, createdAt: '2026-01-01T00:00:00Z',
        product: { title: 'Velo Road bike' }, custom: true, currency: 'USD', estimatedValueMinor: 0,
        handoff: { method: 'drop_off', allowTracking: false }, actions: [], timeline: [],
      },
    });
    render(<TradeInFormWidget />);
    // Let the catalog search debounce and the custom item config request settle.
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Describe it instead' })));

    // Required description fields are checked before moving on.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(screen.getByText('Item name is required.', { selector: 'li' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Item name/), { target: { value: 'Road bike' } });
    fireEvent.change(screen.getByLabelText(/Brand/), { target: { value: 'Velo' } });
    fireEvent.change(screen.getByLabelText(/Description and condition/), { target: { value: 'Two years old.' } });
    fireEvent.change(screen.getByLabelText(/What do you think it’s worth/), { target: { value: '300' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));

    // No condition questions and (without uploads) no photo step: straight to the details.
    expect(screen.getAllByRole('listitem').length).toBe(2);
    expect(screen.getByText('We’ll email you an offer after reviewing your item. Nothing is final until you accept it.')).toBeTruthy();
    expect(screen.getByText('Velo Road bike')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /I accept the trade-in terms/ }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit trade-in' })));

    const call = fetchWithAuth.mock.calls.find(([url]) => String(url).includes('/api/trade-ins/create'))!;
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.productId).toBeUndefined();
    expect(body.customItem).toEqual({ name: 'Road bike', brand: 'Velo', description: 'Two years old.', customerEstimateMinor: 300_00 });
  });

  it('hides the custom item option when the store does not accept them', async () => {
    respond({
      '/api/catalog/order-items': [],
      '/api/catalog/search': [],
      '/api/trade-ins/custom-item-config': { eligible: false, accepting: true, uploads: true, custom: true, questions: [], media: { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 0 }, handoffMethods: [], termsHtml: '' },
    });
    render(<TradeInFormWidget />);
    await waitFor(() => expect(fetchWithAuth.mock.calls.some(([url]) => String(url).includes('custom-item-config'))).toBe(true));
    expect(screen.queryByRole('button', { name: 'Describe it instead' })).toBeNull();
  });

  it('tells shoppers when the store is not accepting new trade-ins', async () => {
    history.replaceState(null, '', '/?product=p1');
    respond({
      '/api/catalog/order-items': [],
      '/api/catalog/search': [],
      '/api/trade-ins/form-config': {
        eligible: true, accepting: false, uploads: false, product: { productId: 'p1', title: 'Phone' }, questions: [],
        media: { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 0 }, handoffMethods: [{ method: 'drop_off' }], termsHtml: '',
      },
    });
    render(<TradeInFormWidget />);
    expect(await screen.findByText('We’re not accepting new trade-ins right now. Please check back later.')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(screen.queryByRole('checkbox', { name: /I accept the trade-in terms/ })).toBeNull();
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

    // The catalog renders as a table on the page too, with the image in the product's row
    expect(screen.getByRole('table').classList.contains('ti-products-table')).toBe(true);
    const img = screen.getByRole('button', { name: 'Select Product One' }).closest('tr')?.querySelector('.ti-product__image');
    expect(img).toBeTruthy();

    // Clicking load more fetches the next page using cursor
    fireEvent.click(loadMoreBtn);

    // Both products are now visible
    await screen.findByRole('button', { name: 'Select Product Two' });
    expect(screen.getByRole('button', { name: 'Select Product One' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more products' })).toBeNull();
  });

  it('leaves the header and landmark to the host when embedded', async () => {
    const { container } = render(<TradeInFormWidget embedded />);
    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalled());
    expect(root(container).tagName).toBe('DIV');
    expect(screen.queryByRole('heading', { name: 'Trade in your item' })).toBeNull();
  });

  it('shows the preview without data calls when the host reports design mode', async () => {
    render(<TradeInFormWidget embedded designMode />);
    await screen.findByText('Live trade-in data appears on your published site.');
    expect(fetchWithAuth).not.toHaveBeenCalled();
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

  it('shows the store’s offer for a custom item and accepts it', async () => {
    history.replaceState(null, '', '/status?ti=abcdefghijklmnopqrstuvwxyz012345');
    const base = {
      tradeInId: 't1', reference: 'TI-CUST-0001', revision: 3, createdAt: '2026-01-01T00:00:00Z',
      product: { title: 'Velo Road bike' }, custom: true, currency: 'USD',
      handoff: { method: 'drop_off', allowTracking: false }, timeline: [],
    };
    respond({
      '/api/trade-ins/status': { ...base, status: 'quote_pending', estimatedValueMinor: 0, quote: { amountMinor: 250_00 }, actions: ['accept_quote', 'decline_quote'] },
      '/api/trade-ins/customer-action': { ...base, status: 'approved', revision: 4, estimatedValueMinor: 250_00, actions: [] },
    });
    render(<TradeInStatusWidget />);
    expect(await screen.findByText('Our offer')).toBeTruthy();
    expect(screen.getByText('Awaiting our offer')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Accept $250.00' })));
    const call = fetchWithAuth.mock.calls.find(([url]) => String(url).includes('customer-action'))!;
    expect(JSON.parse((call[1] as { body: string }).body)).toMatchObject({ action: 'accept_quote', expectedRevision: 3 });
    expect(await screen.findByText('Approved')).toBeTruthy();
  });

  it('shows a lookup hint to visitors opening it without a link', async () => {
    respond({ '/api/trade-ins/mine': { items: [], signedIn: false } });
    render(<TradeInStatusWidget />);
    expect(await screen.findByText('Open the tracking link from your email to see your trade-in.')).toBeTruthy();
    expect(fetchWithAuth.mock.calls.map(([url]) => new URL(url as string).pathname)).toEqual(['/api/trade-ins/mine']);
  });

  it('shows the signed-in member’s latest trade-in when opened without a link', async () => {
    const row = (id: string, reference: string) => ({ tradeInId: id, reference, status: 'approved', productTitle: 'Phone', createdAt: '2026-01-01T00:00:00Z', estimatedValueMinor: 5000, currency: 'USD' });
    const statusBodies: unknown[] = [];
    respond({
      '/api/trade-ins/mine': { items: [row('t2', 'TI-NEW'), row('t1', 'TI-OLD')], signedIn: true },
      '/api/trade-ins/status': () => ({
        tradeInId: 't2', reference: 'TI-NEW', status: 'approved', revision: 1, createdAt: '2026-01-01T00:00:00Z',
        product: { title: 'Phone' }, currency: 'USD', estimatedValueMinor: 5000,
        handoff: { method: 'drop_off', allowTracking: false }, actions: [], timeline: [],
      }),
    });
    const impl = fetchWithAuth.getMockImplementation()!;
    fetchWithAuth.mockImplementation(async (url: string, init?: { body?: string }) => {
      if (init?.body) statusBodies.push(JSON.parse(init.body));
      return impl(url);
    });
    render(<TradeInStatusWidget />);
    expect(await screen.findByText('TI-NEW')).toBeTruthy();
    expect(statusBodies[0]).toEqual({ tradeInId: 't2' });
    expect((screen.getByLabelText('My trade-ins') as HTMLSelectElement).options).toHaveLength(2);
  });
});

describe('TradeInProductButtonWidget', () => {
  it('renders nothing for ineligible products on the live site', async () => {
    respond({ '/api/catalog/product-cta': { eligible: false } });
    const { container } = render(<TradeInProductButtonWidget productId="p1" />);
    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalled());
    expect(container.querySelector('.ti-button')).toBeNull();
  });

  it('shows a disabled button and a note when the store is not accepting requests', async () => {
    respond({ '/api/catalog/product-cta': { eligible: false, accepting: false } });
    render(<TradeInProductButtonWidget productId="p1" />);
    const button = (await screen.findByRole('button', { name: 'Trade in' })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('Trade-ins are paused right now. Please check back soon.');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
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

  it('defaults button width to full width for the plugin', async () => {
    respond({ '/api/catalog/product-cta': { eligible: true, upToMinor: 800, currency: 'USD' } });
    const { container } = render(<TradeInProductButtonWidget productId="p1" />);
    await screen.findByRole('button', { name: 'Trade in' });

    const root = container.querySelector('.ti-root--cta') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.getPropertyValue('--ti-btn-width')).toBe('100%');
  });

  it('renders the catalog as a table in the Trade in your item modal', async () => {
    respond({
      '/api/catalog/product-cta': { eligible: true, upToMinor: 800, currency: 'USD' },
      '/api/catalog/order-items': [],
      '/api/catalog/search': {
        items: [
          { productId: 'p1', title: 'Laptop Pro', imageUrl: 'https://example.com/laptop.png', source: 'catalog' },
          { productId: 'p2', title: 'Tablet Air', imageUrl: 'https://example.com/tablet.png', source: 'catalog' },
        ],
        hasMore: false,
      },
      '/api/trade-ins/form-config': {
        eligible: true,
        product: { productId: 'p1', title: 'Laptop Pro' },
        questions: [],
        media: { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 60 },
        handoffMethods: [{ method: 'drop_off' }],
        termsHtml: '<p>Terms apply</p>',
        currency: 'USD',
      },
    });

    render(<TradeInProductButtonWidget productId="p1" />);
    const btn = await screen.findByRole('button', { name: 'Trade in' });
    fireEvent.click(btn);

    // Modal drawer is open
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();

    // Verify catalog is displayed as a table instead of a grid
    const table = await screen.findByRole('table');
    expect(table).toBeTruthy();
    expect(table.classList.contains('ti-products-table')).toBe(true);

    // The table is wrapped in a scrollable, accessible container
    const tableContainer = dialog.querySelector('.ti-table-container');
    expect(tableContainer).toBeTruthy();
    expect(tableContainer?.getAttribute('role')).toBe('region');
    expect(tableContainer?.getAttribute('tabIndex')).toBe('0');

    // Headers are Item and Action
    expect(screen.getByRole('columnheader', { name: 'Item' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Action' })).toBeTruthy();

    // Select button is inside table action cell
    const selectTablet = await screen.findByRole('button', { name: 'Select Tablet Air' });
    expect(selectTablet).toBeTruthy();
    expect(selectTablet.getAttribute('aria-pressed')).toBe('false');

    // Table rows for products (header + 2 items)
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThanOrEqual(3);

    // Clicking select selects the item
    fireEvent.click(selectTablet);
    expect(selectTablet.getAttribute('aria-pressed')).toBe('true');
  });
});


