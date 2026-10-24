import React, { useEffect, useRef, useState } from 'react';
import type { CatalogItem } from '../../../lib/schemas/api';
import { errorMessageKey, widgetApi } from './api';
import { Loading, TradeInErrorState, WidgetField } from './primitives';
import { useWidget } from './WidgetThemeProvider';

// Catalog search plus (for signed-in members) eligible items from past orders. Only IDs leave
// the browser; product details shown here are display-only and re-read by the server.

export function ProductPicker({ selected, onSelect }: { selected?: CatalogItem; onSelect: (item: CatalogItem) => void }) {
  const { t, isEditor } = useWidget();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [orderItems, setOrderItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const seq = useRef(0);

  useEffect(() => {
    if (isEditor) return;
    widgetApi.orderItems().then(setOrderItems, () => setOrderItems([]));
  }, [isEditor]);

  const runSearch = (q: string) => {
    const id = ++seq.current;
    setLoading(true);
    setError(undefined);
    widgetApi.searchCatalog(q).then(
      (items) => id === seq.current && setResults(items),
      (err) => id === seq.current && setError(t(errorMessageKey(err))),
    ).finally(() => id === seq.current && setLoading(false));
  };

  useEffect(() => {
    if (isEditor) return;
    const timer = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isEditor]);

  const renderItems = (items: CatalogItem[], label: string) => (
    <div className="ti-fields">
      <p className="ti-label">{label}</p>
      <ul className="ti-products">
        {items.map((item) => {
          const isSelected = selected?.productId === item.productId && selected?.orderId === item.orderId;
          return (
            <li key={`${item.orderId ?? 'c'}:${item.productId}`}>
              <button
                type="button"
                className="ti-product"
                aria-pressed={isSelected}
                aria-label={t('form.item.select', { name: item.title })}
                onClick={() => onSelect(item)}
              >
                {item.imageUrl ? <img className="ti-product__image" src={item.imageUrl} alt="" loading="lazy" /> : <span className="ti-product__image" aria-hidden="true" />}
                <span className="ti-product__title">{item.title}</span>
                {isSelected && <span className="ti-badge">{t('form.item.selected')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="ti-stack">
      {orderItems.length > 0 && renderItems(orderItems, t('form.item.fromOrders'))}
      <WidgetField label={t('form.item.searchLabel')} help={t('form.item.searchHelp')} required>
        {(a11y) => (
          <input
            {...a11y}
            className="ti-input"
            type="search"
            value={query}
            placeholder={t('form.item.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        )}
      </WidgetField>
      <div aria-live="polite">
        {loading && <Loading />}
        {error && <TradeInErrorState message={error} onRetry={() => runSearch(query)} />}
        {!loading && !error && results.length === 0 && query && <p className="ti-helper">{t('form.item.noResults', { query })}</p>}
      </div>
      {results.length > 0 && renderItems(results, t('form.item.fromCatalog'))}
    </div>
  );
}
