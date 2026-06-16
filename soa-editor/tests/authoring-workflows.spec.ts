import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { AUTHORING_MODES } from "../src/config/authoringModes";

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

async function mockApi(
  page: Page,
  world = emptyWorld,
  onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
  onStoryPlacementBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
) {
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
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, storyTimelinePacket);
    if (url.pathname === "/api/ui/adventure-timeline/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] });
    }
    if (url.pathname === "/api/ui/adventure-timeline/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onStoryPlacementBundle) return onStoryPlacementBundle(payload, route);
      return fulfillJson(route, { result: { review: { created: [], changed: [], deleted: [] }, warnings: [], blockers: [] }, packet: storyTimelinePacket });
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

test("character studio exposes an understandable creation path and editable story beats", async ({ page }) => {
  await mockApi(page);
  await page.goto("/author/characters/new");

  await expect(page.getByText("Create This Character")).toBeVisible();
  await page.getByLabel("Name").fill("New");
  await page.getByLabel("Name").press("Space");
  await expect(page.getByLabel("Name")).toHaveValue("New ");
  await page.getByLabel("Name").pressSequentially("Character");
  await expect(page.getByLabel("Name")).toHaveValue("New Character");
  await page.getByRole("button", { name: /Story Core/ }).click();
  await expect(page.getByLabel("want")).toBeVisible();
  await page.getByRole("button", { name: "Add Story Beat" }).click();
  await page.getByLabel("Beat Title").fill("First");
  await page.getByLabel("Beat Title").press("Space");
  await expect(page.getByLabel("Beat Title")).toHaveValue("First ");
  await page.getByLabel("Beat Title").pressSequentially("Appearance");
  await page.getByLabel("Beat Type").selectOption("Entrance");
  await expect(page.getByText("First Appearance")).toBeVisible();
  await expect(page.getByText("Required Before")).toBeVisible();
  await expect(page.getByText("Must Not Be True")).toBeVisible();
  await expect(page.getByText("Expected After")).toBeVisible();
  await expect(page.getByText(/Link a quest, dialogue, encounter/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save All" })).toBeEnabled();
});

test("roadmap authoring routes render without replacing rich item authoring", async ({ page }) => {
  await mockApi(page);
  await page.goto("/author/quests");
  await expect(page.getByRole("heading", { name: "Quest Journey Board" })).toBeVisible();
  await page.goto("/author/dependencies");
  await expect(page.getByRole("heading", { name: "Adventure Dependency Map" })).toBeVisible();
  await page.goto("/author/story-timeline");
  await expect(page.getByRole("heading", { name: "Story Timeline & Adventure Board" })).toBeVisible();
});

test("quest journey board places the quest into story as player journey", async ({ page }) => {
  const questPacket = {
    quest: {
      id: "quest-1", slug: "arrival", title: "Arrival", description: "Reach the city.",
      objectives: [{ objective_id: "reach-city", description: "Reach the city.", requirements_id: "", flags_set: [] }],
      flags_set_on_completion: [], item_rewards: [], currency_rewards: [], reputation_rewards: [], tags: [],
    },
    requirements: [],
    arc: { story_arc_id: "arc-1", related_quests: ["quest-1"], branches: [] },
    quest_giver_profile_ids: [],
    flags: [],
    interaction_profiles: [],
    dependency_context: { prerequisites: [], aftermath: [] },
    quests: [{ id: "quest-1", title: "Arrival" }],
    story_arcs: [{ id: "arc-1", title: "The First City" }],
  };
  let saved: Record<string, unknown> | null = null;
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/quests/quest-1") return fulfillJson(route, questPacket);
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, storyTimelinePacket);
    if (url.pathname === "/api/ui/adventure-timeline/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] });
    }
    if (url.pathname === "/api/ui/adventure-timeline/bundle" && route.request().method() === "POST") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      const links = saved.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, {
        result: { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] },
        packet: {
          ...storyTimelinePacket,
          entity_tracks: {
            ...storyTimelinePacket.entity_tracks,
            quests: [{
              id: links[0].id,
              entity_kind: "quest",
              entity_id: "quest-1",
              label: "Arrival",
              timeline_id: "timeline-1",
              story_arc_id: "arc-1",
              source_kind: "adventure_beat",
              source_id: "adventure-beat-1",
              source_label: "Enter The First City",
              order: 0,
              role: links[0].role,
              occurrence_kind: links[0].occurrence_kind,
              change_type: links[0].change_type,
              importance: links[0].importance,
            }],
          },
        },
      });
    }
    return fulfillJson(route, []);
  });

  await page.goto("/author/quests/quest-1");
  await expect(page.getByRole("heading", { name: "Quest Journey Board" })).toBeVisible();
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("quest");
  expect(link.target_id).toBe("quest-1");
  expect(link.role).toBe("player_journey");
  expect(link.occurrence_kind).toBe("appearance");
  expect(link.change_type).toBe("active");
  expect(link.importance).toBe("major");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City");
});

test("story timeline sketches and restores local planning beats through drag and drop", async ({ page }) => {
  await mockStoryTimelineApi(page);
  await page.goto("/author/story-timeline");

  await expect(page.getByTestId("timeline-band-timeline-1")).toBeVisible();
  await expect(page.getByTestId("canonical-placement-arc-quest:arc-1:quest-1")).toContainText("Arrival");
  await expect(page.getByTestId("canonical-placement-character-story-beat:beat-1")).toContainText("Guide Welcomes The Player");
  await expect(page.getByTestId("canonical-placement-adventure-beat:adventure-beat-1")).toContainText("Enter The First City");

  await dragWithPointer(page, page.getByRole("button", { name: "Drag to timeline" }).first(), page.getByTestId("story-arc-lane-arc-1"));
  const localBeat = page.locator('[data-testid^="local-planning-beat-"]').first();
  await expect(localBeat).toContainText("First City");
  await expect(page.getByTestId("story-timeline-context-dock").getByLabel("Title")).toHaveValue("First City");

  await page.locator("select").filter({ has: page.locator('option[value="events"]') }).selectOption("events");
  await page.getByRole("button", { name: "Attach to Selected Beat" }).click();
  await expect(page.getByTestId("story-timeline-context-dock")).toContainText("runtime / event");
  await expect(page.getByTestId("story-timeline-context-dock")).toContainText("Welcome Event");
  await page.waitForFunction(() => localStorage.getItem("soa.story-timeline.local-plan.v1")?.includes("First City"));

  await page.reload();
  await expect(page.locator('[data-testid^="local-planning-beat-"]').first()).toContainText("First City");
  await page.getByRole("button", { name: "Clear Local Plan" }).click();
  await expect(page.locator('[data-testid^="local-planning-beat-"]')).toHaveCount(0);
});

test("story timeline previews and commits local beats as one canonical bundle", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await mockStoryTimelineApi(page, async (payload, route) => {
    saved = payload;
    await fulfillJson(route, { result: { review: { created: [], changed: [], deleted: [] }, warnings: [], blockers: [] }, packet: storyTimelinePacket });
  });
  await page.goto("/author/story-timeline");

  await dragWithPointer(page, page.getByRole("button", { name: "Drag to timeline" }).first(), page.getByTestId("story-arc-lane-arc-1"));
  await page.getByLabel("Beat Type").selectOption("Introduction");
  await page.getByRole("button", { name: "Review & Commit Plan" }).click();
  await expect(page.getByTestId("story-timeline-plan-review")).toContainText("2 created");
  await page.getByTestId("story-timeline-plan-review").getByRole("button", { name: "Commit Plan", exact: true }).click();

  await expect.poll(() => saved).not.toBeNull();
  const beats = saved?.adventure_beats as Array<Record<string, unknown>>;
  const links = saved?.adventure_beat_links as Array<Record<string, unknown>>;
  expect(beats[0].beat_type).toBe("Introduction");
  expect(beats[0].story_arc_id).toBe("arc-1");
  expect(links[0].target_type).toBe("location");
  expect(links[0].role).toBe("setting");
  await expect(page.locator('[data-testid^="local-planning-beat-"]')).toHaveCount(0);
});

test("home and sidebar expose every specialized authoring workspace", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  const homeGroup = page.locator("main section").filter({ hasText: "Authoring Modes" });
  await expect(homeGroup).toBeVisible();
  for (const mode of AUTHORING_MODES) {
    await expect(homeGroup.getByRole("link", { name: mode.label })).toHaveAttribute("href", mode.route);
  }

  const sidebarGroup = page.locator("nav").getByText("Authoring Modes").locator("..").locator("..");
  for (const mode of AUTHORING_MODES) {
    await expect(sidebarGroup.getByTitle(mode.label)).toHaveAttribute("href", mode.route);
  }
});

test("item ecosystem edits acquisition sources and saves one atomic bundle", async ({ page }) => {
  const packet = {
    item: { id: "item-1", slug: "blade", name: "Blade", type: "Weapon", rarity: "Rare", base_price: 100, effects: [], stat_modifiers: [], attribute_modifiers: [], tags: [] },
    requirement: null,
    sources: { shop_inventory: [], combat_loot: [], quest_rewards: [], encounter_rewards: [], event_rewards: [], poi_ids: [] },
    catalogs: {
      items: [], currencies: [], requirements: [],
      shops: [{ id: "shop-1", name: "Forge" }],
      combat_profiles: [], quests: [{ id: "quest-1", title: "First Quest" }], encounters: [], events: [],
      pois: [{ id: "poi-1", name: "Chest", location_id: "loc-1", location: { id: "loc-1", name: "Ruins" } }],
    },
    analysis: { total_sources: 0, median_peer_price: 120, source_counts: {}, warnings: ["Item has no acquisition sources."], peers: [] },
  };
  let saved: Record<string, unknown> | null = null;
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/items/ecosystem/item-1") return fulfillJson(route, packet);
    if (url.pathname === "/api/ui/items/ecosystem/bundle") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, { ...packet, ...(saved as object), analysis: { ...packet.analysis, total_sources: 2, warnings: [] } });
    }
    return fulfillJson(route, []);
  });
  await page.goto("/author/items/item-1/ecosystem");
  await expect(page.getByRole("heading", { name: "Blade" })).toBeVisible();
  await page.getByRole("button", { name: "Add Source" }).first().click();
  await page.getByRole("button", { name: "Progression" }).click();
  await page.getByText("Chest").click();
  await page.getByRole("button", { name: "Save All" }).click();
  await expect.poll(() => saved).not.toBeNull();
  const sources = saved?.sources as Record<string, unknown>;
  expect((sources.shop_inventory as unknown[]).length).toBe(1);
  expect(sources.poi_ids).toEqual(["poi-1"]);
});

test("item ecosystem places the item into story as a reward", async ({ page }) => {
  const packet = {
    item: { id: "item-1", slug: "signal-key", name: "Signal Key", type: "Quest", rarity: "Rare", base_price: 0, effects: [], stat_modifiers: [], attribute_modifiers: [], tags: [] },
    requirement: null,
    sources: { shop_inventory: [], combat_loot: [], quest_rewards: [], encounter_rewards: [], event_rewards: [], poi_ids: [] },
    catalogs: {
      items: [{ id: "item-1", name: "Signal Key" }], currencies: [], requirements: [], shops: [], combat_profiles: [], quests: [], encounters: [], events: [], pois: [],
    },
    analysis: { total_sources: 0, median_peer_price: 0, source_counts: {}, warnings: [], peers: [] },
  };
  let saved: Record<string, unknown> | null = null;
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/items/ecosystem/item-1") return fulfillJson(route, packet);
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, {
      ...storyTimelinePacket,
      catalogs: { ...storyTimelinePacket.catalogs, items: [{ id: "item-1", name: "Signal Key" }] },
    });
    if (url.pathname === "/api/ui/adventure-timeline/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] });
    }
    if (url.pathname === "/api/ui/adventure-timeline/bundle" && route.request().method() === "POST") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      const links = saved.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, {
        result: { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] },
        packet: {
          ...storyTimelinePacket,
          catalogs: { ...storyTimelinePacket.catalogs, items: [{ id: "item-1", name: "Signal Key" }] },
          entity_tracks: {
            ...storyTimelinePacket.entity_tracks,
            items: [{
              id: links[0].id,
              entity_kind: "item",
              entity_id: "item-1",
              label: "Signal Key",
              timeline_id: "timeline-1",
              story_arc_id: "arc-1",
              source_kind: "adventure_beat",
              source_id: "adventure-beat-1",
              source_label: "Enter The First City",
              order: 0,
              role: links[0].role,
              occurrence_kind: links[0].occurrence_kind,
              change_type: links[0].change_type,
              importance: links[0].importance,
            }],
          },
        },
      });
    }
    return fulfillJson(route, []);
  });

  await page.goto("/author/items/item-1/ecosystem");
  await expect(page.getByRole("heading", { name: "Signal Key" })).toBeVisible();
  await expect(page.getByTestId("story-placement-panel")).toContainText("Important item has no story placement.");
  await page.getByTestId("placement-tray-requirement").click();
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("item");
  expect(link.target_id).toBe("item-1");
  expect(link.role).toBe("reference");
  expect(link.occurrence_kind).toBe("requirement");
  expect(link.change_type).toBe("active");
  expect(link.importance).toBe("major");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City");
  await expect(page.getByTestId("story-placement-panel")).not.toContainText("Important item has no story placement.");
});

test("new item ecosystem restores, resets, and saves the complete draft", async ({ page }) => {
  const packet = {
    item: { id: "item-new", slug: "", name: "New Item", type: "Misc", rarity: "Common", base_price: 0, effects: [], stat_modifiers: [], attribute_modifiers: [], tags: [] },
    requirement: null,
    sources: { shop_inventory: [], combat_loot: [], quest_rewards: [], encounter_rewards: [], event_rewards: [], poi_ids: [] },
    catalogs: {
      items: [], currencies: [], requirements: [],
      shops: [{ id: "shop-1", name: "Forge" }],
      combat_profiles: [], quests: [], encounters: [], events: [], pois: [],
    },
    analysis: { total_sources: 0, median_peer_price: 0, source_counts: {}, warnings: ["Item has no acquisition sources."], peers: [] },
  };
  let saved: Record<string, unknown> | null = null;
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/items/ecosystem-new" || url.pathname === "/api/ui/items/ecosystem/item-new") return fulfillJson(route, packet);
    if (url.pathname === "/api/ui/items/ecosystem/bundle") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, { ...packet, ...(saved as object), analysis: { ...packet.analysis, total_sources: 1, warnings: [] } });
    }
    return fulfillJson(route, []);
  });
  await page.goto("/author/items/new/ecosystem");
  await expect(page.getByRole("button", { name: "Save All" })).toBeDisabled();
  await page.getByLabel("Name").fill("Draft Blade");
  await page.getByLabel("Slug").fill("draft-blade");
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Draft Blade");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("New Item");
  await page.getByLabel("Name").fill("Finished Blade");
  await page.getByLabel("Slug").fill("finished-blade");
  await page.getByRole("button", { name: "Acquisition" }).click();
  await page.getByRole("button", { name: "Add Source" }).first().click();
  await page.getByRole("button", { name: "Save All" }).click();
  await expect.poll(() => saved).not.toBeNull();
  await expect(page).toHaveURL(/\/author\/items\/item-new\/ecosystem$/);
  expect((saved?.item as Record<string, unknown>).name).toBe("Finished Blade");
  expect(((saved?.sources as Record<string, unknown>).shop_inventory as unknown[]).length).toBe(1);
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

test("world builder places the selected location into story as setting", async ({ page }) => {
  const world = {
    ...emptyWorld,
    locations: [{
      id: "location-1", slug: "first-city", name: "First City", location_type: "Zone", place_kind: "Settlement",
      coordinates: { x: 50, y: 50 }, level_range: { min: 1, max: 3 }, tags: [], environment_tags: [],
    }],
  };
  let saved: Record<string, unknown> | null = null;
  await mockApi(page, world, undefined, async (payload, route) => {
    saved = payload;
    const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
    await fulfillJson(route, {
      result: { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] },
      packet: {
        ...storyTimelinePacket,
        entity_tracks: {
          ...storyTimelinePacket.entity_tracks,
          locations: [{
            id: String(links[0].id),
            entity_kind: "location",
            entity_id: "location-1",
            label: "First City",
            timeline_id: "timeline-1",
            story_arc_id: "arc-1",
            source_kind: "adventure_beat",
            source_id: "adventure-beat-1",
            source_label: "Enter The First City",
            order: 0,
            role: links[0].role,
            occurrence_kind: links[0].occurrence_kind,
            change_type: links[0].change_type,
            importance: links[0].importance,
          }],
        },
      },
    });
  });
  await page.goto("/author/world?selected=location-1");

  await expect(page.getByRole("heading", { name: "Interactive World Workspace" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City", { timeout: 15000 });
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("location");
  expect(link.target_id).toBe("location-1");
  expect(link.role).toBe("setting");
  expect(link.occurrence_kind).toBe("appearance");
  expect(link.change_type).toBe("active");
  expect(link.importance).toBe("minor");
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
  characters: [{ id: "char-1", name: "Guide" }],
  story_beats: [{
    id: "beat-1", character_id: "char-1", dialogue_id: "dialogue-1", title: "The Gate Decision", beat_type: "Decision",
    sort_order: 1, summary: "", required_flags: [], forbidden_flags: [], expected_output_flags: [], relationship_changes: [], tags: [],
  }],
  beat_coverage: { "beat-1": { required: { matched: [], missing: [] }, forbidden: { matched: [], missing: [] }, outputs: { matched: [], missing: [] }, implementation_paths: {}, warnings: [] } },
  context: {
    interaction_profiles: [], events: [], pois: [], character: null, location: null,
    participants: [{ id: "char-1", name: "Guide" }], story_profiles: [], relationships: [], participant_next_sort_order: { "char-1": 2 },
  },
  world_echo: { dialogue_id: "dialogue-1", produced_flags: [], consumers: [] },
};

async function mockDialogueApi(
  page: Page,
  onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
  onStoryPlacementBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dialogues") return fulfillJson(route, [dialoguePacket.dialogue]);
    if (url.pathname === "/api/ui/dialogues/dialogue-1") return fulfillJson(route, dialoguePacket);
    if (url.pathname === "/api/ui/dialogues/preview" && route.request().method() === "POST") {
      return fulfillJson(route, { review: { created: [], changed: [], deleted: [], unlinked: [] }, warnings: [], health_warnings: [], blockers: [] });
    }
    if (url.pathname === "/api/ui/dialogues/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onBundle) return onBundle(payload, route);
      return fulfillJson(route, dialoguePacket);
    }
    if (url.pathname === "/api/requirements") return fulfillJson(route, dialoguePacket.requirements);
    if (url.pathname === "/api/flags") return fulfillJson(route, dialoguePacket.flags);
    if (url.pathname === "/api/factions") return fulfillJson(route, []);
    if (url.pathname === "/api/characters") return fulfillJson(route, dialoguePacket.characters);
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, storyTimelinePacket);
    if (url.pathname === "/api/ui/adventure-timeline/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] });
    }
    if (url.pathname === "/api/ui/adventure-timeline/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onStoryPlacementBundle) return onStoryPlacementBundle(payload, route);
      return fulfillJson(route, { result: { review: { created: [], changed: [], deleted: [] }, warnings: [], blockers: [] }, packet: storyTimelinePacket });
    }
    return fulfillJson(route, []);
  });
}

const storyTimelinePacket = {
  meta: { read_only: true, canonical_global_sequence: false },
  timelines: [{ id: "timeline-1", slug: "main-story", name: "Main Story", description: "The playable story.", story_arc_ids: ["arc-1"], tags: [] }],
  story_arcs: [{
    id: "arc-1", slug: "city-arc", title: "The First City", summary: "Reach and defend the city.", type: "Main Story",
    timeline_id: "timeline-1", ordered_quest_ids: ["quest-1"], character_story_beat_ids: ["beat-1"], adventure_beat_ids: ["adventure-beat-1"], related_quests: ["quest-1"], tags: [],
  }],
  placements: [
    {
      id: "arc-quest:arc-1:quest-1", kind: "quest", entry_id: "quest-1", label: "Arrival", timeline_id: "timeline-1",
      story_arc_id: "arc-1", lane_id: "story_arc:arc-1", order: 0, ordering_source: "story_arcs.related_quests",
      placement_basis: "explicit", canonical_order: true,
    },
    {
      id: "character-story-beat:beat-1", kind: "character_story_beat", entry_id: "beat-1", label: "Guide Welcomes The Player",
      timeline_id: "timeline-1", story_arc_id: "arc-1", lane_id: "character:char-1", order: 0,
      ordering_source: "character_story_beats.sort_order", placement_basis: "story_arc_id", canonical_order: true,
      character: { kind: "character", entry_id: "char-1", label: "Guide" },
      source: { kind: "event", entry_id: "event-1", label: "Welcome Event" },
    },
    {
      id: "adventure-beat:adventure-beat-1", kind: "adventure_beat", entry_id: "adventure-beat-1", label: "Enter The First City",
      timeline_id: "timeline-1", story_arc_id: "arc-1", lane_id: "story_arc:arc-1", order: 0,
      ordering_source: "adventure_beats.sort_order", placement_basis: "explicit", canonical_order: true, beat_type: "Introduction",
      attachments: [{ id: "adventure-link-1", target_type: "location", target_id: "location-1", role: "setting", label: "First City" }],
    },
  ],
  event_chains: [{
    event_id: "event-1", label: "Welcome Event", previous_event_ids: [], next_event_id: "",
    referenced_by_story_beat_ids: ["beat-1"], attachments: { location_id: "location-1", dialogue_id: "dialogue-1" },
  }],
  relationships: [
    { id: "event:event-1>occurs_at>location:location-1", source: "event:event-1", target: "location:location-1", relation: "occurs_at", explicit: true },
  ],
  entity_tracks: {
    locations: [{
      id: "adventure-link:adventure-link-1",
      entity_kind: "location",
      entity_id: "location-1",
      label: "First City",
      timeline_id: "timeline-1",
      story_arc_id: "arc-1",
      source_kind: "adventure_beat",
      source_id: "adventure-beat-1",
      source_label: "Enter The First City",
      order: 0,
      role: "setting",
      occurrence_kind: "appearance",
      change_type: "active",
      importance: "major",
    }],
    characters: [],
    items: [],
    quests: [],
    factions: [],
  },
  unplaced: { story_arc_ids: [], quest_ids: [], event_ids: [], character_story_beat_ids: [], adventure_beat_ids: [] },
  catalogs: {
    quests: [{ id: "quest-1", title: "Arrival", description: "Reach the city." }],
    events: [{ id: "event-1", title: "Welcome Event", location_id: "location-1", dialogue_id: "dialogue-1" }],
    character_story_beats: [{ id: "beat-1", title: "Guide Welcomes The Player", character_id: "char-1", event_id: "event-1" }],
    adventure_beats: [{ id: "adventure-beat-1", title: "Enter The First City", story_arc_id: "arc-1", beat_type: "Introduction" }],
    adventure_beat_links: [{ id: "adventure-link-1", adventure_beat_id: "adventure-beat-1", target_type: "location", target_id: "location-1", role: "setting" }],
    characters: [{ id: "char-1", name: "Guide" }],
    locations: [{ id: "location-1", name: "First City" }],
    dialogues: [{ id: "dialogue-1", title: "Welcome" }],
    encounters: [],
    lore_entries: [],
  },
  dependency_index: { nodes: [], edges: [{ id: "quest:quest-1>unlocks>event:event-1", source: "quest:quest-1", target: "event:event-1", relation: "unlocks", explicit: false }], health: {} },
  health: { warnings: [], dependency: {} },
};

async function mockStoryTimelineApi(page: Page, onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, storyTimelinePacket);
    if (url.pathname === "/api/ui/adventure-timeline/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const beats = payload.adventure_beats as Array<Record<string, unknown>>;
      const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, {
        review: {
          created: [...beats.map((beat) => ({ table: "adventure_beats", id: beat.id })), ...links.map((link) => ({ table: "adventure_beat_links", id: link.id }))],
          changed: [],
          deleted: [],
        },
        warnings: [],
        blockers: [],
      });
    }
    if (url.pathname === "/api/ui/adventure-timeline/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onBundle) return onBundle(payload, route);
      return fulfillJson(route, { result: { review: { created: [], changed: [], deleted: [] }, warnings: [], blockers: [] }, packet: storyTimelinePacket });
    }
    return fulfillJson(route, []);
  });
}

test("character studio shows read-only story placements for the selected character", async ({ page }) => {
  const characterPacket = {
    navigator: [{ id: "char-1", name: "Guide", encounter_count: 0, dialogue_count: 1 }],
    character: { id: "char-1", slug: "guide", name: "Guide", title: "", description: "", level: 1, tags: [] },
    combat_profile: null,
    interaction_profile: null,
    story_profile: null,
    relationships: [],
    story_beats: [],
    world_presence: { encounters: [], dialogues: [], dialogue_nodes: [], shops: [], quests: [], locations: [] },
    graph: { nodes: [{ id: "character:char-1", kind: "character", entry_id: "char-1", label: "Guide", data: {}, metadata: {} }], edges: [] },
    catalogs: {
      characters: [{ id: "char-1", name: "Guide" }],
      abilities: [], quests: [], dialogues: [], dialogue_nodes: [], encounters: [], shops: [], locations: [], factions: [], characterclasses: [], events: [], story_arcs: [], flags: [],
    },
    health: { blockers: [], warnings: [] },
    flag_coverage: {},
    unplaced_presence: [],
  };
  let saved: Record<string, unknown> | null = null;
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/character-studio/char-1") return fulfillJson(route, characterPacket);
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, storyTimelinePacket);
    if (url.pathname === "/api/ui/adventure-timeline/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] });
    }
    if (url.pathname === "/api/ui/adventure-timeline/bundle" && route.request().method() === "POST") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      const links = saved.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, {
        result: { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] },
        packet: {
          ...storyTimelinePacket,
          entity_tracks: {
            ...storyTimelinePacket.entity_tracks,
            characters: [{
              id: links[0].id,
              entity_kind: "character",
              entity_id: "char-1",
              label: "Guide",
              timeline_id: "timeline-1",
              story_arc_id: "arc-1",
              source_kind: "adventure_beat",
              source_id: "adventure-beat-1",
              source_label: "Enter The First City",
              order: 0,
              role: links[0].role,
              occurrence_kind: links[0].occurrence_kind,
              change_type: links[0].change_type,
              importance: links[0].importance,
            }],
          },
        },
      });
    }
    return fulfillJson(route, []);
  });
  await page.goto("/author/characters/char-1");

  await expect(page.getByRole("heading", { name: "Guide" })).toBeVisible();
  await expect(page.getByTestId("story-placement-panel")).toContainText("Guide Welcomes The Player");
  await expect(page.getByTestId("story-context-strip")).toContainText("Story Context");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Main Story / The First City");
  await expect(page.getByTestId("story-placement-panel").getByRole("link", { name: "Open Timeline" })).toHaveAttribute("href", /\/author\/story-timeline/);
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();
  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.adventure_beat_id).toBe("adventure-beat-1");
  expect(link.target_type).toBe("character");
  expect(link.target_id).toBe("char-1");
  expect(link.role).toBe("cast");
  expect(link.occurrence_kind).toBe("appearance");
  expect(link.change_type).toBe("active");
  expect(link.importance).toBe("minor");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City");
});

async function dragWithPointer(page: Page, source: Locator, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Drag source or target is not visible.");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("dialogue flow sketches, connects, and saves a complete bundle", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await mockDialogueApi(page, async (payload, route) => {
    saved = payload;
    const nodes = payload.nodes as Array<Record<string, unknown>>;
    await fulfillJson(route, { ...dialoguePacket, dialogue: payload.dialogue, nodes });
  });
  await page.goto("/author/dialogues/dialogue-1");

  await page.getByTestId("dialogue-node-node-2").getByRole("button", { name: "+ Choice" }).click();
  await expect(page.getByText("3 lines /")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Flow" })).toBeDisabled();
  await page.locator('[data-testid^="dialogue-node-"]').last().getByRole("textbox").fill("A newly drafted line.");
  await page.getByRole("button", { name: "Save Flow" }).click();
  await page.getByRole("button", { name: "Commit Bundle" }).click();

  await expect.poll(() => saved).not.toBeNull();
  expect((saved?.nodes as unknown[]).length).toBe(3);
});

test("dialogue flow places the dialogue into story as runtime", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await mockDialogueApi(page, undefined, async (payload, route) => {
    saved = payload;
    const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
    await fulfillJson(route, {
      result: { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] },
      packet: {
        ...storyTimelinePacket,
        entity_tracks: {
          ...storyTimelinePacket.entity_tracks,
          dialogues: [{
            id: String(links[0].id),
            entity_kind: "dialogue",
            entity_id: "dialogue-1",
            label: "Gate Talk",
            timeline_id: "timeline-1",
            story_arc_id: "arc-1",
            source_kind: "adventure_beat",
            source_id: "adventure-beat-1",
            source_label: "Enter The First City",
            order: 0,
            role: links[0].role,
            occurrence_kind: links[0].occurrence_kind,
            change_type: links[0].change_type,
            importance: links[0].importance,
          }],
        },
      },
    });
  });
  await page.goto("/author/dialogues/dialogue-1");

  await expect(page.getByTestId("story-placement-panel")).toContainText("Welcome Event");
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("dialogue");
  expect(link.target_id).toBe("dialogue-1");
  expect(link.role).toBe("runtime");
  expect(link.occurrence_kind).toBe("appearance");
  expect(link.change_type).toBe("active");
  expect(link.importance).toBe("major");
});

test("dialogue flow restores drafts and unlocks gated choices in playthrough", async ({ page }) => {
  await mockDialogueApi(page);
  await page.goto("/author/dialogues/dialogue-1");
  await page.getByTestId("dialogue-node-node-1").click();
  await page.getByLabel("Dialogue Text", { exact: true }).fill("Unsaved changed line");
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.getByText("Restored unsaved dialogue flow draft.")).toBeVisible();
  await expect(page.getByLabel("Dialogue Text", { exact: true })).toHaveValue("Unsaved changed line");

  await page.getByRole("button", { name: "Rehearsal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enter" })).toBeDisabled();
  await page.getByText("Temporary Player State").click();
  await page.getByText("Temporary Player State").locator("..").getByLabel("Flags Set").selectOption(["flag-1"]);
  await expect(page.getByRole("button", { name: "Enter" })).toBeEnabled();
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByText("Welcome.").last()).toBeVisible();
});

test("dialogue flow reset clears the persisted draft", async ({ page }) => {
  await mockDialogueApi(page);
  await page.goto("/author/dialogues/dialogue-1");
  await page.getByTestId("dialogue-node-node-1").click();
  await page.getByLabel("Dialogue Text", { exact: true }).fill("Discard this line");
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "Reset" }).click();
  await page.reload();
  await expect(page.getByLabel("Dialogue Text", { exact: true })).toHaveValue("Choose.");
  await expect(page.getByText("Restored unsaved dialogue flow draft.")).not.toBeVisible();
});

test("new dialogue draft survives a full reload", async ({ page }) => {
  await mockDialogueApi(page);
  await page.goto("/author/dialogues/new");
  await page.getByLabel("Title", { exact: true }).fill("Reloadable New Dialogue");
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.getByText("Restored unsaved dialogue flow draft.")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Reloadable New Dialogue");
});

test("dialogue scene starter recipes are interactive", async ({ page }) => {
  await mockDialogueApi(page);
  await page.goto("/author/dialogues/new");
  await page.getByRole("button", { name: "Greeting" }).click();
  await expect(page.getByText("3 lines /")).toBeVisible();
});

test("dialogue story beat grouping, rehearsal, and impact views are interactive", async ({ page }) => {
  await mockDialogueApi(page);
  await page.goto("/author/dialogues/dialogue-1");
  await page.getByRole("button", { name: /The Gate Decision/ }).click();
  await page.getByTestId("dialogue-node-node-1").click();
  await page.getByLabel("Local Story Beat Group").selectOption("beat-1");
  await page.reload();
  await page.getByTestId("dialogue-node-node-1").click();
  await expect(page.getByLabel("Local Story Beat Group")).toHaveValue("beat-1");

  await page.getByRole("button", { name: "Rehearsal" }).click();
  await expect(page.getByText("Choose.").last()).toBeVisible();
  await page.getByRole("button", { name: "Impact" }).click();
  await expect(page.getByRole("heading", { name: "World Echo" })).toBeVisible();
});

const encounterPacket = {
  encounter: {
    id: "enc-1", slug: "enc-1", name: "Road Ambush", description: "", encounter_type: "Combat",
    requirements_id: "req-1", participants: [], rewards: { xp: 0, items: [], currencies: [], reputation: [], flags_set: [] }, tags: [],
  },
  requirement: { id: "req-1", slug: "road-gate", required_flags: [], forbidden_flags: [], min_faction_reputation: [], tags: [] },
  requirement_usages: [{ schema_name: "events", entry_id: "event-1", entry_label: "Road Event", path: "requirements_id" }],
  requirement_usages_by_id: { "req-1": [{ schema_name: "events", entry_id: "event-1", entry_label: "Road Event", path: "requirements_id" }] },
  encounters: [{ id: "enc-1", slug: "enc-1", name: "Road Ambush", encounter_type: "Combat", participants: [], rewards: {} }],
  characters: [{
    character: { id: "char-1", slug: "char-1", name: "Profileless", level: 3, tags: [] },
    combat_profile: null,
    interaction_profile: null,
  }],
  requirements: [{ id: "req-1", slug: "road-gate", required_flags: [], forbidden_flags: [], min_faction_reputation: [], tags: [] }],
  items: [], currencies: [], factions: [], flags: [],
  encounter_tables: [{
    id: "table-1", slug: "table-1", location_id: "loc-1", name: "Road Table", encounter_entries: [], environmental_modifiers: [], tags: [],
    location: { id: "loc-1", slug: "loc-1", name: "Old Road" },
  }],
  placements: [],
  context: { pois: [], events: [] },
};

async function mockEncounterApi(page: Page, onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/encounters/enc-1") return fulfillJson(route, encounterPacket);
    if (url.pathname === "/api/ui/encounters") return fulfillJson(route, encounterPacket);
    if (url.pathname === "/api/ui/encounters/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onBundle) return onBundle(payload, route);
      return fulfillJson(route, encounterPacket);
    }
    if (url.pathname === "/api/encounters") return fulfillJson(route, encounterPacket.encounters);
    if (url.pathname === "/api/characters") return fulfillJson(route, encounterPacket.characters.map((entry) => entry.character));
    if (url.pathname === "/api/combat_profiles") return fulfillJson(route, []);
    return fulfillJson(route, []);
  });
}

test("encounter stage composes participants, rewards, and placement into one bundle", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await mockEncounterApi(page, async (payload, route) => {
    saved = payload;
    await fulfillJson(route, {
      ...encounterPacket,
      encounter: payload.encounter,
      requirement: payload.requirement,
      placements: payload.placements,
    });
  });
  await page.goto("/author/encounters/enc-1");

  await expect(page.getByText("Shared-use impact:")).toBeVisible();
  await page.getByRole("button", { name: /Profileless/ }).click();
  await page.getByRole("button", { name: "Combat !" }).click();
  await expect(page.getByText("Profileless uses Combat without a combat profile.")).toBeVisible();
  await page.getByRole("spinbutton", { name: "XP" }).fill("40");
  await page.locator("section").filter({ hasText: "World Placement" }).locator("select").selectOption("table-1");
  await page.getByRole("button", { name: "Save All" }).first().click();

  await expect.poll(() => saved).not.toBeNull();
  const encounter = saved?.encounter as Record<string, unknown>;
  const participants = encounter.participants as Array<Record<string, unknown>>;
  expect(participants[0].character_id).toBe("char-1");
  expect(participants[0].combat_side).toBe("Neutral");
  expect((encounter.rewards as Record<string, unknown>).xp).toBe(40);
  expect((saved?.placements as Array<Record<string, unknown>>)[0].table_id).toBe("table-1");
});

test("encounter stage places the encounter into story as runtime", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/encounters/enc-1") return fulfillJson(route, encounterPacket);
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, {
      ...storyTimelinePacket,
      catalogs: { ...storyTimelinePacket.catalogs, encounters: [{ id: "enc-1", name: "Road Ambush" }] },
    });
    if (url.pathname === "/api/ui/adventure-timeline/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] });
    }
    if (url.pathname === "/api/ui/adventure-timeline/bundle" && route.request().method() === "POST") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      const links = saved.adventure_beat_links as Array<Record<string, unknown>>;
      return fulfillJson(route, {
        result: { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] },
        packet: {
          ...storyTimelinePacket,
          catalogs: { ...storyTimelinePacket.catalogs, encounters: [{ id: "enc-1", name: "Road Ambush" }] },
          entity_tracks: {
            ...storyTimelinePacket.entity_tracks,
            encounters: [{
              id: links[0].id,
              entity_kind: "encounter",
              entity_id: "enc-1",
              label: "Road Ambush",
              timeline_id: "timeline-1",
              story_arc_id: "arc-1",
              source_kind: "adventure_beat",
              source_id: "adventure-beat-1",
              source_label: "Enter The First City",
              order: 0,
              role: links[0].role,
              occurrence_kind: links[0].occurrence_kind,
              change_type: links[0].change_type,
              importance: links[0].importance,
            }],
          },
        },
      });
    }
    if (url.pathname === "/api/encounters") return fulfillJson(route, encounterPacket.encounters);
    if (url.pathname === "/api/characters") return fulfillJson(route, encounterPacket.characters.map((entry) => entry.character));
    if (url.pathname === "/api/combat_profiles") return fulfillJson(route, []);
    return fulfillJson(route, []);
  });

  await page.goto("/author/encounters/enc-1");
  await expect(page.getByRole("heading", { name: "Encounter Stage" })).toBeVisible();
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("encounter");
  expect(link.target_id).toBe("enc-1");
  expect(link.role).toBe("runtime");
  expect(link.occurrence_kind).toBe("appearance");
  expect(link.change_type).toBe("active");
  expect(link.importance).toBe("major");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City");
});

test("encounter stage restores and resets local drafts", async ({ page }) => {
  await mockEncounterApi(page);
  await page.goto("/author/encounters/enc-1");
  await page.getByLabel("Description").fill("Unsaved encounter direction.");
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.getByText("Restored unsaved Encounter Stage draft.")).toBeVisible();
  await expect(page.getByLabel("Description")).toHaveValue("Unsaved encounter direction.");
  await page.getByRole("button", { name: "Reset" }).first().click();
  await page.reload();
  await expect(page.getByLabel("Description")).toHaveValue("");
});

const abilityPacket = {
  ability: {
    id: "ability-1", slug: "flame-pulse", name: "Flame Pulse", type: "Active", targeting: "Single",
    trigger_condition: "On Use", damage_type_source: "Fixed", damage_type: "Fire", resource_cost: 10, cooldown: 2,
    effects: ["effect-shared"], scaling: [], tags: [],
  },
  linked_effects: [{
    id: "effect-shared", slug: "shared-fire", name: "Shared Fire", type: "Damage", target: "Enemy",
    value_type: "Flat", value: 20, duration: 0, apply_chance: 100, tags: [],
  }],
  linked_statuses: [],
  requirement: null,
  assigned_combat_profile_ids: [],
  catalogs: {
    abilities: [],
    effects: [{
      id: "effect-shared", slug: "shared-fire", name: "Shared Fire", type: "Damage", target: "Enemy",
      value_type: "Flat", value: 20, duration: 0, apply_chance: 100, tags: [],
    }],
    statuses: [],
    stats: [{ id: "stat-1", slug: "power", name: "Power" }],
    requirements: [],
    combat_profiles: [],
    characterclasses: [],
    talent_nodes: [],
    items: [{ id: "item-1", name: "Shared Wand" }],
  },
  usage: {
    abilities: { "ability-1": { combat_profiles: [], characterclasses: [], talent_nodes: [] } },
    effects: { "effect-shared": { abilities: [{ id: "ability-1", name: "Flame Pulse" }], items: [{ id: "item-1", name: "Shared Wand" }] } },
    statuses: {},
  },
  analysis: { similar_abilities: [] },
};

async function mockAbilityApi(page: Page, onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/abilities" || url.pathname === "/api/ui/abilities/ability-1") return fulfillJson(route, abilityPacket);
    if (url.pathname === "/api/ui/abilities/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onBundle) return onBundle(payload, route);
      return fulfillJson(route, { ...abilityPacket, ability: payload.ability });
    }
    if (url.pathname === "/api/abilities") return fulfillJson(route, []);
    if (url.pathname === "/api/effects") return fulfillJson(route, abilityPacket.catalogs.effects);
    return fulfillJson(route, []);
  });
}

test("ability spellcraft composes a status payload and saves one atomic bundle", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await mockAbilityApi(page, async (payload, route) => {
    saved = payload;
    await fulfillJson(route, { ...abilityPacket, ability: payload.ability, linked_effects: payload.effect_upserts, linked_statuses: payload.status_upserts });
  });
  await page.goto("/author/abilities/new");
  await expect(page.getByText("Live Combat Sentence")).toBeVisible();
  const abilityName = page.getByLabel("Name").first();
  await abilityName.clear();
  await abilityName.pressSequentially("Frost Mark");
  await expect(abilityName).toHaveValue("Frost Mark");
  await page.getByRole("button", { name: "+ Status" }).click();
  await page.getByRole("button", { name: "Create Status For Effect" }).click();
  await page.getByLabel("Slug").first().fill("frost-mark");
  await page.getByRole("button", { name: "Save All" }).first().click();
  await page.getByRole("button", { name: "Commit Bundle" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect((saved?.effect_upserts as Array<Record<string, unknown>>).length).toBe(1);
  expect((saved?.status_upserts as Array<Record<string, unknown>>).length).toBe(1);
});

test("ability spellcraft clones shared effects before editing", async ({ page }) => {
  await mockAbilityApi(page);
  await page.goto("/author/abilities/ability-1");
  await page.locator("section").filter({ hasText: "Spellcraft Chain" }).getByRole("button", { name: /Shared Fire/ }).click();
  await expect(page.getByText("Shared Wand")).toBeVisible();
  await page.getByRole("button", { name: "Duplicate Into This Ability" }).click();
  await expect(page.getByLabel("Name").last()).toHaveValue("Shared Fire Variant");
  await expect(page.getByText(/damage Shared Fire Variant/).first()).toBeVisible();
});

test("ability spellcraft restores drafts and surfaces target conflicts", async ({ page }) => {
  await mockAbilityApi(page);
  await page.goto("/author/abilities/ability-1");
  await page.getByRole("button", { name: "Self", exact: true }).click();
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.getByText("Restored unsaved Ability Spellcraft draft.")).toBeVisible();
  await page.getByRole("button", { name: "Issues" }).click();
  await expect(page.getByText(/targets Enemy but the ability reaches Self/)).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).first().click();
  await page.reload();
  await expect(page.getByText("Restored unsaved Ability Spellcraft draft.")).not.toBeVisible();
});

test("ability lab bench visualizes target count, timeline, and local variants", async ({ page }) => {
  await mockAbilityApi(page);
  await page.goto("/author/abilities/ability-1");
  await expect(page.getByTestId("ability-lab-bench")).toBeVisible();
  await page.getByRole("button", { name: "Area", exact: true }).click();
  await page.getByLabel("Target Count").fill("4");
  await expect(page.getByTestId("impact-target-4")).toBeVisible();
  await page.getByLabel("Trace Turn").fill("2");
  await page.getByRole("button", { name: "Snapshot Variant" }).click();
  await expect(page.getByText("Variant 1")).toBeVisible();
});

test("ability spellcraft creates a related local draft without changing the source", async ({ page }) => {
  await mockAbilityApi(page);
  await page.goto("/author/abilities/ability-1");
  await page.getByRole("button", { name: "Create Related Draft" }).click();
  await expect(page).toHaveURL(/\/author\/abilities\/new$/);
  await expect(page.getByText("Restored unsaved Ability Spellcraft draft.")).toBeVisible();
  await expect(page.getByLabel("Name").first()).toHaveValue("Flame Pulse Related");
  await expect(page.locator("section").filter({ hasText: "Ability Family & Tactical Relationships" }).locator("select").first()).toHaveValue("Variant");
});
