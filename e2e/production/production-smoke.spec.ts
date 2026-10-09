import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { chooseEvaluationImage } from "../helpers";

type FailureClassification =
  | "external-outage"
  | "model-cold-load"
  | "flaky-timeout"
  | "product-regression";

type SmokePhase = "health" | "navigation" | "clip" | "kakao" | "complete";

type ExternalFailure = {
  method: string;
  url: string;
  status?: number;
  error?: string;
};

type SmokeDiagnostics = {
  baseUrl: string;
  startedAt: string;
  phase: SmokePhase;
  status: "running" | "passed" | "failed";
  durationMs?: number;
  healthStatus?: number;
  healthPayload?: unknown;
  modelColdLoadObserved: boolean;
  clipAssetRequestCount: number;
  searchApiStatus?: number;
  resultCount?: number;
  mapMode?: string | null;
  kakaoMarkerCount?: number;
  externalFailures: ExternalFailure[];
  failureClassification?: FailureClassification;
  failureMessage?: string;
};

class SmokeFailure extends Error {
  constructor(
    readonly classification: FailureClassification,
    message: string,
  ) {
    super(message);
    this.name = "SmokeFailure";
  }
}

function safeRequestUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function inferFailure(
  error: unknown,
  diagnostics: SmokeDiagnostics,
): SmokeFailure {
  if (error instanceof SmokeFailure) return error;

  const message = errorMessage(error);
  if (diagnostics.externalFailures.length > 0) {
    return new SmokeFailure("external-outage", message);
  }
  if (diagnostics.phase === "health" || diagnostics.phase === "navigation") {
    return new SmokeFailure("external-outage", message);
  }
  if (diagnostics.phase === "kakao") {
    return new SmokeFailure(
      diagnostics.mapMode === "kakao"
        ? "product-regression"
        : "external-outage",
      message,
    );
  }
  if (diagnostics.phase === "clip" && diagnostics.modelColdLoadObserved) {
    return new SmokeFailure("model-cold-load", message);
  }
  if (/timeout|timed out/i.test(message)) {
    return new SmokeFailure("flaky-timeout", message);
  }
  return new SmokeFailure("product-regression", message);
}

async function attachDiagnostics(
  testInfo: TestInfo,
  diagnostics: SmokeDiagnostics,
) {
  const path = testInfo.outputPath("production-smoke-diagnostics.json");
  await writeFile(path, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
  await testInfo.attach("production-smoke-diagnostics", {
    path,
    contentType: "application/json",
  });
}

async function installVercelBypass(page: Page, baseUrl: string) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) return;

  const origin = new URL(baseUrl).origin;
  await page.route(`${origin}/**`, async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass": secret,
      },
    });
  });
}

test("real CLIP 검색, Kakao marker, API health가 정상이다", async ({
  page,
  request,
}, testInfo) => {
  const baseUrl = process.env.PRODUCTION_BASE_URL?.trim() || "https://beceleb.org";
  const startedAt = Date.now();
  const diagnostics: SmokeDiagnostics = {
    baseUrl,
    startedAt: new Date(startedAt).toISOString(),
    phase: "health",
    status: "running",
    modelColdLoadObserved: false,
    clipAssetRequestCount: 0,
    externalFailures: [],
  };

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const healthHeaders = bypassSecret
    ? { "x-vercel-protection-bypass": bypassSecret }
    : undefined;

  page.on("requestfailed", (failedRequest) => {
    const failureText = failedRequest.failure()?.errorText ?? "request failed";
    // Next.js cancels speculative route prefetches during normal navigation.
    // Those ERR_ABORTED requests are not an external service outage.
    if (failureText.includes("ERR_ABORTED")) return;
    diagnostics.externalFailures.push({
      method: failedRequest.method(),
      url: safeRequestUrl(failedRequest.url()),
      error: failureText,
    });
  });
  page.on("request", (outgoingRequest) => {
    const hostname = new URL(outgoingRequest.url()).hostname;
    if (
      hostname === "huggingface.co" ||
      hostname.endsWith(".huggingface.co") ||
      hostname.endsWith(".hf.co")
    ) {
      diagnostics.clipAssetRequestCount += 1;
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/api/search") {
      diagnostics.searchApiStatus = response.status();
    }
    if (response.status() >= 500) {
      diagnostics.externalFailures.push({
        method: response.request().method(),
        url: safeRequestUrl(response.url()),
        status: response.status(),
      });
    }
  });

  try {
    const healthResponse = await request.get(
      new URL("/api/health", baseUrl).toString(),
      { headers: healthHeaders, timeout: 30_000 },
    );
    diagnostics.healthStatus = healthResponse.status();
    diagnostics.healthPayload = await healthResponse.json().catch(() => null);
    if (!healthResponse.ok()) {
      throw new SmokeFailure(
        "external-outage",
        `API health returned HTTP ${healthResponse.status()}`,
      );
    }
    expect(diagnostics.healthPayload).toEqual({
      status: "healthy",
      service: "scenescan",
    });

    diagnostics.phase = "navigation";
    await installVercelBypass(page, baseUrl);
    const navigationResponse = await page.goto("/search", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!navigationResponse?.ok()) {
      throw new SmokeFailure(
        "external-outage",
        `Search page returned HTTP ${navigationResponse?.status() ?? "unknown"}`,
      );
    }
    await expect(
      page.getByRole("heading", { level: 1, name: "부산 촬영 장소 찾기" }),
    ).toBeVisible();

    diagnostics.phase = "clip";
    if (
      !(await page
        .getByText("사진은 기기에서 분석하며 서버에 저장하지 않습니다.", {
          exact: true,
        })
        .isVisible())
    ) {
      throw new SmokeFailure(
        "product-regression",
        "Production is not exposing the real-data search mode",
      );
    }
    // Use the real upload control so a cold SSR page cannot lose a file
    // change event dispatched before React attaches its handlers.
    await chooseEvaluationImage(page);
    await page.getByRole("button", { name: "이 이미지로 장소 찾기" }).click();

    const loadingModel = page.getByText("이미지 분석 준비 중…", { exact: true });
    const resultHeading = page.getByRole("heading", {
      name: /^추천 장소 \d+곳$/,
    });
    const searchAlert = page
      .getByRole("alert")
      .filter({ hasText: /이미지|모델|네트워크|장소 데이터|검색 서버/ })
      .first();
    const searchDeadline = Date.now() + 135_000;

    while (Date.now() < searchDeadline) {
      if (await loadingModel.isVisible().catch(() => false)) {
        diagnostics.modelColdLoadObserved = true;
      }
      if (await resultHeading.isVisible().catch(() => false)) break;
      if (await searchAlert.isVisible().catch(() => false)) {
        const alertText = (await searchAlert.innerText()).trim();
        const classification =
          diagnostics.externalFailures.length ||
          /네트워크|장소 데이터|검색 서버/.test(alertText)
          ? "external-outage"
          : diagnostics.modelColdLoadObserved || /이미지 분석|모델/.test(alertText)
            ? "model-cold-load"
            : "product-regression";
        throw new SmokeFailure(classification, alertText);
      }
      await page.waitForTimeout(1_000);
    }

    if (!(await resultHeading.isVisible().catch(() => false))) {
      throw new SmokeFailure(
        diagnostics.modelColdLoadObserved
          ? "model-cold-load"
          : "flaky-timeout",
        diagnostics.modelColdLoadObserved
          ? "CLIP cold load did not finish within 135 seconds"
          : "Search did not finish within 135 seconds without a model-loading signal",
      );
    }

    const headingText = (await resultHeading.innerText()).trim();
    diagnostics.resultCount = Number(headingText.match(/(\d+)곳/)?.[1]);
    if (
      !Number.isInteger(diagnostics.resultCount) ||
      diagnostics.resultCount < 1 ||
      diagnostics.resultCount > 8
    ) {
      throw new SmokeFailure(
        "product-regression",
        `Real CLIP result count must be 1-8, received ${String(diagnostics.resultCount)}`,
      );
    }
    if (diagnostics.searchApiStatus !== 200) {
      throw new SmokeFailure(
        diagnostics.searchApiStatus && diagnostics.searchApiStatus >= 500
          ? "external-outage"
          : "product-regression",
        `Search API status must be 200, received ${String(diagnostics.searchApiStatus)}`,
      );
    }
    if (diagnostics.clipAssetRequestCount < 1) {
      throw new SmokeFailure(
        "product-regression",
        "No Hugging Face model asset request was observed; production may still be using mock AI",
      );
    }

    diagnostics.phase = "kakao";
    await page.getByRole("button", { name: "지도", exact: true }).click();
    const map = page.getByRole("region", { name: "검색 결과 장소 분포 지도" });
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute("data-map-mode", /^(kakao|mock)$/);
    diagnostics.mapMode = await map.getAttribute("data-map-mode");
    if (diagnostics.mapMode !== "kakao") {
      throw new SmokeFailure(
        "external-outage",
        "Kakao SDK or its production JavaScript key/domain registration is unavailable",
      );
    }
    const mapMarkers = map.locator('button[aria-label$=" 위치"]');
    await expect(mapMarkers.first()).toBeVisible();
    diagnostics.kakaoMarkerCount = await mapMarkers.count();
    if (diagnostics.kakaoMarkerCount < 1) {
      throw new SmokeFailure("product-regression", "Kakao map rendered no marker");
    }

    diagnostics.phase = "complete";
    diagnostics.status = "passed";
    diagnostics.durationMs = Date.now() - startedAt;
    if (diagnostics.modelColdLoadObserved) {
      testInfo.annotations.push({
        type: "model-cold-load",
        description: `Cold load observed; smoke completed in ${diagnostics.durationMs}ms`,
      });
    }
    await attachDiagnostics(testInfo, diagnostics);
  } catch (error) {
    const failure = inferFailure(error, diagnostics);
    diagnostics.status = "failed";
    diagnostics.durationMs = Date.now() - startedAt;
    diagnostics.failureClassification = failure.classification;
    diagnostics.failureMessage = failure.message;
    testInfo.annotations.push({
      type: "failure-classification",
      description: failure.classification,
    });
    await attachDiagnostics(testInfo, diagnostics);
    throw new Error(`[${failure.classification}] ${failure.message}`, {
      cause: error,
    });
  }
});
