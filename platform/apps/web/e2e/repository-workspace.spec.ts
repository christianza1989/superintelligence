import { expect, test } from "@playwright/test";
import { completeOnboarding, createBotFromPicker, signup } from "./helpers";

test.skip(
  process.env.REPOSITORYZERO_BACKEND_TEST !== "1",
  "Requires the migrated local API/worker profile",
);

test("a local account opens a real persistent workspace without model credentials", async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  const password = "example-test-password-8364";
  await signup(page, `foundation-${stamp}@example.test`, password, "Foundation test");
  try {
    await completeOnboarding(page);
    await createBotFromPicker(page, {
      name: "Reuse research",
      description: "Find existing foundations and compare source evidence before building.",
    });
    await expect(page.getByText("Reuse research", { exact: true }).first()).toBeVisible();
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByText("Reuse research", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("workspace.png"), fullPage: true });
  } finally {
    // Use the authenticated deletion path so bot files and first-owner state
    // are cleaned along with this synthetic account, without resetting the DB.
    const response = await page.request.post("/api/auth/delete-user", {
      data: { password },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(response.ok(), "synthetic account cleanup").toBe(true);
    expect(await response.json()).toMatchObject({ success: true });
  }
});
