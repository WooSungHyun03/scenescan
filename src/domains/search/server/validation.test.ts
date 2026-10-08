import { describe, expect, it } from "vitest";
import { searchRequestSchema } from "@/types/contracts";
import { describeSearchRequestError } from "./validation";

function messageFor(body: unknown): string {
  const parsed = searchRequestSchema.safeParse(body);
  if (parsed.success) throw new Error("expected validation to fail");
  return describeSearchRequestError(parsed.error);
}

const validEmbedding = () => Array(512).fill(0).map((_, index) => (index === 0 ? 1 : 0));

describe("describeSearchRequestError", () => {
  it("describes an embedding with the wrong length", () => {
    expect(messageFor({ embedding: Array(511).fill(0.1) })).toBe(
      "이미지 임베딩 값이 올바르지 않습니다. 512개의 유효한 숫자로 이루어진 벡터여야 합니다.",
    );
    expect(messageFor({ embedding: Array(513).fill(0.1) })).toContain("512개");
  });

  it("describes a non-finite or non-numeric embedding value", () => {
    expect(messageFor({ embedding: [...validEmbedding().slice(1), Number.NaN] })).toContain("임베딩");
    expect(messageFor({ embedding: [...Array(511).fill(0), "not-a-number"] })).toContain("임베딩");
  });

  it("describes an all-zero embedding", () => {
    expect(messageFor({ embedding: Array(512).fill(0) })).toContain("임베딩");
  });

  it("describes a disallowed region without naming the field internally", () => {
    const message = messageFor({ embedding: validEmbedding(), filters: { region: "평양" } });
    expect(message).toBe("허용되지 않는 지역입니다.");
  });

  it("describes a disallowed district without naming the field internally", () => {
    const message = messageFor({ embedding: validEmbedding(), filters: { district: "seoul_jung_gu" } });
    expect(message).toBe("허용되지 않는 구/군입니다.");
  });

  it("describes a disallowed category", () => {
    const message = messageFor({ embedding: validEmbedding(), filters: { category: "space" } });
    expect(message).toBe("허용되지 않는 카테고리입니다.");
  });

  it("describes an out-of-range threshold", () => {
    expect(messageFor({ embedding: validEmbedding(), threshold: 1.5 })).toBe("threshold 값은 0에서 1 사이여야 합니다.");
    expect(messageFor({ embedding: validEmbedding(), threshold: -0.1 })).toBe("threshold 값은 0에서 1 사이여야 합니다.");
  });

  it("accepts threshold at its inclusive boundaries (0 and 1)", () => {
    expect(searchRequestSchema.safeParse({ embedding: validEmbedding(), threshold: 0 }).success).toBe(true);
    expect(searchRequestSchema.safeParse({ embedding: validEmbedding(), threshold: 1 }).success).toBe(true);
  });

  it("silently ignores a client-supplied count -- match_count is a fixed server constant, not a request field", () => {
    const parsed = searchRequestSchema.safeParse({ embedding: validEmbedding(), count: 9999 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "count" in parsed.data).toBe(false);
  });

  it("never echoes the raw Zod issue text", () => {
    const parsed = searchRequestSchema.safeParse({ embedding: Array(511).fill(0.1) });
    if (parsed.success) throw new Error("expected failure");
    const message = describeSearchRequestError(parsed.error);
    expect(message).not.toContain("too_small");
    expect(message).not.toContain("array");
  });
});
