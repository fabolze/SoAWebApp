import { expect, test } from "@playwright/test";

test("veteran boss lab supports sets, uniques, and a live party meter", async ({ page }) => {
  await page.goto("/playtest");
  await page.getByRole("button", { name: /Veteran Boss Lab/i }).click();

  await expect(page.getByRole("heading", { name: "Veteran Boss Lab" })).toBeVisible();
  await expect(page.getByText("Active skill loadout")).toBeVisible();
  await expect(page.getByText("6/6 equipped")).toBeVisible();
  await page.locator(".pt-lab-skill-loadout").getByRole("button", { name: /Rapid Volley/i }).click();
  await expect(page.getByText("5/6 equipped")).toBeVisible();
  await page.locator(".pt-lab-skill-loadout").getByRole("button", { name: /Expose Rift/i }).click();
  await expect(page.getByText("6/6 equipped")).toBeVisible();
  await page.getByRole("button", { name: /Riftwatch Spear/i }).click();
  await page.getByRole("button", { name: /Fenwatch Mantle/i }).click();
  await page.getByRole("button", { name: /Pathfinder's Seal/i }).click();

  await expect(page.getByText("Active item powers")).toBeVisible();
  await expect(page.getByText(/Regalia of the Lost Path \(2\).*45 ward/)).toBeVisible();
  await expect(page.getByText(/Regalia of the Lost Path \(3\).*15% more damage/)).toBeVisible();

  await page.getByRole("button", { name: /Challenge Vaelith/i }).click();
  await expect(page.getByText("Live combat meter")).toBeVisible();
  await expect(page.locator(".pt-veteran-top").getByText(/party DPS/)).toBeVisible();
  await expect(page.locator(".pt-veteran-top").getByText(/party HPS/)).toBeVisible();
  await expect(page.getByText("You", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Expose Rift/i })).toBeVisible();
  await page.getByRole("button", { name: /Begin veteran encounter/i }).click();
  await page.waitForTimeout(5_500);
  const companionDps = (await page.locator(".pt-veteran-meter>div:not(.player)>span:first-of-type b").allTextContents()).map(Number);
  expect(companionDps).toHaveLength(3);
  expect(companionDps.every((value) => value >= 10)).toBe(true);
});
