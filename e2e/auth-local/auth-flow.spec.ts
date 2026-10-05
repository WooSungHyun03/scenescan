import { expect, test, type APIRequestContext } from "@playwright/test";

const mailpitBaseUrl = "http://127.0.0.1:54324";

async function waitForLatestAuthUrl(request: APIRequestContext, email: string): Promise<string> {
  const query = encodeURIComponent(`to:${email}`);
  let latestHtml = "";

  await expect.poll(async () => {
    const response = await request.get(`${mailpitBaseUrl}/view/latest.html?query=${query}`);
    if (!response.ok()) return false;
    latestHtml = await response.text();
    return /href=["'][^"']*\/auth\/v1\/verify[^"']*["']/u.test(latestHtml);
  }, { timeout: 15_000, intervals: [250, 500, 1_000] }).toBe(true);

  const match = latestHtml.match(/href=["']([^"']*\/auth\/v1\/verify[^"']*)["']/u);
  if (!match) throw new Error("Mailpit confirmation link was not found");
  return match[1].replaceAll("&amp;", "&");
}

test("가입·확인·로그인·recovery·재인증 비밀번호 변경이 안전하게 이어진다", async ({ page, context, request }) => {
  const email = `scenescan-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = `SceneScan-${crypto.randomUUID()}!`;
  const recoveredPassword = `Recovered-${crypto.randomUUID()}!`;
  const finalPassword = `Final-${crypto.randomUUID()}!`;

  await page.goto("/signup");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByLabel("비밀번호 확인").fill(password);
  await page.getByRole("button", { name: "회원가입", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("확인 메일을 보냈습니다");
  await expect(page.getByRole("button", { name: /초 후 다시 보내기/ })).toBeDisabled();
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("비밀번호 확인")).toHaveValue("");

  await page.getByRole("link", { name: "로그인", exact: true }).last().click();
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".scene-status[role=alert]")).toContainText("이메일 확인이 필요합니다");
  await expect(page.getByRole("button", { name: /초 후 다시 보내기/ })).toBeDisabled();

  const confirmationUrl = await waitForLatestAuthUrl(request, email);
  await page.goto(confirmationUrl);
  await expect(page).toHaveURL(/\/account\?confirmed=1$/);
  await expect(page.getByRole("heading", { level: 1, name: "계정 설정" })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "계정 설정" })).toBeVisible();

  const secondTab = await context.newPage();
  await secondTab.goto("/account");
  await expect(secondTab.getByText(email, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL("/");
  await secondTab.reload();
  await expect(secondTab).toHaveURL(/\/login\?next=%2Faccount$/);

  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.goto("/forgot-password");
  await page.getByLabel("가입 이메일").fill(email);
  await page.getByRole("button", { name: "재설정 메일 받기" }).click();
  await expect(page.getByRole("status")).toContainText("가입된 계정이라면");
  await expect(page.getByRole("button", { name: /초 후 다시 요청/ })).toBeDisabled();

  const recoveryUrl = await waitForLatestAuthUrl(request, email);
  await page.goto(recoveryUrl);
  await expect(page).toHaveURL(/\/recovery$/);
  expect(page.url()).not.toMatch(/code|token_hash|access_token/u);
  expect(await page.content()).not.toMatch(/token_hash|access_token/u);
  await page.getByLabel("새 비밀번호", { exact: true }).fill(recoveredPassword);
  await page.getByLabel("새 비밀번호 확인").fill(recoveredPassword);
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page).toHaveURL(/\/login\?passwordChanged=1$/);
  await expect(page.getByRole("status")).toContainText("모든 기기에서 로그아웃");

  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".scene-status[role=alert]")).toContainText("이메일 또는 비밀번호");

  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(recoveredPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.getByRole("link", { name: "계정 보안" }).click();
  await page.getByLabel("현재 비밀번호").fill("definitely-wrong-password");
  await page.getByLabel("새 비밀번호", { exact: true }).fill(finalPassword);
  await page.getByLabel("새 비밀번호 확인").fill(finalPassword);
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page.locator(".scene-status[role=alert]")).toContainText("현재 비밀번호");

  await page.getByLabel("현재 비밀번호").fill(recoveredPassword);
  await page.getByLabel("새 비밀번호", { exact: true }).fill(finalPassword);
  await page.getByLabel("새 비밀번호 확인").fill(finalPassword);
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page).toHaveURL(/\/login\?passwordChanged=1$/);

  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(recoveredPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".scene-status[role=alert]")).toContainText("이메일 또는 비밀번호");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(finalPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.evaluate(() => {
    window.localStorage.setItem(
      "scenescan.shortlist.location-ids.v1",
      JSON.stringify(["00000000-0000-4000-8000-000000000001"]),
    );
  });
  const staleAuthCookies = (await context.cookies()).filter(({ name }) => (
    name.startsWith("sb-") && name.includes("-auth-token")
  ));
  await page.getByRole("link", { name: "계정 보안" }).click();
  await page.getByLabel("현재 비밀번호").last().fill(finalPassword);
  await page.getByLabel(/확인을 위해/).fill("회원탈퇴");
  await page.getByRole("button", { name: "계정 영구 삭제" }).click();
  await expect(page).toHaveURL(/\/login\?accountDeleted=1$/);
  await expect(page.getByRole("status")).toContainText("회원탈퇴가 완료");
  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem("scenescan.shortlist.location-ids.v1")
  ))).toBeNull();

  // A copied pre-deletion JWT must not regain personal access. Access tokens
  // may survive until expiry, so the server's fresh getUser() check is the
  // authorization boundary after the Auth record has been removed.
  if (staleAuthCookies.length > 0) await context.addCookies(staleAuthCookies);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);

  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(finalPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".scene-status[role=alert]")).toContainText("이메일 또는 비밀번호");
});
