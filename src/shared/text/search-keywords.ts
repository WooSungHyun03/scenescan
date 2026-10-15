/** Match retrieval's case-insensitive identity, preserving first spelling/order.
 * No stemming, transliteration or inferred keywords: those change search intent.
 */
export function uniqueSearchKeywords(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const keyword = value.trim();
    if (!keyword) continue;
    const identity = keyword.toLocaleLowerCase("ko-KR");
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(keyword);
  }
  return result;
}
