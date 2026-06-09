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

const dialoguePacket = {
  dialogue: { id: "dialogue-1", slug: "dialogue-1", title: "Gate Talk", description: "", tags: [] },
  nodes: [
    { id: "node-1", slug: "node-1", dialogue_id: "dialogue-1", speaker: "Guide", text: "Choose.", choices: [{ choice_text: "Enter", next_node_id: "node-2", requirements_id: "req-1", set_flags: [] }], set_flags: [], tags: [] },
    { id: "node-2", slug: "node-2", dialogue_id: "dialogue-1", speaker: "Guide", text: "Welcome.", choices: [], set_flags: [], tags: [] },
  ],
  requirements: [{ id: "req-1", slug: "req-1", required_flags: ["flag-1"], forbidden_flags: [], min_faction_reputation: [] }],
  flags: [{ id: "flag-1", slug: "flag-1", name: "Allowed", description: "", default_value: false, tags: [] }],
  factions: [],
  context: { interaction_profiles: [], events: [], pois: [], character: null, location: null },
};

async function mockDialogueApi(page: Page, onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dialogues") return fulfillJson(route, [dialoguePacket.dialogue]);
    if (url.pathname === "/api/ui/dialogues/dialogue-1") return fulfillJson(route, dialoguePacket);
    if (url.pathname === "/api/ui/dialogues/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onBundle) return onBundle(payload, route);
      return fulfillJson(route, dialoguePacket);
    }
    if (url.pathname === "/api/requirements") return fulfillJson(route, dialoguePacket.requirements);
    if (url.pathname === "/api/flags") return fulfillJson(route, dialoguePacket.flags);
    if (url.pathname === "/api/factions") return fulfillJson(route, []);
    return fulfillJson(route, []);
  });
}

test("dialogue flow sketches, connects, and saves a complete bundle", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await mockDialogueApi(page, async (payload, route) => {
    saved = payload;
    const nodes = payload.nodes as Array<Record<string, unknown>>;
    await fulfillJson(route, { ...dialoguePacket, dialogue: payload.dialogue, nodes });
  });
  await page.goto("/author/dialogues/dialogue-1");

  await page.getByRole("button", { name: "Sketch" }).click();
  await page.getByTestId("dialogue-canvas").dblclick({ position: { x: 500, y: 300 } });
  await expect(page.getByText("3 nodes /")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Flow" })).toBeDisabled();
  await page.getByLabel("Dialogue Text").fill("A newly drafted line.");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByTestId("dialogue-node-node-2").click();
  await page.getByTestId("dialogue-node-node-1").click();
  await page.getByRole("button", { name: "Save Flow" }).click();

  await expect.poll(() => saved).not.toBeNull();
  expect((saved?.nodes as unknown[]).length).toBe(3);
});

test("dialogue flow restores drafts and unlocks gated choices in playthrough", async ({ page }) => {
  await mockDialogueApi(page);
  await page.goto("/author/dialogues/dialogue-1");
  await page.getByTestId("dialogue-node-node-1").click();
  await page.getByLabel("Dialogue Text").fill("Unsaved changed line");
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.getByText("Restored unsaved dialogue flow draft.")).toBeVisible();
  await expect(page.getByLabel("Dialogue Text")).toHaveValue("Unsaved changed line");

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enter" })).toBeDisabled();
  await page.getByText("Temporary Player State").click();
  await page.getByLabel("Flags Set").selectOption(["flag-1"]);
  await expect(page.getByRole("button", { name: "Enter" })).toBeEnabled();
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByText("Welcome.").last()).toBeVisible();
});

test("dialogue flow reset clears the persisted draft", async ({ page }) => {
  await mockDialogueApi(page);
  await page.goto("/author/dialogues/dialogue-1");
  await page.getByTestId("dialogue-node-node-1").click();
  await page.getByLabel("Dialogue Text").fill("Discard this line");
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "Reset" }).click();
  await page.reload();
  await expect(page.getByLabel("Dialogue Text")).toHaveValue("Choose.");
  await expect(page.getByText("Restored unsaved dialogue flow draft.")).not.toBeVisible();
});

test("new dialogue draft survives a full reload", async ({ page }) => {
  await mockDialogueApi(page);
  await page.goto("/author/dialogues/new");
  await page.getByLabel("Title").fill("Reloadable New Dialogue");
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.getByText("Restored unsaved dialogue flow draft.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Reloadable New Dialogue");
});
