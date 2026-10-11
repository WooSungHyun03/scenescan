import { z } from "zod";
import reviewedContactData from "../../../../data/production/busan-contacts.reviewed.json";
import { getStraightLineDistanceMeters } from "./parking-distance";
import { locationContactTypeSchema, type LocationContact } from "@/types/location-contact";
import type { Location } from "@/types/domain";

const pointSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

const relationshipSchema = z.enum([
  "filming_permission",
  "manages_location",
  "represents_location",
]);

const reviewedContactFileSchema = z.object({
  schemaVersion: z.literal(1),
  reviewedAt: z.iso.datetime({ offset: true }),
  locations: z.array(z.object({
    locationId: z.string().uuid(),
    canonicalName: z.string().trim().min(1),
    aliases: z.array(z.string().trim().min(1)),
    address: z.string().trim().min(1),
    point: pointSchema,
    scale: z.enum(["bounded", "large"]),
    contacts: z.array(z.object({
      contactType: locationContactTypeSchema,
      contactName: z.string().trim().min(1),
      phone: z.string().trim().min(1),
      facilityRelationship: relationshipSchema,
      source: z.string().trim().min(1),
      sourceUrl: z.string().url().refine((value) => value.startsWith("https://")),
      lastVerifiedAt: z.iso.datetime({ offset: true }),
    }).strict()).min(1).max(3),
  }).strict()).superRefine((locations, context) => {
    const ids = new Set<string>();
    for (const [index, location] of locations.entries()) {
      if (ids.has(location.locationId)) {
        context.addIssue({ code: "custom", path: [index, "locationId"], message: "duplicate reviewed location" });
      }
      ids.add(location.locationId);
      const types = new Set<string>();
      for (const [contactIndex, contact] of location.contacts.entries()) {
        if (types.has(contact.contactType)) {
          context.addIssue({ code: "custom", path: [index, "contacts", contactIndex, "contactType"], message: "duplicate contact type" });
        }
        types.add(contact.contactType);
        const expected = contact.contactType === "permit_contact"
          ? "filming_permission"
          : contact.contactType === "management_contact"
            ? "manages_location"
            : "represents_location";
        if (contact.facilityRelationship !== expected) {
          context.addIssue({
            code: "custom",
            path: [index, "contacts", contactIndex, "facilityRelationship"],
            message: `${contact.contactType} requires ${expected}`,
          });
        }
      }
    }
  }),
}).strict();

export type ReviewedContactFile = z.infer<typeof reviewedContactFileSchema>;
export type ReviewedLocationContacts = ReviewedContactFile["locations"][number];

export function parseReviewedContactFile(value: unknown): ReviewedContactFile {
  return reviewedContactFileSchema.parse(value);
}

export const busanReviewedContacts = parseReviewedContactFile(reviewedContactData);

function normalizeName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu, "");
}

function significantAddressTokens(value: string): string[] {
  return value.normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !["대한민국", "부산", "부산광역시"].includes(token));
}

function addressMatches(locationAddress: string, reviewedAddress: string): boolean {
  const locationTokens = new Set(significantAddressTokens(locationAddress));
  const reviewedTokens = significantAddressTokens(reviewedAddress);
  return reviewedTokens.some((token) => locationTokens.has(token));
}

export function findReviewedLocationContacts(
  location: Location,
  file: ReviewedContactFile = busanReviewedContacts,
): { contacts: LocationContact[]; scale: "bounded" | "large" } | null {
  const reviewed = file.locations.find((item) => item.locationId === location.id);
  if (!reviewed) return null;

  const acceptedNames = [reviewed.canonicalName, ...reviewed.aliases].map(normalizeName);
  const nameMatched = acceptedNames.includes(normalizeName(location.name));
  const distance = getStraightLineDistanceMeters(location.point, reviewed.point);
  const coordinateMatched = distance !== null && distance <= 500;
  const addressMatched = addressMatches(location.address, reviewed.address);

  // The stable ID alone is insufficient: a reviewed row must still agree with
  // the place name and at least one physical-location signal.
  if (!nameMatched || (!coordinateMatched && !addressMatched)) return null;

  return {
    scale: reviewed.scale,
    contacts: reviewed.contacts.map((contact) => ({
      id: `reviewed:${location.id}:${contact.contactType}`,
      contactType: contact.contactType,
      contactName: contact.contactName,
      phone: contact.phone,
      source: contact.source,
      sourceUrl: contact.sourceUrl,
      lastVerifiedAt: contact.lastVerifiedAt,
      verification: "official_reviewed",
      providerPlaceId: null,
      distanceMeters: null,
      matchBasis: [
        "location_id",
        "name",
        ...(addressMatched ? ["address" as const] : []),
        ...(coordinateMatched ? ["coordinate" as const] : []),
        "facility_relationship",
      ],
    })),
  };
}
