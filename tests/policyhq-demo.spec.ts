import { expect, test } from "@playwright/test";

test.describe("PolicyHQ public and demo smoke checks", () => {
  test("landing page exposes sign-in, sign-up, and demo entry points", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try Live Demo" }).first()).toBeVisible();
  });

  test("demo dashboard shows the main operational panels", async ({ page }) => {
    await page.goto("/demo");

    await expect(page.getByRole("heading", { name: /Good (Morning|Afternoon|Evening), Agent/ })).toBeVisible();
    await expect(page.getByText("Revenue Protection")).toBeVisible();
    await expect(page.getByText("Relationship Manager")).toBeVisible();
    await expect(page.getByRole("link", { name: /Missing Statement/i })).toBeVisible();
  });

  test("dashboard prospects card surfaces overdue follow-ups", async ({ page }) => {
    await page.goto("/demo");

    const prospectsCard = page.locator('a[href="/demo/prospects?filter=overdue"]');
    await expect(prospectsCard).toContainText("1 overdue");
    await prospectsCard.click();

    await expect(page).toHaveURL(/\/demo\/prospects\?filter=overdue/);
    await expect(page.getByText("Mavis Nartey")).toBeVisible();
    await expect(page.getByText("Selina Osei")).toHaveCount(0);
  });

  test("demo navigation pages render without dead surfaces", async ({ page }) => {
    const pages = [
      { path: "/demo/clients", heading: "Clients", text: "Import Clients" },
      { path: "/demo/prospects", heading: "Prospects", text: "Add Prospect" },
      { path: "/demo/policies", heading: "Policies", text: "Add Policy" },
      { path: "/demo/commissions", heading: "Commissions", text: "Commission Records" },
      { path: "/demo/renewals/week", heading: /renewal/i, text: "Back to Dashboard" }
    ];

    for (const item of pages) {
      await page.goto(item.path);
      await expect(page.getByRole("heading", { name: item.heading }).first()).toBeVisible();
      await expect(page.getByText(item.text).first()).toBeVisible();
    }
  });

  test("lapse shield CSV review flags missing life policies", async ({ page }) => {
    await page.goto("/demo/lapse-shield");

    await expect(page.getByRole("heading", { name: "Lapse Shield" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Statement Review" })).toBeVisible();

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "statement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("policy_number,client_name\nLIFE-0001,Known Client\n")
    });

    await expect(page.getByText("Missing from statement")).toBeVisible();
    await expect(page.getByText("Statement Summary")).toBeVisible();
  });

  test("mobile demo dashboard keeps key panels accessible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/demo");

    await expect(page.getByRole("heading", { name: /Good (Morning|Afternoon|Evening), Agent/ })).toBeVisible();
    await expect(page.getByText("Relationship Manager")).toBeVisible();
    await expect(page.getByRole("link", { name: /Prospects/i }).first()).toBeVisible();
  });
});
