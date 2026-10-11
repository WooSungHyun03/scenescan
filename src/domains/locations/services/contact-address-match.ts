import { DISTRICT_LABELS } from "@/types/location-options";

const administrativeTokens = new Set([
  "대한민국", "부산", "부산광역시", ...Object.values(DISTRICT_LABELS),
]);
const districtTokens = new Set<string>(Object.values(DISTRICT_LABELS));

function allAddressTokens(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/** Contact identity requires facility-level evidence, not a shared district
 * or road. Missing/partial addresses deliberately fall back to other reviewed
 * evidence rather than suggesting an unrelated phone number. */
export function contactAddressesMatch(expected: string, candidate: string | null): boolean {
  if (!candidate) return false;
  const expectedAddress = allAddressTokens(expected);
  const candidateAddress = allAddressTokens(candidate);
  const expectedDistricts = expectedAddress.filter((token) => districtTokens.has(token));
  const candidateDistricts = candidateAddress.filter((token) => districtTokens.has(token));
  if (expectedDistricts.length && candidateDistricts.length
    && !expectedDistricts.every((token) => candidateDistricts.includes(token))) return false;
  const expectedTokens = expectedAddress.filter((token) => !administrativeTokens.has(token));
  const candidateTokens = new Set(candidateAddress.filter((token) => !administrativeTokens.has(token)));
  return expectedTokens.length >= 2
    && expectedTokens.some((token) => /\d/u.test(token))
    && expectedTokens.every((token) => candidateTokens.has(token));
}
