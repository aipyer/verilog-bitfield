import DOMPurify from 'dompurify';

/**
 * Sanitize an HTML string for safe assignment to `innerHTML`.
 *
 * Pass `window` so DOMPurify can access the DOM to run its sanitizer.
 * Obsidian plugins run in a browser context where `window` is always available.
 */
export function sanitizeHtml(html: string): string {
  const purify = DOMPurify(window);
  return purify.sanitize(html, {
    FORBID_TAGS: ['style', 'script', 'link'],
    FORBID_ATTR: ['onerror', 'onload', 'formaction'],
  });
}
