/**
 * Lexicographic string order for `Array#sort` comparators: negative, zero or positive.
 *
 * Deliberately not `String#localeCompare`: planet names are identifiers, and every ordering derived
 * from them -- the adjacency lists that fix the canonical plan, the hunter schedule echoed to the
 * frontend -- has to be reproducible on every machine, which a locale-aware collation is not.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
