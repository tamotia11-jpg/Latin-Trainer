import { test, expect } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`motion preference ${reducedMotion} keeps recall immediately usable`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("./");
    await expect(
      page.getByRole("button", { name: "GCSE Latin Trainer home" }),
    ).toContainText("GCSE Latin Trainer");
    await expect(page.locator(".brand-mark")).toHaveCount(0);
    await page.evaluate(async () => {
      await document.fonts.ready;
      // Let the initial font render finish before observing practice motion.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await page.evaluate(() => {
      const shifts: number[] = [];
      Object.assign(window, { motionLayoutShifts: shifts });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          // CLS excludes expected page changes immediately after user input.
          if (!shift.hadRecentInput) shifts.push(shift.value);
        }
      }).observe({ type: "layout-shift", buffered: false });
    });
    await page
      .getByRole("button", { name: "Start practice", exact: true })
      .click();
    const input = page.getByRole("textbox", { name: "Your answer" });
    await expect(input).toBeFocused();
    const viewport = page.viewportSize()!;
    await input.fill("draft");
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(input).toHaveValue("draft");
    await expect(input).toBeFocused();
    await page.setViewportSize(viewport);
    const questionMotion = await page
      .locator(".question-enter")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(questionMotion).toBe(
      reducedMotion === "reduce" ? "none" : "question-enter",
    );
    await input.fill("wrong");
    await page.keyboard.press("Enter");
    const next = page.getByRole("button", { name: "Next question" });
    await expect(next).toBeFocused();
    const feedbackMotion = await page
      .locator(".feedback")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(feedbackMotion).toBe(
      reducedMotion === "reduce" ? "none" : "feedback-enter",
    );
    await page.keyboard.press("Enter");
    await expect(input).toBeFocused();
    await expect(page.locator(".session-meta")).toContainText("2 /");
    await expect
      .poll(() =>
        page
          .locator(".recall-card")
          .evaluate((el) => getComputedStyle(el).transform),
      )
      .toBe("none");
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { motionLayoutShifts: number[] }
        ).motionLayoutShifts.reduce((a, b) => a + b, 0),
      ),
    ).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`whole-app transitions survive interrupted navigation with ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("./");
    for (const label of [
      "Practice",
      "Vocabulary",
      "Confusions",
      "Start",
      "Practice",
      "Start",
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.locator(".nav button[aria-current='page']")).toHaveText(
        label,
      );
      expect(
        await page
          .locator("main")
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe(reducedMotion === "reduce" ? "none" : "view-enter");
    }
    await page.getByRole("button", { name: "Custom practice" }).click();
    const section = page.locator(".section-picker button").first();
    await section.click();
    await expect(section).toHaveAttribute("aria-pressed", "false");
    await section.click();
    await expect(section).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Questions").fill("2");
    await expect(page.getByLabel("Questions")).toBeFocused();
    await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
    const search = page.getByRole("textbox", { name: "Search vocabulary" });
    for (const text of ["g", "gl", "gladius"]) await search.fill(text);
    await expect(search).toBeFocused();
    await expect(page.locator(".word-row")).toHaveCount(1);
    expect(
      await page
        .locator(".vocabulary-list")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe(reducedMotion === "reduce" ? "none" : "list-enter");
    await page
      .getByRole("button", { name: "Hide meanings", exact: true })
      .click();
    await expect(page.locator(".word-row")).toContainText("Meaning hidden");
    await page
      .getByRole("button", { name: "Show meanings", exact: true })
      .click();
    const word = page.locator(".word-row");
    for (let i = 0; i < 3; i++) {
      await word.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(
        await page
          .getByRole("dialog")
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe(reducedMotion === "reduce" ? "none" : "dialog-enter");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(word).toBeFocused();
    }
    await word.click();
    await page
      .getByRole("button", { name: "Practise this direction", exact: true })
      .first()
      .click();
    const answer = page.getByRole("textbox", { name: "Your answer" });
    await expect(answer).toBeFocused();
    await answer.fill("sword");
    await page.keyboard.press("Enter");
    await expect(page.locator(".feedback .eyebrow")).toHaveText("Exact");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Practice results", exact: true }),
    ).toBeVisible();
    expect(
      await page
        .locator("main")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe(reducedMotion === "reduce" ? "none" : "view-enter");
    await page
      .getByRole("button", { name: "Backup & data", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Keep what you learn." }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export progress", exact: true })
      .click();
    expect((await download).suggestedFilename()).toContain(
      "gcse-latin-trainer",
    );
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Choose your practice." }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
