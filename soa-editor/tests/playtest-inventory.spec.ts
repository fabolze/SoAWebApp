import { expect, test } from "@playwright/test";

test("playtest inventory exposes unique powers, comparisons, and set progress", async ({ page }) => {
  await page.goto("/playtest");
  await page.evaluate(() => {
    localStorage.setItem("soa.playtest.campaign.v4", JSON.stringify({
      version: 4,
      playerName: "Gearwright",
      location: "village",
      dayMinutes: 480,
      gold: 80,
      level: 2,
      xp: 20,
      talentPoints: 1,
      combatRole: "healer",
      combatSpec: "wardweaver",
      health: 100,
      inventory: { wornBlade: 1, tonic: 2, oathsplitter: 1, vowkeepersWrap: 1, pathfinderSeal: 1, fenwatchMantle: 1, riftwatchSpear: 1, resonanceCharm: 1 },
      equipment: { weapon: "wornBlade" },
      talents: [],
      lore: ["portalTaboo", "hearthmere"],
      questStage: "reach-forest",
      clearedEncounters: [],
      choices: [],
      playSeconds: 0,
      shopStock: {},
      companionJoined: true,
    }));
  });
  await page.reload();
  await page.getByRole("button", { name: /Continue journey/i }).click();
  await page.getByRole("button", { name: /Pack I/i }).click();

  await expect(page.getByRole("heading", { name: "Wayfarer's Pack" })).toBeVisible();
  await expect(page.getByText("Regalia of the Lost Path", { exact: true })).toBeVisible();
  await expect(page.getByText(/Wayfarer Strike also hits every other enemy/)).toBeVisible();
  await expect(page.getByText(/Compared with equipped:/).first()).toBeVisible();

  await page.locator("article").filter({ hasText: "Pathfinder's Seal" }).getByRole("button", { name: "Equip" }).click();
  await page.locator("article").filter({ hasText: "Fenwatch Mantle" }).getByRole("button", { name: "Equip" }).click();
  await expect(page.getByText("✦ Regalia of the Lost Path (2)")).toBeVisible();
  await expect(page.getByText("Quickstep grants 12 ward.")).toBeVisible();
});
