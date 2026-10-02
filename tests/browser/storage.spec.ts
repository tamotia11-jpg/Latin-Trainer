import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function sword(page: Page) {
  await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search vocabulary" })
    .fill("gladius");
  await page.locator(".word-row").click();
  await page
    .getByRole("button", { name: "Practise this direction" })
    .first()
    .click();
}
async function exported(page: Page) {
  await page.getByRole("button", { name: "Backup & data" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export progress" }).click();
  const file = await downloaded;
  return readFile((await file.path())!, "utf8");
}
test("reload preserves reviews; backup transfers to a separate browser", async ({
  page,
  browser,
}) => {
  await page.goto("./");
  await sword(page);
  await page.getByRole("textbox", { name: "Your answer" }).fill("sword");
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback .eyebrow")).toHaveText("Exact");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Resume saved session/ }),
  ).toHaveCount(0);
  const backup = JSON.parse(await exported(page));
  expect(backup.snapshot.states[0].skill).toBe("le");
  expect(backup.snapshot.attempts).toHaveLength(1);
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(page.url());
  await second.getByRole("button", { name: "Backup & data" }).click();
  await second.getByLabel("Import backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(second.getByRole("status")).toContainText("Validated backup");
  await second
    .getByRole("button", { name: "Replace progress with backup" })
    .click();
  await second.getByRole("button", { name: "Today", exact: true }).click();
  const restored = JSON.parse(await exported(second));
  expect(restored.snapshot).toEqual(backup.snapshot);
  await other.close();
});
test("invalid backup is rejected and review stays saved", async ({ page }) => {
  await page.goto("./");
  await sword(page);
  await page.getByRole("button", { name: "First-letter hint" }).click();
  await expect(page.locator(".hint")).toContainText("Starts with");
  await page.reload();
  await page.getByRole("button", { name: /Resume saved session/ }).click();
  await expect(page.locator(".hint")).toContainText("Assisted recall");
  await page.getByRole("textbox", { name: "Your answer" }).fill("sword");
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback .eyebrow")).toHaveText("Hinted");
  const before = JSON.parse(await exported(page));
  await page.getByLabel("Import backup").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{malformed"),
  });
  await expect(page.getByRole("alert")).toContainText("not valid JSON");
  expect(JSON.parse(await exported(page)).snapshot).toEqual(before.snapshot);
});
test("another tab cannot submit a stale question; reload recovers", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await sword(page);
  const second = await context.newPage();
  await second.goto(page.url());
  await second.getByRole("button", { name: /Resume saved session/ }).click();
  await second.getByRole("button", { name: "First-letter hint" }).click();
  await expect(second.locator(".hint")).toContainText("Starts with");
  await page.getByRole("textbox", { name: "Your answer" }).fill("sword");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Another tab");
  await expect(page.getByRole("textbox", { name: "Your answer" })).toHaveValue(
    "sword",
  );
  await page.getByRole("button", { name: "Reload saved progress" }).click();
  await expect(page.locator(".hint")).toContainText("Assisted recall");
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback .eyebrow")).toHaveText("Hinted");
  expect(JSON.parse(await exported(page)).snapshot.attempts).toHaveLength(1);
});
test("storage failure preserves the typed answer and does not claim success", async ({
  page,
}) => {
  await page.goto("./");
  await sword(page);
  await page.getByRole("textbox", { name: "Your answer" }).fill("sword");
  await page.evaluate(() => {
    indexedDB.open = () => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("storage is full");
  await expect(page.getByRole("textbox", { name: "Your answer" })).toHaveValue(
    "sword",
  );
  await expect(page.locator(".feedback")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /Resume saved session/ }).click();
  await page.getByRole("textbox", { name: "Your answer" }).fill("sword");
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback .eyebrow")).toHaveText("Exact");
  expect(JSON.parse(await exported(page)).snapshot.attempts).toHaveLength(1);
});
