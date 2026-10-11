import type { Location } from "@/types/domain";
import type { DiscoveredPlace } from "@/types/place-discovery";
import type { LocationContact, LocationContactsResponse } from "@/types/location-contact";
import { isValidContactPhone } from "./permit-verification";
import { getStraightLineDistanceMeters } from "./parking-distance";
import type { ReviewedLocationContacts } from "./contact-review";
import { contactAddressesMatch } from "./contact-address-match";

const TYPE_PRIORITY = {
  permit_contact: 0,
  management_contact: 1,
  place_contact: 2,
} as const;

const LARGE_SITE_PATTERN = /(대학교|캠퍼스|해수욕장|공원|문화마을|마을|공항|항$|산$|섬$|대교|경기장|터미널)/u;
const DISALLOWED_PLACE_GROUPS = new Set(["MT1", "CS2", "OL7", "FD6", "CE7", "PM9"]);

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu, "");
}

function addressesRelated(locationAddress: string, place: DiscoveredPlace): boolean {
  return contactAddressesMatch(locationAddress, place.address)
    || contactAddressesMatch(locationAddress, place.roadAddress);
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Legacy permit columns are accepted only when the row already carries the
 * complete reviewed provenance needed to prove it is a permit contact. A phone
 * number on its own never changes permit verification. */
export function contactFromReviewedPermit(location: Location): LocationContact | null {
  const permit = location.permit;
  const sourceUrl = safeHttpUrl(permit.sourceUrl);
  if (
    permit.type.trim() === "문의 필요"
    || !permit.contactName?.trim()
    || !permit.contactPhone?.trim()
    || !isValidContactPhone(permit.contactPhone)
    || !permit.source?.trim()
    || !sourceUrl
    || !permit.lastVerifiedAt
    || !Number.isFinite(new Date(permit.lastVerifiedAt).getTime())
  ) return null;

  return {
    id: `permit:${location.id}`,
    contactType: "permit_contact",
    contactName: permit.contactName.trim(),
    phone: permit.contactPhone.trim(),
    source: permit.source.trim(),
    sourceUrl,
    lastVerifiedAt: permit.lastVerifiedAt,
    verification: "official_reviewed",
    providerPlaceId: null,
    distanceMeters: null,
    matchBasis: ["location_id", "facility_relationship"],
  };
}

type ScoredPlace = {
  place: DiscoveredPlace;
  score: number;
  distanceMeters: number;
  addressMatched: boolean;
};

function scorePlace(location: Location, place: DiscoveredPlace): ScoredPlace | null {
  if (!place.phone || !isValidContactPhone(place.phone) || !place.placeUrl) return null;
  if (place.categoryGroupCode && DISALLOWED_PLACE_GROUPS.has(place.categoryGroupCode)) return null;

  const locationName = normalize(location.name);
  const placeName = normalize(place.name);
  const exactName = locationName === placeName;
  const containedName = Math.min(locationName.length, placeName.length) >= 4
    && (locationName.includes(placeName) || placeName.includes(locationName));
  if (!exactName && !containedName) return null;

  const measured = getStraightLineDistanceMeters(location.point, place.point);
  if (measured === null || measured > 300) return null;
  const distanceMeters = Math.round(measured);
  const addressMatched = addressesRelated(location.address, place);

  // Containment is intentionally stricter because a shop may prepend a famous
  // landmark name. Exact names still need address agreement or very close
  // coordinates, so the nearest unrelated business can never win by distance.
  if (exactName && !addressMatched && distanceMeters > 120) return null;
  if (!exactName && (!addressMatched || distanceMeters > 80)) return null;

  const score = (exactName ? 70 : 45)
    + (addressMatched ? 20 : 0)
    + (distanceMeters <= 30 ? 20 : distanceMeters <= 80 ? 15 : distanceMeters <= 120 ? 10 : 5);
  return { place, score, distanceMeters, addressMatched };
}

function sortedOfficialContacts(
  location: Location,
  reviewed: { contacts: LocationContact[] } | null,
): LocationContact[] {
  const byType = new Map<LocationContact["contactType"], LocationContact>();
  const permit = contactFromReviewedPermit(location);
  if (permit) byType.set(permit.contactType, permit);
  for (const contact of reviewed?.contacts ?? []) {
    if (!byType.has(contact.contactType)) byType.set(contact.contactType, contact);
  }
  return [...byType.values()].sort((a, b) => TYPE_PRIORITY[a.contactType] - TYPE_PRIORITY[b.contactType]);
}

export type ContactResolverInput = {
  location: Location;
  reviewed: { contacts: LocationContact[]; scale: ReviewedLocationContacts["scale"] } | null;
  providerPlaces?: readonly DiscoveredPlace[];
  providerAvailable: boolean;
  sourceMode: "live" | "fixture";
  now?: Date;
};

export function resolveLocationContacts(input: ContactResolverInput): LocationContactsResponse {
  const official = sortedOfficialContacts(input.location, input.reviewed);
  if (official.length > 0) {
    return {
      locationId: input.location.id,
      contacts: official,
      resolution: "official",
      reviewRequired: false,
      reason: "official_contact_available",
      sourceMode: input.sourceMode,
    };
  }

  const largeSite = input.reviewed?.scale === "large" || LARGE_SITE_PATTERN.test(input.location.name);
  if (largeSite) {
    return {
      locationId: input.location.id,
      contacts: [],
      resolution: "unconfirmed",
      reviewRequired: true,
      reason: "large_site_requires_review",
      sourceMode: input.sourceMode,
    };
  }
  if (!input.providerAvailable) {
    return {
      locationId: input.location.id,
      contacts: [],
      resolution: "unconfirmed",
      reviewRequired: true,
      reason: "provider_unavailable",
      sourceMode: input.sourceMode,
    };
  }

  const places = input.providerPlaces ?? [];
  const withPhones = places.filter((place) => Boolean(place.phone?.trim()));
  const scored = places.flatMap((place) => {
    const result = scorePlace(input.location, place);
    return result ? [result] : [];
  }).sort((a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters || a.place.id.localeCompare(b.place.id));

  if (scored.length === 0) {
    return {
      locationId: input.location.id,
      contacts: [],
      resolution: "unconfirmed",
      reviewRequired: true,
      reason: places.length > 0 && withPhones.length === 0 ? "no_phone" : "no_match",
      sourceMode: input.sourceMode,
    };
  }
  if (scored[1] && scored[0].score - scored[1].score < 10) {
    return {
      locationId: input.location.id,
      contacts: [],
      resolution: "unconfirmed",
      reviewRequired: true,
      reason: "ambiguous_provider_match",
      sourceMode: input.sourceMode,
    };
  }

  const selected = scored[0];
  const verifiedAt = (input.now ?? new Date()).toISOString();
  return {
    locationId: input.location.id,
    contacts: [{
      id: `${input.sourceMode === "fixture" ? "fixture" : "kakao-local"}:${selected.place.id}`,
      contactType: "place_contact",
      contactName: selected.place.name,
      phone: selected.place.phone!,
      source: input.sourceMode === "fixture" ? "SceneScan synthetic fixture" : "Kakao Local",
      sourceUrl: selected.place.placeUrl!,
      lastVerifiedAt: verifiedAt,
      verification: "provider_suggestion",
      providerPlaceId: selected.place.id,
      distanceMeters: selected.distanceMeters,
      matchBasis: [
        "name",
        ...(selected.addressMatched ? ["address" as const] : []),
        "coordinate",
        "facility_relationship",
      ],
    }],
    resolution: "provider_suggestion",
    reviewRequired: true,
    reason: "provider_contact_suggested",
    sourceMode: input.sourceMode,
  };
}
