import { auth } from '@wix/essentials';
import { catalogVersioning, products, productsV3 } from '@wix/stores';
import { toMinor } from '../../lib/money';

// Reads the Wix Stores catalog on the server so prices/categories used for offers are trusted.
// Supports both catalog versions (mandatory for App Market). Product data from clients is never used.

export type CatalogVersion = 'V1_CATALOG' | 'V3_CATALOG' | 'STORES_NOT_INSTALLED';

export type CatalogProduct = {
  productId: string;
  title: string;
  imageUrl?: string;
  sku?: string;
  priceMinor: number;
  currency: string;
  categoryIds: string[];
  visible: boolean;
  catalogVersion: 'V1_CATALOG' | 'V3_CATALOG';
};

const elevated = {
  getCatalogVersion: auth.elevate(catalogVersioning.getCatalogVersion),
  v1Get: auth.elevate(products.getProduct),
  v1Query: auth.elevate(products.queryProducts),
  v3Get: auth.elevate(productsV3.getProduct),
  v3Search: auth.elevate(productsV3.searchProducts),
};

// The catalog version is permanent per site; cache per instance for the process lifetime.
const versionCache = new Map<string, CatalogVersion>();

export async function getCatalogVersion(instanceId: string): Promise<CatalogVersion> {
  const cached = versionCache.get(instanceId);
  if (cached) return cached;
  const { catalogVersion } = await elevated.getCatalogVersion();
  const version = (catalogVersion ?? 'STORES_NOT_INSTALLED') as CatalogVersion;
  versionCache.set(instanceId, version);
  return version;
}

type V1Product = products.Product;
type V3Product = productsV3.V3Product;

function fromV1(p: V1Product): CatalogProduct | undefined {
  const price = p.priceData?.price;
  const currency = p.priceData?.currency;
  if (!p._id || price == null || !currency) return undefined;
  return {
    productId: p._id,
    title: p.name ?? '',
    imageUrl: p.media?.mainMedia?.image?.url ?? undefined,
    sku: p.sku ?? undefined,
    priceMinor: toMinor(price, currency),
    currency,
    categoryIds: p.collectionIds ?? [],
    visible: p.visible !== false,
    catalogVersion: 'V1_CATALOG',
  };
}

function fromV3(p: V3Product): CatalogProduct | undefined {
  const amount = p.actualPriceRange?.minValue?.amount;
  const currency = p.currency;
  if (!p._id || !amount || !currency) return undefined;
  return {
    productId: p._id,
    title: p.name ?? '',
    imageUrl: p.media?.main?.url ?? undefined,
    priceMinor: toMinor(amount, currency),
    currency,
    categoryIds: (p.allCategoriesInfo?.categories ?? []).map((c) => c._id).filter((id): id is string => !!id),
    visible: p.visible !== false,
    catalogVersion: 'V3_CATALOG',
  };
}

const V3_FIELDS = ['CURRENCY', 'ALL_CATEGORIES_INFO'] as const;

export class WixCatalogService {
  async getProduct(instanceId: string, productId: string): Promise<CatalogProduct | undefined> {
    const version = await getCatalogVersion(instanceId);
    try {
      if (version === 'V1_CATALOG') {
        const { product } = await elevated.v1Get(productId);
        return product ? fromV1(product) : undefined;
      }
      if (version === 'V3_CATALOG') {
        return fromV3(await elevated.v3Get(productId, { fields: [...V3_FIELDS] }));
      }
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
    return undefined;
  }

  /** Visible products whose name matches the term. */
  async search(instanceId: string, term: string, limit = 12): Promise<CatalogProduct[]> {
    const version = await getCatalogVersion(instanceId);
    const q = term.trim().slice(0, 80);
    if (version === 'V1_CATALOG') {
      let query = elevated.v1Query().limit(limit);
      if (q) query = query.startsWith('name', q);
      const res = await query.find();
      return res.items.map(fromV1).filter((p): p is CatalogProduct => !!p && p.visible);
    }
    if (version === 'V3_CATALOG') {
      const res = await elevated.v3Search(
        {
          ...(q ? { search: { expression: q, fields: ['name'] } } : {}),
          filter: { visible: true },
          cursorPaging: { limit },
        },
        { fields: [...V3_FIELDS] },
      );
      return (res.products ?? []).map(fromV3).filter((p): p is CatalogProduct => !!p);
    }
    return [];
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { details?: { applicationError?: { code?: string } }; code?: string; message?: string };
  return /NOT_FOUND|404/i.test(`${e?.details?.applicationError?.code ?? ''} ${e?.code ?? ''} ${e?.message ?? ''}`);
}
