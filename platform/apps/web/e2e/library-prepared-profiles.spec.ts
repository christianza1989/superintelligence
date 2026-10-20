import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`Library keeps prepared profile facts separate at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/discover");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("en");
    await expect(page.getByRole("heading", { name: "Prepared components" })).toBeVisible();
    await expect(page.getByText("30 / 796 repositories", { exact: false })).toBeVisible();
    await page
      .getByRole("textbox", { name: "Search repositories", exact: true })
      .fill("CSV parser");
    await expect(page.getByRole("heading", { name: "Prepared components" })).toBeVisible();
    const summary = page.locator("summary").filter({ hasText: "CSV parser" });
    await summary.press("Enter");
    await expect(page.getByText("d3-dsv-3.0.1/strict-table-v1", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Development checks passed for this profile. Your project has not been verified.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Project execution requires a separate grant. Independent holdout not run."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "d3/d3-dsv", exact: true })).toHaveAttribute(
      "href",
      "https://github.com/d3/d3-dsv",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await testInfo.attach(`prepared-profile-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page.getByRole("combobox", { name: "Source", exact: true }).selectOption("available");
    await expect(page.getByRole("heading", { name: "Prepared components" })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await page.getByRole("button", { name: "Saved", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Prepared components" })).toHaveCount(0);
    await expect(page.getByText("No saved repositories yet.")).toBeVisible();
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search repositories", exact: true })
      .fill("CSV streaming");
    await expect(page.getByRole("heading", { name: "Prepared components" })).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "Search repositories", exact: true })
      .fill("CSV parser");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("ru");
    await expect(page.getByRole("heading", { name: "Подготовленные компоненты" })).toBeVisible();
    await expect(page.getByText("Парсер CSV", { exact: true })).toBeVisible();
  });
}
