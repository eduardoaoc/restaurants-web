/**
 * Converts free text into the kebab-case slug shape the backend requires
 * for categories (validated server-side against
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$` — see App\Http\Requests\Api\V1\Category\
 * StoreCategoryRequest). Used to auto-generate a slug from the category's
 * primary-locale name so the restaurant owner never has to understand what
 * a slug is (CLAUDE.md Passo 2.3 §9) — accented Spanish/Catalan characters
 * (a with acute, n with tilde, c with cedilla, ...) are normalized away
 * rather than dropped, so "Entrantes" and "Postres (Clasicos)" both
 * produce a valid slug.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
