import { expect, test } from "@playwright/test";

test("source discovery exposes evidence without offering installation", async ({
  page,
}, testInfo) => {
  await page.goto("/discover");
  await page
    .getByRole("textbox", { name: "Search repositories" })
    .fill("morluto/rea");
  await page
    .getByRole("list")
    .getByRole("button", { name: /^morluto\/rea/ })
    .click();
  const detail = page.getByRole("complementary", {
    name: "Repository details",
  });
  await expect(detail.getByText("Pending evaluation")).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Open source" }),
  ).toHaveAttribute("href", /github.com\/morluto\/rea\/tree\/[a-f0-9]{40}/);
  await expect(page.getByRole("button", { name: /^Install/ })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("directory.png"),
    fullPage: true,
  });
});

test("Library paginates the whole catalog and shows dated sourced stars", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const backendRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/(?:api|rpc)\//u.test(new URL(request.url()).pathname))
      backendRequests.push(request.url());
  });
  await page.goto("/discover?sort=stars");
  await page.getByRole("textbox", { name: "Search repositories" }).waitFor();
  await expect(page.getByRole("list").getByRole("listitem")).toHaveCount(30);
  await expect(page.getByText("30 / 796 repositories")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("list").getByRole("listitem")).toHaveCount(60);
  await page
    .getByRole("textbox", { name: "Search repositories" })
    .fill("react/react");
  await page
    .getByRole("list")
    .getByRole("button", { name: /^react\/react/ })
    .click();
  const details = page.getByRole("complementary", {
    name: "Repository details",
  });
  await expect(details.getByText("251,066")).toBeVisible();
  await expect(
    details.locator("time[datetime='2026-10-15T21:15:51.732703+00:00']"),
  ).toBeVisible();
  await expect(
    details.getByRole("link", { name: "Popularity source" }),
  ).toHaveAttribute("href", /^https:\/\/github.com\/search\?/u);
  await expect(
    details.getByText("Runtime ready", { exact: true }),
  ).toBeVisible();
  expect(backendRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("library-desktop.png") });
});

test("Saved persists without an account and filters survive details, reload and another tab", async ({
  page,
  context,
}) => {
  await page.goto("/discover");
  await page
    .getByRole("textbox", { name: "Search repositories" })
    .fill("image editor");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("images");
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("available");
  await page
    .getByRole("button", { name: "Save KDE/krita", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Library navigation" })
    .getByRole("button", { name: "Saved", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Search repositories" }),
  ).toHaveValue("image editor");
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).toHaveValue("images");
  await page
    .getByRole("list")
    .getByRole("button", { name: /^KDE\/krita/ })
    .click();
  await page.goBack();
  await expect(
    page.getByRole("button", {
      name: "Remove from Saved KDE/krita",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const other = await context.newPage();
  await other.goto("/discover?view=saved");
  await expect(
    other.getByRole("list").getByRole("button", { name: /^KDE\/krita/ }),
  ).toBeVisible();
  await other
    .getByRole("button", { name: "Remove from Saved KDE/krita", exact: true })
    .click();
  await expect(other.getByText("No saved repositories yet.")).toBeVisible();
  await expect(page.getByText("No saved repositories yet.")).toBeVisible();
  await other.close();
});

test("a failed browser save stays usable and does not claim persistence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "repositoryzero.library.saved.v1")
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  });
  await page.goto("/discover?q=image+editor");
  await page
    .getByRole("button", { name: "Save KDE/krita", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Browser storage is unavailable. Saved changes last until this page closes.",
  );
  await expect(
    page.getByRole("button", {
      name: "Remove from Saved KDE/krita",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("mobile details are a readable separate view with retained filters", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover?q=image+editor&category=images");
  await page
    .getByRole("list")
    .getByRole("button", { name: /^KDE\/krita/ })
    .click();
  const details = page.getByRole("complementary", {
    name: "Repository details",
  });
  await expect(
    details.getByRole("heading", { name: "KDE/krita" }),
  ).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Search repositories" }),
  ).not.toBeVisible();
  await expect(
    details.getByText("Unknown", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("library-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to results" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search repositories" }),
  ).toHaveValue("image editor");
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).toHaveValue("images");
  await expect(
    page.getByRole("list").getByRole("button", { name: /^KDE\/krita/ }),
  ).toBeFocused();
});

test("appearance persists and a missing capability has an honest empty state", async ({
  page,
}) => {
  await page.goto("/discover");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("combobox", { name: "Appearance" })
    .selectOption("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("textbox", { name: "Search repositories" })
    .fill("no-such-tool-8364781");
  await expect(
    page.getByText(
      "No matching candidate. Try another capability or category.",
    ),
  ).toBeVisible();
});
