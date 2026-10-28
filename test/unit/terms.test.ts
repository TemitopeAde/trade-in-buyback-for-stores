import { describe, expect, it } from 'vitest';
import { hasTerms, textToHtml } from '../../src/lib/terms';
import { sanitizeTermsHtml } from '../../src/server/sanitizeHtml';

describe('trade-in terms', () => {
  it('treats an empty editor as no terms', () => {
    expect(hasTerms('')).toBe(false);
    expect(hasTerms(undefined)).toBe(false);
    expect(hasTerms('<p><br></p>')).toBe(false);
    expect(hasTerms('<p>&nbsp; </p>')).toBe(false);
    expect(hasTerms('<p>Credit is final.</p>')).toBe(true);
  });

  it('escapes legacy plain text into paragraphs', () => {
    expect(textToHtml('One\nline two\n\n<b>"x"</b> & y')).toBe('<p>One<br>line two</p><p>&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y</p>');
  });

  it('removes scripts, event handlers, styles and unsafe links', () => {
    const out = sanitizeTermsHtml(
      '<p style="color:red" onmouseover="x()">Hi</p><script>alert(1)</script><iframe src="https://evil"></iframe>'
      + '<img src=x onerror=alert(1)><a href="javascript:alert(1)">a</a><a href="//evil.com">b</a><style>p{}</style>',
    );
    expect(out).toBe('<p>Hi</p><a target="_blank" rel="noopener noreferrer">a</a><a target="_blank" rel="noopener noreferrer">b</a>');
  });

  it('keeps formatting, lists, tables and safe links', () => {
    const out = sanitizeTermsHtml(
      '<h2>Terms</h2><p class="ql-align-center other"><strong>Bold</strong> <em>it</em></p>'
      + '<ol><li data-list="bullet">One</li></ol><table><tbody><tr><td colspan="2">Cell</td></tr></tbody></table>'
      + '<a href="https://shop.example/terms">full terms</a>',
    );
    expect(out).toContain('<h2>Terms</h2>');
    expect(out).toContain('<p class="ql-align-center"><strong>Bold</strong> <em>it</em></p>');
    expect(out).toContain('<li data-list="bullet">One</li>');
    expect(out).toContain('<td colspan="2">Cell</td>');
    expect(out).toContain('<a href="https://shop.example/terms" target="_blank" rel="noopener noreferrer">full terms</a>');
  });
});
