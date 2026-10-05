import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual(await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.clientWidth,
  })));
}

test("키가 없는 공개 모드에서도 회원 화면과 보호 경계가 안전하게 동작한다", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  await expect(page.getByRole("heading", { level: 1, name: "로그인" })).toBeVisible();

  await page.getByLabel("이메일").fill("person@example.com");
  await page.getByLabel("비밀번호").fill("test-password-only");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".scene-status[role=alert]")).toContainText("인증 서비스가 아직 설정되지 않았습니다");
  await expect(page.getByLabel("비밀번호")).toHaveValue("");

  await page.getByRole("link", { name: "회원가입", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Faccount$/);
  await expect(page.getByRole("heading", { level: 1, name: "회원가입" })).toBeVisible();
});

test("callback은 외부 redirect를 허용하지 않고 만료 상태를 구분한다", async ({ page }) => {
  await page.goto("/auth/callback?error_code=otp_expired&next=https%3A%2F%2Fevil.example%2Fsteal");

  await expect(page).toHaveURL(/\/login\?error=callback_expired&next=%2Faccount%3Fconfirmed%3D1$/);
  await expect(page.locator(".scene-status[role=alert]")).toContainText("인증 링크가 만료되었거나 이미 사용되었습니다");
  const finalUrl = new URL(page.url());
  expect(["127.0.0.1", "localhost"]).toContain(finalUrl.hostname);
  expect(finalUrl.port).toBe("3110");
});

test("키가 없어도 비밀번호 찾기와 recovery 보호 경계가 안전하다", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { level: 1, name: "비밀번호 찾기" })).toBeVisible();
  await page.getByLabel("가입 이메일").fill("unknown@example.test");
  await page.getByRole("button", { name: "재설정 메일 받기" }).click();
  await expect(page.locator(".scene-status[role=alert]")).toContainText("인증 서비스가 아직 설정되지 않았습니다");

  await page.goto("/auth/recovery?error_code=otp_expired&token_hash=must-not-survive");
  await expect(page).toHaveURL(/\/forgot-password\?error=recovery_expired$/);
  expect(page.url()).not.toContain("token_hash");
  expect(await page.content()).not.toContain("must-not-survive");

  await page.goto("/recovery");
  await expect(page).toHaveURL(/\/forgot-password\?error=recovery_expired$/);
});

test("키가 없는 공개 모드에서 회원탈퇴 API는 admin 경계를 열지 않는다", async ({ page }) => {
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-SceneScan-CSRF": "account-delete-v1",
      },
      body: JSON.stringify({ currentPassword: "test-password", confirmation: "회원탈퇴" }),
    });
    return { status: response.status, body: await response.json() };
  });

  expect(result.status).toBe(401);
  expect(result.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  expect(result.body).not.toHaveProperty("deleted");
});

for (const width of [320, 390, 768, 1440]) {
  test(`${width}px 회원 화면에 가로 넘침이 없고 탐색 링크 이름이 유지된다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/login");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("link", { name: "장소 찾기" })).toBeVisible();
    await expect(page.getByRole("link", { name: "관심 장소" })).toBeVisible();
    await expect(page.getByRole("link", { name: "로그인", exact: true }).first()).toBeVisible();

    await page.getByRole("link", { name: "회원가입", exact: true }).click();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel("비밀번호 확인")).toBeVisible();

    await page.goto("/forgot-password");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: "재설정 메일 받기" })).toBeVisible();
  });
}
