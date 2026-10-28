import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toPublicMediaUrl } from '../../../lib/media';
import type { CatalogItem, CatalogSearchResponse } from '../../../lib/schemas/api';
import { errorMessageKey, widgetApi } from './api';
import { Loading, TradeInErrorState, WidgetField } from './primitives';
import { useWidget } from './WidgetThemeProvider';

// Catalog search plus (for signed-in members) eligible items from past orders. Only IDs leave
// the browser; product details shown here are display-only and re-read by the server.

function normalizeCatalogResponse(res: CatalogSearchResponse | CatalogItem[]): CatalogSearchResponse {
  if (Array.isArray(res)) return { items: res, hasMore: false };
  return res ?? { items: [], hasMore: false };
}

export function ProductPicker({
  selected,
  onSelect,
  layout = 'table',
}: {
  selected?: CatalogItem;
  onSelect: (item: CatalogItem) => void;
  layout?: 'grid' | 'table';
}) {
  const { t, isEditor } = useWidget();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [orderItems, setOrderItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const seq = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditor) return;
    widgetApi.orderItems().then(setOrderItems, () => setOrderItems([]));
  }, [isEditor]);

  const runSearch = (q: string) => {
    const id = ++seq.current;
    setLoading(true);
    setLoadingMore(false);
    setError(undefined);
    widgetApi.searchCatalog(q).then(
      (raw) => {
        if (id !== seq.current) return;
        const res = normalizeCatalogResponse(raw);
        setResults(res.items);
        setNextCursor(res.nextCursor);
        setHasMore(Boolean(res.hasMore && res.nextCursor));
      },
      (err) => id === seq.current && setError(t(errorMessageKey(err))),
    ).finally(() => id === seq.current && setLoading(false));
  };

  const loadMore = () => {
    if (loading || loadingMore || !hasMore || !nextCursor) return;
    const id = seq.current;
    setLoadingMore(true);
    widgetApi.searchCatalog(query, nextCursor).then(
      (raw) => {
        if (id !== seq.current) return;
        const res = normalizeCatalogResponse(raw);
        setResults((prev) => {
          const seen = new Set(prev.map((i) => i.productId));
          const additions = res.items.filter((i) => !seen.has(i.productId));
          return [...prev, ...additions];
        });
        setNextCursor(res.nextCursor);
        setHasMore(Boolean(res.hasMore && res.nextCursor));
      },
      (err) => {
        if (id === seq.current) setError(t(errorMessageKey(err)));
      },
    ).finally(() => {
      if (id === seq.current) setLoadingMore(false);
    });
  };

  useEffect(() => {
    if (isEditor) return;
    const timer = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isEditor]);

  // Grid layout scrolls with the page, so a sentinel below the list triggers the next page. Table
  // layout scrolls inside its own capped box (handleTableScroll); a sentinel outside that box is
  // always in view and would page through the whole catalog unprompted.
  useEffect(() => {
    if (layout === 'table' || isEditor || !hasMore || loading || loadingMore || !sentinelRef.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '160px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, hasMore, loading, loadingMore, nextCursor, query, isEditor]);

  // When a product is preselected (e.g. from the product page plugin), ensure it is visible in the list
  const displayResults = useMemo(() => {
    if (query || !selected?.productId || !selected.title) return results;
    if (results.some((r) => r.productId === selected.productId)) return results;
    if (orderItems.some((r) => r.productId === selected.productId)) return results;
    return [selected, ...results];
  }, [results, orderItems, selected, query]);

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || loading || loadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 80) {
      loadMore();
    }
  };

  const renderProductsList = (items: CatalogItem[], label: string, isCatalog = false) => (
    <div className="ti-fields">
      <p className="ti-label">{label}</p>
      {layout === 'table' ? (
        <div
          className="ti-table-container"
          tabIndex={0}
          role="region"
          aria-label={label}
          onScroll={isCatalog ? handleTableScroll : undefined}
        >
          <table className="ti-products-table" role="table">
            <thead>
              <tr>
                <th scope="col" className="ti-th--product">{t('common.item')}</th>
                <th scope="col" className="ti-th--action">{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isSelected = selected?.productId === item.productId && selected?.orderId === item.orderId;
                const imgUrl = toPublicMediaUrl(item.imageUrl);
                return (
                  <tr
                    key={`${item.orderId ?? 'c'}:${item.productId}`}
                    className={`ti-tr ${isSelected ? 'ti-tr--selected' : ''}`}
                    onClick={() => onSelect(item)}
                  >
                    <td className="ti-td--product">
                      <div className="ti-product-cell">
                        {imgUrl ? (
                          <img
                            className="ti-product__image ti-product__image--table"
                            src={imgUrl}
                            alt=""
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span
                            className="ti-product__image ti-product__image--table ti-product__image--placeholder"
                            aria-hidden="true"
                          />
                        )}
                        <div className="ti-product-cell__info">
                          <span className="ti-product__title">{item.title}</span>
                          {item.orderId && (
                            <span className="ti-product__order-tag">{t('form.item.fromOrders')}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="ti-td--action">
                      <button
                        type="button"
                        className={`ti-button ${isSelected ? 'ti-button--primary' : 'ti-button--secondary'} ti-button--sm`}
                        aria-pressed={isSelected}
                        aria-label={t('form.item.select', { name: item.title })}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(item);
                        }}
                      >
                        {isSelected ? (
                          <>
                            <span aria-hidden="true">✓ </span>
                            {t('form.item.selected')}
                          </>
                        ) : (
                          t('common.select')
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="ti-products">
          {items.map((item) => {
            const isSelected = selected?.productId === item.productId && selected?.orderId === item.orderId;
            const imgUrl = toPublicMediaUrl(item.imageUrl);
            return (
              <li key={`${item.orderId ?? 'c'}:${item.productId}`}>
                <button
                  type="button"
                  className="ti-product"
                  aria-pressed={isSelected}
                  aria-label={t('form.item.select', { name: item.title })}
                  onClick={() => onSelect(item)}
                >
                  {imgUrl ? (
                    <img
                      className="ti-product__image"
                      src={imgUrl}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="ti-product__image ti-product__image--placeholder" aria-hidden="true" />
                  )}
                  <span className="ti-product__title">{item.title}</span>
                  {isSelected && <span className="ti-badge">{t('form.item.selected')}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {isCatalog && hasMore && layout !== 'table' && <div ref={sentinelRef} className="ti-sentinel" aria-hidden="true" />}
      {isCatalog && loadingMore && (
        <div className="ti-loading-more" aria-live="polite">
          <Loading />
        </div>
      )}
      {isCatalog && hasMore && !loadingMore && (
        <div className="ti-load-more">
          <button type="button" className="ti-button ti-button--secondary" onClick={loadMore}>
            {t('form.item.loadMore')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="ti-stack">
      {orderItems.length > 0 && renderProductsList(orderItems, t('form.item.fromOrders'))}
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
        {!loading && !error && displayResults.length === 0 && query && <p className="ti-helper">{t('form.item.noResults', { query })}</p>}
      </div>
      {displayResults.length > 0 && renderProductsList(displayResults, t('form.item.fromCatalog'), true)}
    </div>
  );
}
