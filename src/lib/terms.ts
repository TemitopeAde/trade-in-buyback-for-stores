// Trade-in terms are stored as sanitized HTML (see server/sanitizeHtml.ts).

/** True when the terms have visible text; Quill's empty document is `<p><br></p>`. */
export function hasTerms(html: string | undefined): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim().length > 0;
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
