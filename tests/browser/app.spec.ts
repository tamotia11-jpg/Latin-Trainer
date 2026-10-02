import { test, expect } from "@playwright/test";
test("home and complete vocabulary work at each viewport", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "A little Latin, remembered." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
  await expect(page.locator(".word-row")).toHaveCount(450);
  await page
    .getByRole("textbox", { name: "Search vocabulary" })
    .fill("consilium");
  await expect(page.locator(".word-row")).toHaveCount(1);
  await page.locator(".word-row").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "consilium", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("typed exact, wrong, hint and bounded repeat; keyboard next", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search vocabulary" })
    .fill("gladius");
  await page.locator(".word-row").click();
  await page
    .getByRole("button", { name: "Practise this direction" })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Your answer" }).fill("sword");
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback .eyebrow")).toHaveText("Exact");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Recall, measured." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See my progress" }).click();
  await page.getByRole("button", { name: "Custom practice" }).click();
  await page.getByLabel("Skill", { exact: true }).selectOption("el");
  await page.getByLabel("Questions").fill("2");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page.getByRole("button", { name: "First-letter hint" }).click();
  await expect(page.locator(".hint")).toContainText("Starts with");
  await page.getByRole("textbox", { name: "Your answer" }).fill("wrong");
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback .eyebrow")).toHaveText("Hinted");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "I don’t know", exact: true }).click();
  await expect(page.locator(".feedback .eyebrow")).toHaveText("Skipped");
  await page.keyboard.press("Enter");
  await expect(page.locator(".card-topline")).toContainText("Returning word");
});
test("learn introduction and exam diagnosis have different behavior", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Learn new words" }).click();
  await page.getByLabel("Questions").fill("1");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Try active recall" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try active recall" }).click();
  await expect(
    page.getByRole("textbox", { name: "Your answer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Exam test" }).click();
  await page.getByLabel("Questions").fill("1");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page.getByRole("button", { name: "I don’t know" }).click();
  await expect(page.locator(".feedback .eyebrow")).toHaveText(
    "Answer recorded",
  );
  await expect(page.locator(".feedback .meaning")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Recall, measured." }),
  ).toBeVisible();
});
test("keyboard MCQ, flashcards and dark mode", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Custom practice" }).click();
  await page.getByLabel("Answer format").selectOption("mcq");
  await page.getByLabel("Questions").fill("1");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(page.locator(".options button")).toHaveCount(4);
  await page.keyboard.press("1");
  await expect(page.locator(".feedback")).toBeVisible();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByLabel("Answer format").selectOption("flash");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flip flashcard" }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".feedback .eyebrow")).toHaveText("Introduced");
});

test("accessibility on home, practice and word details", async ({ page }) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const theme of ["light", "dark"]) {
    await page.goto("./");
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle dark mode" }).click();
    for (const screen of ["home", "practice", "detail"]) {
      if (screen === "practice")
        await page.getByRole("button", { name: "Custom practice" }).click();
      if (screen === "detail") {
        await page
          .getByRole("button", { name: "Vocabulary", exact: true })
          .click();
        await page.locator(".word-row").first().click();
      }
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
    }
  }
});
