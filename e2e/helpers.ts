import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

export const evaluationImagePath = resolve(
  process.cwd(),
  "scripts/embeddings/evaluation-images/queries/demo-01-query.png",
);

export async function chooseEvaluationImage(page: Page) {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /참고 이미지 (선택|업로드)/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(evaluationImagePath);
  await expect(page.getByAltText("선택한 참고 이미지")).toBeVisible();
}

export async function dropEvaluationImage(page: Page) {
  const fileBase64 = readFileSync(evaluationImagePath).toString("base64");
  const dataTransfer = await page.evaluateHandle(
    ({ base64 }) => {
      const binary = window.atob(base64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], "demo-01-query.png", { type: "image/png" }),
      );
      return transfer;
    },
    { base64: fileBase64 },
  );

  await page
    .getByRole("button", { name: "참고 이미지 업로드" })
    .dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();
  await expect(page.getByAltText("선택한 참고 이미지")).toBeVisible();
}

export function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
