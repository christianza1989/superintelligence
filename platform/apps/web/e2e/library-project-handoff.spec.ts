import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
const now = "2026-10-17T00:00:00.000Z";
async function mockWorkspace(page: Page, needsModel = false) {
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "fixture-user",
          email: "fixture@example.invalid",
          name: "Fixture",
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: "fixture-session",
          userId: "fixture-user",
          token: "fixture-only",
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  );
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({
      json: {
        sso: null,
        passwordAuth: true,
        passwordReset: false,
        resetUrl: null,
        billing: false,
      },
    }),
  );
  const me = {
    userId: "fixture-user",
    email: "fixture@example.invalid",
    name: "Fixture",
    spaceId: "fixture-space",
    isDeploymentOwner: true,
    needsModel,
    ticketBoardEnabled: false,
    defaultProvider: null,
    defaultModel: null,
    hostCredentialProvider: null,
    hostCredentialSource: null,
    computerHost: null,
    canChooseHostComputer: false,
    sandboxProvider: "fake",
    avatarStyle: "robot",
    billingEnabled: false,
  };
  await page.route("**/rpc/bootstrap", (route) =>
    route.fulfill({
      json: {
        json: {
          me,
          bots: [
            {
              id: "agent-one",
              name: "Planning agent",
              threadId: "target-thread",
            },
          ],
          groups: [],
          botSections: [],
          archivedBots: [],
          archivedGroups: [],
          thread: null,
          routines: [],
          spaces: [],
        },
      },
    }),
  );
  await page.route("**/rpc/me", (route) =>
    route.fulfill({ json: { json: me } }),
  );
}

test("Library hands a reviewed source plan to an explicitly started task with a stable retry receipt", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockWorkspace(page);
  const prepareInputs: Record<string, unknown>[] = [];
  const sends: Record<string, unknown>[] = [];
  await page.route("**/rpc/library/prepare", async (route) => {
    const input = route.request().postDataJSON().json as Record<
      string,
      unknown
    >;
    prepareInputs.push(input);
    await route.fulfill({
      json: {
        json: {
          artifactId: "plan-artifact",
          botId: "agent-one",
          threadId: "target-thread",
          candidateId: "KDE/krita",
          role: input.role,
          clientNonce: input.clientNonce,
          planSha256: "f".repeat(64),
          planningOnly: true,
        },
      },
    });
  });
  await page.route("**/rpc/threads/send", async (route) => {
    sends.push(route.request().postDataJSON().json as Record<string, unknown>);
    if (sends.length === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      json: {
        json: {
          taskId: "actual-task-fixture",
          runId: "actual-run-fixture",
          seq: 3,
        },
      },
    });
  });
  await page.goto("/discover?q=image+editor&language=C%2B%2B&sort=indexed");
  await page
    .getByRole("list")
    .getByRole("button", { name: /^KDE\/krita/ })
    .click();
  await page.getByText("Start project", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project handoff" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Repository role" })
    .selectOption("component");
  await page
    .getByRole("textbox", { name: "Project brief" })
    .fill("Plan a local image workflow.");
  expect(prepareInputs).toEqual([]);
  expect(sends).toEqual([]);
  await page
    .getByRole("button", { name: "Save reuse plan", exact: true })
    .click();
  await expect(
    page.getByText("Plan saved. No task has started."),
  ).toBeVisible();
  expect(prepareInputs[0]).toMatchObject({
    candidateId: "KDE/krita",
    role: "component",
    brief: "Plan a local image workflow.",
    botId: "agent-one",
  });
  expect(prepareInputs[0]).not.toHaveProperty("sourceRevision");
  expect(sends).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Project brief" }),
  ).toHaveValue("Plan a local image workflow.");
  await page
    .getByRole("button", { name: "Save reuse plan", exact: true })
    .click();
  await expect(
    page.getByText("Plan saved. No task has started."),
  ).toBeVisible();
  expect(prepareInputs[1]?.clientNonce).toBe(prepareInputs[0]?.clientNonce);
  await page
    .getByRole("button", { name: "Start planning task", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Start planning task", exact: true })
    .click();
  await expect(page.getByText("Task accepted", { exact: true })).toBeVisible();
  expect(sends).toHaveLength(2);
  expect(sends[1]?.clientNonce).toBe(sends[0]?.clientNonce);
  expect(sends[1]).toMatchObject({
    botId: "agent-one",
    artifactIds: ["plan-artifact"],
    clientNonce: "library-task-" + prepareInputs[0]?.clientNonce,
  });
  expect(sends[1]?.text).toContain("Plan a local image workflow.");
  await expect(
    page.getByRole("link", { name: "Open conversation" }),
  ).toHaveAttribute("href", "/app/agent-one");
  await expect(
    page.getByRole("link", { name: "Open reuse plan" }),
  ).toHaveAttribute("href", "/app/artifacts/plan-artifact");
  await page.getByText("Task receipt", { exact: true }).click();
  await expect(
    page.getByText("actual-task-fixture", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("target-thread", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("library-handoff-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("library-handoff-mobile.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("link", { name: "Back to Library" }),
  ).toHaveAttribute("href", /language=C%2B%2B&sort=indexed/u);
});

test("saving a plan with no model never offers or dispatches a run", async ({
  page,
}) => {
  await mockWorkspace(page, true);
  let sends = 0;
  await page.route("**/rpc/threads/send", async (route) => {
    sends++;
    await route.abort();
  });
  await page.route("**/rpc/library/prepare", async (route) => {
    const input = route.request().postDataJSON().json;
    await route.fulfill({
      json: {
        json: {
          artifactId: "plan-artifact",
          botId: "agent-one",
          threadId: "target-thread",
          candidateId: "KDE/krita",
          role: input.role,
          clientNonce: input.clientNonce,
          planSha256: "f".repeat(64),
          planningOnly: true,
        },
      },
    });
  });
  await page.goto("/app/library/start?repo=KDE%2Fkrita");
  await page
    .getByRole("textbox", { name: "Project brief" })
    .fill("Investigate a component.");
  await page
    .getByRole("button", { name: "Save reuse plan", exact: true })
    .click();
  await expect(
    page.getByText("Connect a model in the workspace before starting a task."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start planning task" }),
  ).toHaveCount(0);
  expect(sends).toBe(0);
});

test("sign-in preserves only the selected public repository destination", async ({
  page,
}) => {
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({
      json: {
        sso: null,
        passwordAuth: true,
        passwordReset: false,
        resetUrl: null,
      },
    }),
  );
  await page.goto(
    "/app/library/start?repo=KDE%2Fkrita&redirect=https://evil.invalid",
  );
  await expect(page).toHaveURL(/\/sign-in\?next=/u);
  const next = new URL(page.url()).searchParams.get("next");
  expect(next).toBe("/app/library/start?repo=KDE%2Fkrita");
});
