import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  accountDeletionRequestSchema,
  searchRequestSchema,
} from "./contracts";

const validEmbedding = () => [1, ...new Array(511).fill(0)];

describe("searchRequestSchema", () => {
  it("accepts a finite non-zero 512-dimensional embedding", () => {
    expect(searchRequestSchema.safeParse({ embedding: validEmbedding(), filters: {} }).success)
      .toBe(true);
  });

  it("rejects malformed dimensions, non-finite values, and zero norm", () => {
    expect(searchRequestSchema.safeParse({ embedding: [1], filters: {} }).success).toBe(false);
    const nonFinite = validEmbedding();
    nonFinite[20] = Number.NaN;
    expect(searchRequestSchema.safeParse({ embedding: nonFinite, filters: {} }).success).toBe(false);
    expect(searchRequestSchema.safeParse({ embedding: new Array(512).fill(0), filters: {} }).success)
      .toBe(false);
  });
});

describe("accountDeletionRequestSchema", () => {
  it("accepts only a transient current password and the exact confirmation phrase", () => {
    expect(accountDeletionRequestSchema.safeParse({
      currentPassword: "current-password",
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }).success).toBe(true);
  });

  it("rejects an arbitrary user id and incomplete confirmation", () => {
    expect(accountDeletionRequestSchema.safeParse({
      currentPassword: "current-password",
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      userId: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(false);
    expect(accountDeletionRequestSchema.safeParse({
      currentPassword: "current-password",
      confirmation: "동의",
    }).success).toBe(false);
  });
});
