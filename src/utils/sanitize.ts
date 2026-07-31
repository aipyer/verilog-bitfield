import DOMPurify from 'dompurify';

/**
 * Sanitize an HTML string for safe assignment to `innerHTML`.
 *
 * DOMPurify returns `string` (or `TrustedHTML` when the browser supports
 * trusted-types). In either case the HTML has been filtered and is safe.
 *
 * We cast through `unknown` because `HTMLElement.innerHTML` is typed as
 * `string` in the project's `lib.dom.d.ts` — DOMPurify's return type
 * (`string | TrustedHTML`) doesn't match, but the value IS safe.
 */
export function sanitizeHtml(html: string): string {
  const purify = DOMPurify(window);
  const sanitized = purify.sanitize(html, {
    FORBID_TAGS: ['style', 'script', 'link'],
    FORBID_ATTR: ['onerror', 'onload', 'formaction'],
  });
  return String(sanitized);
}
