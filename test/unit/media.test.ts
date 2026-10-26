import { describe, expect, it } from 'vitest';
import { toPublicMediaUrl } from '../../src/lib/media';

describe('toPublicMediaUrl', () => {
  it('returns undefined for empty, null, or undefined values', () => {
    expect(toPublicMediaUrl()).toBeUndefined();
    expect(toPublicMediaUrl(null)).toBeUndefined();
    expect(toPublicMediaUrl('')).toBeUndefined();
    expect(toPublicMediaUrl('   ')).toBeUndefined();
  });

  it('preserves standard http and https URLs', () => {
    expect(toPublicMediaUrl('https://example.com/item.png')).toBe('https://example.com/item.png');
    expect(toPublicMediaUrl('http://example.com/item.jpg')).toBe('http://example.com/item.jpg');
    expect(toPublicMediaUrl('//example.com/item.webp')).toBe('https://example.com/item.webp');
  });

  it('converts wix:image://v1/ URIs to static.wixstatic.com URLs', () => {
    const wixUri = 'wix:image://v1/3c76e2_c5331f937348492a97df87b~mv2.jpg/file.jpg#originWidth=500&originHeight=500';
    expect(toPublicMediaUrl(wixUri)).toBe('https://static.wixstatic.com/media/3c76e2_c5331f937348492a97df87b~mv2.jpg');

    const wixUriWithoutFilename = 'wix:image://v1/3c76e2_c5331f937348492a97df87b~mv2.png#originWidth=800&originHeight=600';
    expect(toPublicMediaUrl(wixUriWithoutFilename)).toBe('https://static.wixstatic.com/media/3c76e2_c5331f937348492a97df87b~mv2.png');
  });

  it('handles bare Wix media IDs or media/ paths', () => {
    expect(toPublicMediaUrl('3c76e2_c5331f937348492a97df87b~mv2.jpg')).toBe('https://static.wixstatic.com/media/3c76e2_c5331f937348492a97df87b~mv2.jpg');
    expect(toPublicMediaUrl('media/3c76e2_c5331f937348492a97df87b~mv2.png')).toBe('https://static.wixstatic.com/media/3c76e2_c5331f937348492a97df87b~mv2.png');
    expect(toPublicMediaUrl('product-image.webp')).toBe('https://static.wixstatic.com/media/product-image.webp');
  });
});
