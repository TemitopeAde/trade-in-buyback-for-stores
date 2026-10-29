// Trade-in terms are stored as sanitized HTML (see server/sanitizeHtml.ts).

export const DEFAULT_TERMS_HTML =
  '<h2>Trade-in terms</h2>'
  + '<p>By submitting a trade-in request, you confirm that the information you provide is accurate and that you are authorized to trade in the item.</p>'
  + '<p>All requests and offers are subject to review and inspection by the store. An offer is not final until you accept it after the store completes its review.</p>';

/** True when the terms have visible text; Quill's empty document is `<p><br></p>`. */
export function hasTerms(html: string | undefined): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim().length > 0;
}

/** Keeps saved terms, or supplies the starter template for an empty editor. */
export function termsEditorValue(html: string | undefined): string {
  return html && hasTerms(html) ? html : DEFAULT_TERMS_HTML;
}

/** Converts legacy plain-text terms into paragraphs. */
export function textToHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
