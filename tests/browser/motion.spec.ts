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
