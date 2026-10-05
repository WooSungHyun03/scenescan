import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "./proxy";

describe("Next.js auth proxy matcher", () => {
  it.each(["/", "/search", "/locations/location-1", "/api/search"])(
    "covers application request %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    },
  );

  it.each([
    "/_next/static/chunk.js",
    "/_next/image?url=%2Fhero.jpg&w=640&q=75",
    "/favicon.ico",
    "/locations/hero.jpg",
  ])("skips static request %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });
});
