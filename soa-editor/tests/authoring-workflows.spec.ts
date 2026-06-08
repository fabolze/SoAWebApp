import { expect, test, type Page, type Route } from "@playwright/test";

const emptyWorld = {
  locations: [],
  routes: [],
  pois: [],
  encounter_tables: [],
  route_event_bindings: [],
  travel_tuning: [],
  creative_briefs: [],
  events: [],
  encounters: [],
  quests: [],
  story_arcs: [],
  dialogues: [],
  warnings: [],
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockApi(page: Page, world = emptyWorld, onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/world_builder" && route.request().method() === "GET") {
      return fulfillJson(route, world);
    }
    if (url.pathname === "/api/ui/world_builder/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onBundle) return onBundle(payload, route);
      return fulfillJson(route, world);
    }
    return fulfillJson(route, []);
  });
}

test("character starter applies once and reset restores the unsaved bundle", async ({ page }) => {
  await mockApi(page);
  await page.goto("/author/characters/new");

  await page.getByRole("button", { name: "Standard Enemy" }).click();
  await page.getByRole("button", { name: "Apply Defaults" }).click();

  await expect(page.getByText("Combat characters need a class before saving.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save All" }).first()).toBeDisabled();
  await page.getByRole("button", { name: "Reset" }).first().click();
  await expect(page.getByRole("button", { name: "Add Combat Profile" })).toBeVisible();
});

test("world packet edits linked POIs through the atomic bundle", async ({ page }) => {
  const world = {
    ...emptyWorld,
    locations: [{
      id: "zone-1", slug: "zone-1", name: "Test Zone", location_type: "Zone", place_kind: "Wilderness",
      coordinates: { x: 50, y: 50 }, level_range: { min: 1, max: 3 }, tags: [], environment_tags: [],
    }],
  };
  let savedPayload: Record<string, unknown> | null = null;
  await mockApi(page, world, async (payload, route) => {
    savedPayload = payload;
    await fulfillJson(route, world);
  });
  await page.goto("/author/world?selected=zone-1");

  await page.getByText("Inline Location Packet").scrollIntoViewIfNeeded();
  await page.getByText("POIs / Interactables (0)").click();
  await page.getByRole("button", { name: "Add POI" }).click();
  await page.getByPlaceholder("POI name").fill("Hidden Shrine");
  await page.getByRole("button", { name: "Save Packet" }).click();

  await expect.poll(() => savedPayload).not.toBeNull();
  const pois = savedPayload?.pois as Array<Record<string, unknown>>;
  expect(pois[0].name).toBe("Hidden Shrine");
  expect(pois[0].location_id).toBe("zone-1");
});

test("world packet surfaces structured bundle error paths", async ({ page }) => {
  const world = {
    ...emptyWorld,
    locations: [{ id: "zone-1", slug: "zone-1", name: "Test Zone", coordinates: { x: 50, y: 50 }, tags: [], environment_tags: [] }],
  };
  await mockApi(page, world, async (_payload, route) => {
    await fulfillJson(route, { error: true, message: "Invalid encounter reference", path: "encounter_tables[0].encounter_entries[0].encounter_id" }, 400);
  });
  await page.goto("/author/world?selected=zone-1");

  await page.getByText("Inline Location Packet").scrollIntoViewIfNeeded();
  await page.getByText("Encounter Placement Tables (0)").click();
  await page.getByRole("button", { name: "Add Encounter Table" }).click();
  await page.getByRole("button", { name: "Add Encounter Row" }).click();
  await page.getByRole("button", { name: "Save Packet" }).click();

  await expect(page.getByText(/encounter_tables\[0\]\.encounter_entries\[0\]\.encounter_id/)).toBeVisible();
});
