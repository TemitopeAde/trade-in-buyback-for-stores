import sanitizeHtml from 'sanitize-html';

// Merchant-authored terms are rendered as HTML on the live site, so everything is sanitized on save.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
    'blockquote', 'a', 'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    li: ['data-list'],
    '*': ['class'],
  },
  // Only Quill's own formatting classes (alignment, indent) survive.
  allowedClasses: { '*': ['ql-*'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

export function sanitizeTermsHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
