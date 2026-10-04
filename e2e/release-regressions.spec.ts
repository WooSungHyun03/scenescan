import { expect, test } from "@playwright/test";
import { chooseEvaluationImage, collectPageErrors } from "./helpers";

test("filter candidates outside the initial browse page do not short-circuit search", async ({ page }) => {
  const errors = collectPageErrors(page);
  const response = await page.request.get("/api/locations?limit=50");
  const { locations } = await response.json();
  const candidate = { ...locations[0], name: "페이지 밖 제주 후보", region: "제주" };
  await page.route("**/api/locations?**", (route) => route.fulfill({ json: { locations: [candidate], filters: { region: "제주" } } }));
  let apiCalls = 0;
  await page.route("**/api/search", (route) => {
    apiCalls++;
    return route.fulfill({ json: { results: [{ location: candidate, similarity: 0.8, matchedImageId: candidate.images[0].id }] } });
  });
  await page.goto("/search");
  await chooseEvaluationImage(page);
  await page.getByLabel("지역").selectOption("제주");
  await expect(page.getByText(/제주 · 전체 공간에 등록된 장소 1곳/)).toBeVisible();
  await page.getByRole("button", { name: "이 이미지로 장소 찾기" }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();
  expect(apiCalls).toBe(1);
  expect(errors).toEqual([]);
});

test("saved IDs are resolved explicitly and unregistered external images do not crash cards", async ({ page }) => {
  const errors = collectPageErrors(page);
  const { locations } = await (await page.request.get("/api/locations?limit=50")).json();
  const candidate = { ...locations[0], id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "첫 페이지 밖 저장 장소", images: [{ ...locations[0].images[0], imageUrl: "https://unregistered.invalid/image.jpg" }] };
  await page.addInitScript((id) => localStorage.setItem("scenescan.shortlist.location-ids.v1", JSON.stringify(["demo-01", id])), candidate.id);
  await page.route("**/api/locations?**", async (route) => {
    expect(new URL(route.request().url()).searchParams.getAll("id")).toEqual([candidate.id]);
    await route.fulfill({ json: { locations: [candidate], filters: {} } });
  });
  await page.goto("/shortlist");
  await expect(page.getByRole("heading", { name: candidate.name })).toBeVisible();
  await expect(page.getByText(/찾을 수 없는 장소가 1곳/)).toBeVisible();
  await expect(page.getByText("사진을 불러올 수 없습니다", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
