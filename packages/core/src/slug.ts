// Russian-passport / ICAO Doc 9303 transliteration. Same Cyrillic input always
// produces the same Latin output, so the slug is reproducible across machines.
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "ie", ы: "y", ь: "", э: "e", ю: "iu", я: "ia",
  // Ukrainian / Belarusian extras
  і: "i", ї: "i", є: "e", ў: "u", ґ: "g",
};

function transliterate(s: string): string {
  let out = "";
  for (const ch of String(s).toLowerCase()) {
    out += TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch;
  }
  return out;
}

/**
 * Build a publication id from a human-readable string (e.g. client full name).
 * Pure helper — call sites can use it or pass any other id-shape string.
 *
 * Rules: transliterate Cyrillic, strip diacritics, lowercase, collapse non-alnum
 * to `-`, trim leading/trailing `-`, cap at 80 chars.
 */
export function slug(input: string): string {
  return transliterate(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Predicate: is this string already a canonical publication id?
 * A valid id is non-empty, ≤80 chars, lowercase alphanumerics + dashes,
 * no leading/trailing dash. Equivalent to `slug(x) === x` for non-empty x.
 */
export function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= 80 && slug(id) === id;
}
