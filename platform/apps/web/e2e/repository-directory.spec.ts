import { expect, test } from "@playwright/test";

test("source discovery exposes evidence without offering installation", async ({
  page,
}, testInfo) => {
  await page.goto("/discover");
  await page.getByRole("textbox", { name: "Search repositories" }).fill("morluto/rea");
  await page.getByRole("button", { name: /morluto\/rea/ }).click();
  const detail = page.getByRole("complementary", { name: "Repository details" });
  await expect(detail.getByText("Pending evaluation")).toBeVisible();
  await expect(detail.getByRole("link", { name: "Open source" })).toHaveAttribute(
    "href",
    /github.com\/morluto\/rea\/tree\/[a-f0-9]{40}/,
  );
  await expect(page.getByRole("button", { name: /^Install/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("directory.png"), fullPage: true });
});

test("appearance persists and a missing capability has an honest empty state", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("textbox", { name: "Search repositories" }).fill("no-such-tool-8364781");
  await expect(
    page.getByText("No matching candidate. Try another capability or category."),
  ).toBeVisible();
});
