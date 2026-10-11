import { z } from "zod";

export const LOCATION_CONTACT_TYPE_VALUES = [
  "permit_contact",
  "management_contact",
  "place_contact",
] as const;

export const locationContactTypeSchema = z.enum(LOCATION_CONTACT_TYPE_VALUES);

const httpUrlSchema = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    context.addIssue({ code: "custom", message: "contact source URL must be a safe HTTP(S) URL" });
  }
});

const phoneSchema = z.string().trim().min(1).max(40)
  .regex(/^\+?[0-9][0-9() .-]{5,23}$/u)
  .refine((value) => {
    const count = value.replace(/\D/gu, "").length;
    return count >= 7 && count <= 15;
  }, "contact phone must contain 7 to 15 digits");

export const locationContactSchema = z.object({
  id: z.string().trim().min(1).max(200),
  contactType: locationContactTypeSchema,
  contactName: z.string().trim().min(1).max(200),
  phone: phoneSchema,
  source: z.string().trim().min(1).max(200),
  sourceUrl: httpUrlSchema,
  lastVerifiedAt: z.iso.datetime({ offset: true }),
  verification: z.enum(["official_reviewed", "provider_suggestion"]),
  providerPlaceId: z.string().regex(/^\d+$/u).nullable(),
  distanceMeters: z.number().int().nonnegative().nullable(),
  matchBasis: z.array(z.enum([
    "location_id",
    "name",
    "address",
    "coordinate",
    "facility_relationship",
  ])).min(1),
}).strict().superRefine((contact, context) => {
  if (contact.verification === "provider_suggestion" && contact.contactType !== "place_contact") {
    context.addIssue({
      code: "custom",
      path: ["contactType"],
      message: "provider suggestions can only be place_contact",
    });
  }
  if (contact.verification === "official_reviewed" && contact.providerPlaceId !== null) {
    context.addIssue({
      code: "custom",
      path: ["providerPlaceId"],
      message: "official reviewed contacts cannot carry a provider place ID",
    });
  }
});

export const locationContactsResponseSchema = z.object({
  locationId: z.string().uuid(),
  contacts: z.array(locationContactSchema).max(3),
  resolution: z.enum(["official", "provider_suggestion", "unconfirmed"]),
  reviewRequired: z.boolean(),
  reason: z.enum([
    "official_contact_available",
    "provider_contact_suggested",
    "ambiguous_provider_match",
    "large_site_requires_review",
    "provider_unavailable",
    "no_phone",
    "no_match",
  ]).nullable(),
  sourceMode: z.enum(["live", "fixture"]),
}).strict();

export type LocationContactType = z.infer<typeof locationContactTypeSchema>;
export type LocationContact = z.infer<typeof locationContactSchema>;
export type LocationContactsResponse = z.infer<typeof locationContactsResponseSchema>;
