import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Snapshot } from "../../src/domain/types";
const legacy = JSON.parse(
  await readFile(
    new URL("../fixtures/published-v1-backup.json", import.meta.url),
    "utf8",
  ),
);

test("fresh start immediately opens ten Latin-to-English questions", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Choose your practice." }),
  ).toBeVisible();
  await expect(
    page.locator(
      ".resume, .stat-grid, .skill-meter, .section-progress, .storage-note",
    ),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your answer" }),
  ).toBeVisible();
  await expect(page.locator(".session-meta")).toContainText("1 / 10");
  await expect(page.locator(".card-topline")).toContainText("Latin → English");
  await expect(
    page.getByRole("textbox", { name: "Your answer" }),
  ).toBeFocused();
});

test("published v1 unfinished session and history survive opening; new practice stays available", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(async (snapshot) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("gcse-latin-mastery", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("progress");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("progress", "readwrite");
        tx.objectStore("progress").put({ revision: 7, snapshot }, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, legacy.snapshot);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose your practice." }),
  ).toBeVisible();
  await expect(
    page.locator(".resume, .stat-grid, .skill-meter, .section-progress"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Backup & data" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export progress" }).click();
  const file = await downloaded;
  expect(
    JSON.parse(await readFile((await file.path())!, "utf8")).snapshot,
  ).toEqual(legacy.snapshot);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your answer" }),
  ).toBeVisible();
  const saved = await page.evaluate(
    async () =>
      new Promise<Snapshot>((resolve, reject) => {
        const request = indexedDB.open("gcse-latin-mastery", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("progress");
          const get = tx.objectStore("progress").get("current");
          get.onsuccess = () => resolve(get.result.snapshot);
          tx.oncomplete = () => db.close();
        };
      }),
  );
  expect(saved.states).toEqual(legacy.snapshot.states);
  expect(saved.attempts).toEqual(legacy.snapshot.attempts);
  expect(saved.confusions).toEqual(legacy.snapshot.confusions);
  expect(saved.activeSession!.settings.mode).toBe("custom");
  expect(saved.activeSession!.settings.direction).toBe("le");
});
