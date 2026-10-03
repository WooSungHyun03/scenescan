import type { ProductionRows } from "./production-importer.ts";

export type AttributionLinkKind = "location-source" | "image-source" | "license";

export type AttributionLinkReference = {
  kind: AttributionLinkKind;
  recordId: string;
  locationId: string;
};

export type AttributionLink = {
  url: string;
  references: AttributionLinkReference[];
};

export type AttributionLinkStatus = "reachable" | "broken" | "unverified";

export type AttributionLinkResult = AttributionLink & {
  status: AttributionLinkStatus;
  httpStatus: number | null;
  error: string | null;
};

export type AttributionLinkReport = {
  checkedAt: string;
  summary: {
    urls: number;
    reachable: number;
    broken: number;
    unverified: number;
  };
  results: AttributionLinkResult[];
};

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function addLink(
  links: Map<string, AttributionLinkReference[]>,
  url: string | null,
  reference: AttributionLinkReference,
): void {
  if (!url) return;
  const references = links.get(url) ?? [];
  references.push(reference);
  links.set(url, references);
}

export function collectAttributionLinks(rows: ProductionRows): AttributionLink[] {
  const links = new Map<string, AttributionLinkReference[]>();
  for (const location of rows.locations) {
    addLink(links, location.source_url, {
      kind: "location-source",
      recordId: location.id,
      locationId: location.id,
    });
    addLink(links, location.license_url, {
      kind: "license",
      recordId: location.id,
      locationId: location.id,
    });
  }
  for (const image of rows.images) {
    addLink(links, image.source_url, {
      kind: "image-source",
      recordId: image.id,
      locationId: image.location_id,
    });
    addLink(links, image.license_url, {
      kind: "license",
      recordId: image.id,
      locationId: image.location_id,
    });
  }
  return [...links.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([url, references]) => ({ url, references }));
}

function classifyResponse(link: AttributionLink, response: Response): AttributionLinkResult {
  if (response.ok || (response.status >= 300 && response.status < 400)) {
    return { ...link, status: "reachable", httpStatus: response.status, error: null };
  }
  if (response.status === 404 || response.status === 410) {
    return { ...link, status: "broken", httpStatus: response.status, error: null };
  }
  return {
    ...link,
    status: "unverified",
    httpStatus: response.status,
    error: `HTTP ${response.status}`,
  };
}

async function probeAttributionLink(
  link: AttributionLink,
  fetcher: Fetcher,
  timeoutMs: number,
): Promise<AttributionLinkResult> {
  const request = async (method: "HEAD" | "GET") => fetcher(link.url, {
    method,
    redirect: "follow",
    headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  try {
    let response = await request("HEAD");
    if ([403, 404, 405, 410].includes(response.status)) response = await request("GET");
    return classifyResponse(link, response);
  } catch (error) {
    return {
      ...link,
      status: "unverified",
      httpStatus: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function checkAttributionLinks(
  links: AttributionLink[],
  options: {
    concurrency?: number;
    timeoutMs?: number;
    fetcher?: Fetcher;
    checkedAt?: string;
  } = {},
): Promise<AttributionLinkReport> {
  const concurrency = options.concurrency ?? 8;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error("link check concurrency must be an integer between 1 and 32");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    throw new Error("link check timeout must be an integer between 100 and 60000 milliseconds");
  }

  const results = new Array<AttributionLinkResult>(links.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, links.length) }, async () => {
    while (nextIndex < links.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await probeAttributionLink(links[index], options.fetcher ?? fetch, timeoutMs);
    }
  });
  await Promise.all(workers);

  const count = (status: AttributionLinkStatus) => results.filter((result) => result.status === status).length;
  return {
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    summary: {
      urls: results.length,
      reachable: count("reachable"),
      broken: count("broken"),
      unverified: count("unverified"),
    },
    results,
  };
}
