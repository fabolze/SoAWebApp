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

const dependencyPacket = {
  nodes: [
    { id: "flag:intro-done", kind: "flag", entry_id: "intro-done", label: "Intro Done", schema_name: "flags" },
    { id: "flag:has-key", kind: "flag", entry_id: "has-key", label: "Has Key", schema_name: "flags" },
    { id: "flag:alarm-raised", kind: "flag", entry_id: "alarm-raised", label: "Alarm Raised", schema_name: "flags" },
    { id: "requirement:req-start", kind: "requirement", entry_id: "req-start", label: "Start Ready", schema_name: "requirements" },
    { id: "requirement:req-key", kind: "requirement", entry_id: "req-key", label: "Key Ready", schema_name: "requirements" },
    { id: "quests:quest-1", kind: "quests", entry_id: "quest-1", label: "Find The Key", schema_name: "quests" },
    { id: "events:event-1", kind: "events", entry_id: "event-1", label: "Open Gate Event", schema_name: "events" },
    { id: "events:event-2", kind: "events", entry_id: "event-2", label: "Alarm Event", schema_name: "events" },
  ],
  edges: [
    { id: "flag:intro-done>required_by>requirement:req-start", source: "flag:intro-done", target: "requirement:req-start", relation: "required_by", explicit: true, path: "required_flags" },
    { id: "requirement:req-start>gates>quests:quest-1", source: "requirement:req-start", target: "quests:quest-1", relation: "gates", explicit: true, path: "requirements_id" },
    { id: "quests:quest-1>sets>flag:has-key", source: "quests:quest-1", target: "flag:has-key", relation: "sets", explicit: true, path: "flags_set_on_completion" },
    { id: "flag:has-key>required_by>requirement:req-key", source: "flag:has-key", target: "requirement:req-key", relation: "required_by", explicit: true, path: "required_flags" },
    { id: "flag:alarm-raised>forbidden_by>requirement:req-key", source: "flag:alarm-raised", target: "requirement:req-key", relation: "forbidden_by", explicit: true, path: "forbidden_flags" },
    { id: "requirement:req-key>gates>events:event-1", source: "requirement:req-key", target: "events:event-1", relation: "gates", explicit: true, path: "requirements_id" },
    { id: "events:event-2>sets>flag:alarm-raised", source: "events:event-2", target: "flag:alarm-raised", relation: "sets", explicit: true, path: "flags_set" },
  ],
  health: { dead_flags: [], unused_flags: [], contradictions: [], impossible_gates: [], cycles: [] },
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockApi(
  page: Page,
  world = emptyWorld,
  onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
  onStoryPlacementBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
  onStoryPlacementPreview?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
  storyTimeline: Record<string, unknown> = storyTimelinePacket,
) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/world_builder" && route.request().method() === "GET") {
      return fulfillJson(route, world);
    }
    if (url.pathname === "/api/ui/dependencies") return fulfillJson(route, dependencyPacket);
    if (url.pathname === "/api/ui/world_builder/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onBundle) return onBundle(payload, route);
      return fulfillJson(route, world);
    }
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, storyTimeline);
    if (url.pathname === "/api/ui/adventure-timeline/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onStoryPlacementPreview) return onStoryPlacementPreview(payload, route);
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

test("dependency map walks temporary state through flag-setting sources", async ({ page }) => {
  await mockApi(page);
  await page.goto("/author/dependencies");

  const panel = page.getByTestId("dependency-walkthrough-panel");
  await expect(panel).toContainText("State Walkthrough");
  await expect(panel).toContainText("Find The Key");
  await expect(panel).toContainText("Open Gate Event");
  await panel.getByText("Initial Temporary Flags").locator("..").locator("select").selectOption("flag:intro-done");
  await expect(panel.getByTestId("dependency-newly-available")).toContainText("Find The Key");
  await panel.getByLabel("Trigger Existing Source").selectOption("quests:quest-1");
  await expect(panel).toContainText("Flags Gained");
  await expect(panel).toContainText("Has Key");
  await expect(panel.getByTestId("dependency-newly-available")).toContainText("Open Gate Event");
  await panel.getByRole("button", { name: "Open Gate Event" }).click();
  await expect(page.getByLabel("Focus Node")).toHaveValue("events:event-1");
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
  await expect(page.getByTestId("story-presets-quest")).toContainText("Escalates");
  await page.getByTestId("story-preset-quest-resolves").click();
  await expect(page.getByLabel("State Label")).toHaveValue("Resolved");
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("quest");
  expect(link.target_id).toBe("quest-1");
  expect(link.role).toBe("player_journey");
  expect(link.occurrence_kind).toBe("consequence");
  expect(link.change_type).toBe("changed");
  expect(link.importance).toBe("major");
  expect(link.state_label).toBe("Resolved");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City");
});

test("quest journey board walks temporary state through objectives and payoff", async ({ page }) => {
  const questPacket = {
    quest: {
      id: "quest-1", slug: "gate", title: "Open The Gate", description: "Reach the gate.",
      requirements_id: "req-start",
      objectives: [
        { objective_id: "find-key", description: "Find the key.", requirements_id: "", flags_set: ["has-key"] },
        { objective_id: "open-gate", description: "Open the gate.", requirements_id: "req-key", flags_set: ["gate-open"] },
      ],
      flags_set_on_completion: ["quest-done"],
      xp_reward: 25,
      item_rewards: [{ item_id: "item-1", quantity: 1 }],
      currency_rewards: [],
      reputation_rewards: [],
      tags: [],
    },
    requirements: [
      { id: "req-start", slug: "start-ready", required_flags: ["intro-done"], forbidden_flags: [], min_faction_reputation: [] },
      { id: "req-key", slug: "key-required", required_flags: ["has-key"], forbidden_flags: [], min_faction_reputation: [] },
    ],
    arc: { story_arc_id: "arc-1", related_quests: ["quest-1"], branches: [] },
    quest_giver_profile_ids: [],
    flags: [
      { id: "intro-done", name: "Intro Done" },
      { id: "has-key", name: "Has Key" },
      { id: "gate-open", name: "Gate Open" },
      { id: "quest-done", name: "Quest Done" },
    ],
    items: [{ id: "item-1", name: "Gate Key Trophy" }],
    currencies: [],
    factions: [],
    interaction_profiles: [],
    dependency_context: {
      prerequisites: [{ id: "flag:intro-done>required_by>requirement:req-start>required_flags", source: "flag:intro-done", target: "requirement:req-start", relation: "required_by", explicit: true, path: "required_flags" }],
      aftermath: [{ id: "quests:quest-1>unlocks>quests:quest-2>quest-done>req-next", source: "quests:quest-1", target: "quests:quest-2", relation: "unlocks", explicit: false, path: "quest-done>req-next" }],
      nodes: [
        { id: "flag:intro-done", kind: "flag", entry_id: "intro-done", label: "Intro Done", schema_name: "flags" },
        { id: "requirement:req-start", kind: "requirement", entry_id: "req-start", label: "start-ready", schema_name: "requirements" },
        { id: "quests:quest-1", kind: "quests", entry_id: "quest-1", label: "Open The Gate", schema_name: "quests" },
        { id: "quests:quest-2", kind: "quests", entry_id: "quest-2", label: "Next Quest", schema_name: "quests" },
      ],
    },
    quests: [{ id: "quest-1", title: "Open The Gate" }, { id: "quest-2", title: "Next Quest" }],
    story_arcs: [{ id: "arc-1", title: "The Gate" }],
  };
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/quests/quest-1") return fulfillJson(route, questPacket);
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, storyTimelinePacket);
    return fulfillJson(route, []);
  });

  await page.goto("/author/quests/quest-1");
  const panel = page.getByTestId("quest-walkthrough-panel");
  await expect(panel).toContainText("start-ready is locked");
  await panel.getByText("Temporary Player State").locator("..").locator("select").selectOption("intro-done");
  await expect(panel).toContainText("start-ready is open");
  await panel.getByRole("button", { name: "Objective 2" }).click();
  await expect(panel).toContainText("key-required is open");
  await expect(panel).toContainText("Has Key");
  await panel.getByRole("button", { name: "Completion & Payoff" }).click();
  await expect(panel).toContainText("XP: 25");
  await expect(panel).toContainText("Gate Key Trophy");
  await expect(panel).toContainText("Next Quest");
});

test("quest journey board commits objective flags through the consequence composer", async ({ page }) => {
  const questPacket = {
    quest: {
      id: "quest-1", slug: "gate", title: "Open The Gate", description: "Reach the gate.",
      requirements_id: "",
      objectives: [
        { objective_id: "find-key", description: "Find the key.", requirements_id: "", flags_set: [] },
      ],
      flags_set_on_completion: [],
      xp_reward: 0,
      item_rewards: [],
      currency_rewards: [],
      reputation_rewards: [],
      tags: [],
    },
    requirements: [],
    arc: { story_arc_id: "arc-1", related_quests: ["quest-1"], branches: [] },
    quest_giver_profile_ids: [],
    flags: [
      { id: "has-key", slug: "has-key", name: "Has Key" },
      { id: "gate-open", slug: "gate-open", name: "Gate Open" },
    ],
    items: [],
    currencies: [],
    factions: [],
    interaction_profiles: [],
    dependency_context: { prerequisites: [], aftermath: [], nodes: [] },
    quests: [{ id: "quest-1", title: "Open The Gate" }],
    story_arcs: [{ id: "arc-1", title: "The Gate" }],
  };
  const consequencePacket = {
    events: [],
    encounters: [],
    quests: [questPacket.quest],
    dialogue_nodes: [],
    adventure_beats: [],
    adventure_beat_links: [],
    flags: questPacket.flags,
    items: [],
    currencies: [],
    factions: [],
    characters: [],
    locations: [],
    dependency_index: { nodes: [], edges: [] },
    story_packet: storyTimelinePacket,
  };
  let previewed: Record<string, unknown> | null = null;
  let saved: Record<string, unknown> | null = null;
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/quests/quest-1") return fulfillJson(route, questPacket);
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, storyTimelinePacket);
    if (url.pathname === "/api/ui/consequences" && route.request().method() === "GET") return fulfillJson(route, consequencePacket);
    if (url.pathname === "/api/ui/consequences/preview" && route.request().method() === "POST") {
      previewed = route.request().postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, { review: { created: [], changed: [{ table: "quests", id: "quest-1" }], deleted: [] }, warnings: [], blockers: [] });
    }
    if (url.pathname === "/api/ui/consequences/bundle" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      saved = payload;
      const savedQuest = ((payload.quests as Array<Record<string, unknown>>)[0]);
      return fulfillJson(route, {
        result: { review: { created: [], changed: [{ table: "quests", id: "quest-1" }], deleted: [] }, warnings: [], blockers: [] },
        packet: { ...consequencePacket, quests: [savedQuest] },
      });
    }
    return fulfillJson(route, []);
  });

  await page.goto("/author/quests/quest-1");
  await expect(page.getByRole("heading", { name: "Quest Journey Board" })).toBeVisible();
  await page.locator("article").filter({ hasText: "Find the key." }).getByRole("button", { name: "Review Consequence" }).click();
  const composer = page.getByTestId("consequence-composer").filter({ hasText: "Atomic Objective Consequence" });
  await expect(composer).toBeVisible();
  await composer.getByLabel("Objective Flags Set").selectOption(["has-key"]);
  await composer.getByRole("button", { name: "Review Consequence" }).click();
  await expect(page.getByTestId("consequence-review")).toContainText("1 changed");
  await expect.poll(() => previewed).not.toBeNull();
  expect(((previewed?.quests as Array<Record<string, unknown>>)[0].objectives as Array<Record<string, unknown>>)[0].flags_set).toEqual(["has-key"]);
  expect((previewed?.quests as Array<Record<string, unknown>>)[0]).not.toHaveProperty("consequence_objective_id");
  await page.getByTestId("consequence-review").getByRole("button", { name: "Commit Consequence" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect(((saved?.quests as Array<Record<string, unknown>>)[0].objectives as Array<Record<string, unknown>>)[0].flags_set).toEqual(["has-key"]);
  await expect(page.getByTestId("quest-story-path-panel")).toContainText("Has Key");
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

test("story timeline deep links select tracks and focus matching entity occurrences", async ({ page }) => {
  test.slow();
  await mockStoryTimelineApi(page);
  const trackLabels = {
    location: "Locations",
    character: "Characters",
    quest: "Quests",
    event: "Events",
    dialogue: "Dialogues",
    encounter: "Encounters",
    lore_entry: "Lore",
    item: "Important Items",
    faction: "Factions",
    story_arc: "Story Arcs",
  };
  const trackEntities: Record<string, string> = {
    location: "location-1",
    character: "char-1",
    quest: "quest-1",
    event: "event-1",
    dialogue: "dialogue-1",
    encounter: "encounter-1",
    lore_entry: "lore-1",
    item: "item-1",
    faction: "faction-1",
    story_arc: "arc-1",
  };

  for (const [track, labelText] of Object.entries(trackLabels)) {
    const entity = trackEntities[track];
    await page.goto(`/author/story-timeline?track=${track}&entity=${entity}`);
    const navigator = page.getByTestId("story-navigator");
    await expect(navigator.getByRole("button", { name: labelText, exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
    await expect(page.getByTestId(`entity-occurrence-${track}-${entity}`)).toHaveAttribute("data-focused", "true", { timeout: 15000 });
  }

  await page.goto("/author/story-timeline?track=character&entity=does-not-exist");
  await expect(page.getByRole("heading", { name: "Story Timeline & Adventure Board" })).toBeVisible();
  await expect(page.getByTestId("story-timeline-canvas")).toBeVisible();
  await expect(page.getByTestId("story-navigator").locator('[data-focused="true"]')).toHaveCount(0);
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
    analysis: {
      total_sources: 0,
      median_peer_price: 120,
      source_counts: {},
      acquisition_channels: [],
      acquisition_channel_count: 0,
      warnings: ["Item has no acquisition sources."],
      peers: [],
    },
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
  await expect(page.getByTestId("item-journey-summary")).toContainText("Item Journey");
  await expect(page.getByTestId("item-journey-summary")).toContainText("Story relevant");
  await page.getByText("Chest").click();
  await page.getByRole("button", { name: "Save All" }).click();
  await expect.poll(() => saved).not.toBeNull();
  const sources = saved?.sources as Record<string, unknown>;
  expect((sources.shop_inventory as unknown[]).length).toBe(1);
  expect(sources.poi_ids).toEqual(["poi-1"]);
});

test("item ecosystem places an item lifecycle consequence through a semantic preset", async ({ page }) => {
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
      entity_tracks: { ...storyTimelinePacket.entity_tracks, items: [] },
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
  await expect(page.getByTestId("story-presets-item")).toContainText("Transformed");
  await expect(page.getByTestId("placement-tray-requirement")).toBeVisible();
  await page.getByTestId("story-preset-item-consumed").click();
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("item");
  expect(link.target_id).toBe("item-1");
  expect(link.role).toBe("state");
  expect(link.occurrence_kind).toBe("consequence");
  expect(link.change_type).toBe("consumed");
  expect(link.importance).toBe("major");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City");
  await expect(page.getByTestId("story-placement-panel")).not.toContainText("Important item has no story placement.");
  await page.getByRole("button", { name: "Progression" }).click();
  await expect(page.getByTestId("item-journey-summary")).toContainText("Story Moments");
  await expect(page.getByTestId("item-journey-summary")).toContainText("Enter The First City");
  await expect(page.getByTestId("item-journey-summary")).toContainText("consumed");
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

test("world builder quick edits a sketch location without opening location authoring", async ({ page }) => {
  const world = { ...emptyWorld, locations: [] as Array<Record<string, unknown>> };
  let savedPayload: Record<string, unknown> | null = null;
  await mockApi(page, world, async (payload, route) => {
    savedPayload = payload;
    world.locations = payload.locations as Array<Record<string, unknown>>;
    await fulfillJson(route, world);
  });
  await page.goto("/author/world");

  await page.getByRole("button", { name: "Sketch" }).click();
  await page.getByTestId("world-map-board").click({ position: { x: 360, y: 260 } });
  await expect(page.getByText("Unsaved sketch location. Use Quick Edit")).toBeVisible();
  await expect(page.getByText("Inline Location Packet")).toHaveCount(0);

  await page.getByPlaceholder("Location name").fill("Glass Harbor");
  await page.getByPlaceholder("Region").fill("North Coast");
  await page.getByRole("button", { name: "Save Quick Edit" }).click();

  await expect.poll(() => savedPayload).not.toBeNull();
  const savedLocation = (savedPayload?.locations as Array<Record<string, unknown>>)[0];
  expect(savedLocation.name).toBe("Glass Harbor");
  expect(savedLocation.region).toBe("North Coast");
  expect(savedLocation.coordinates).toEqual({ x: expect.any(Number), y: expect.any(Number) });
  await expect(page.getByText("Location quick edit saved.")).toBeVisible();
  await expect(page.getByText("Inline Location Packet")).toBeVisible();
});

test("world builder restores a sketch draft into quick edit on page load", async ({ page }) => {
  const world = { ...emptyWorld, locations: [] as Array<Record<string, unknown>> };
  let savedPayload: Record<string, unknown> | null = null;
  await page.addInitScript(() => {
    localStorage.setItem("soa.draft.locations.draft-location-1", JSON.stringify({
      data: {
        id: "draft-location-1",
        slug: "draft-location-1",
        name: "Restored Draft",
        description: "",
        location_type: "Zone",
        place_kind: "Wilderness",
        coordinates: { x: 42, y: 38 },
        level_range: { min: 1, max: 5 },
        environment_tags: [],
        tags: ["sketch"],
      },
      ts: Date.now(),
    }));
  });
  await mockApi(page, world, async (payload, route) => {
    savedPayload = payload;
    world.locations = payload.locations as Array<Record<string, unknown>>;
    await fulfillJson(route, world);
  });
  await page.goto("/author/world");

  await expect(page.getByText("Unsaved sketch location. Use Quick Edit")).toBeVisible();
  await expect(page.getByPlaceholder("Location name")).toHaveValue("Restored Draft");
  await page.getByPlaceholder("Region").fill("Recovered Coast");
  await page.getByRole("button", { name: "Save Quick Edit" }).click();

  await expect.poll(() => savedPayload).not.toBeNull();
  const savedLocation = (savedPayload?.locations as Array<Record<string, unknown>>)[0];
  expect(savedLocation.id).toBe("draft-location-1");
  expect(savedLocation.region).toBe("Recovered Coast");
});

test("world builder places a selected location state through a semantic preset", async ({ page }) => {
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
  await expect(page.getByTestId("story-presets-location")).toContainText("Destroyed");
  await page.getByTestId("story-preset-location-occupied").click();
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("location");
  expect(link.target_id).toBe("location-1");
  expect(link.role).toBe("state");
  expect(link.occurrence_kind).toBe("transition");
  expect(link.change_type).toBe("changed");
  expect(link.importance).toBe("major");
  expect(link.state_label).toBe("Occupied");
});

test("story placement edits an existing canonical link with stale-record protection", async ({ page }) => {
  const world = {
    ...emptyWorld,
    locations: [{
      id: "location-1", slug: "first-city", name: "First City", location_type: "Zone", place_kind: "Settlement",
      coordinates: { x: 50, y: 50 }, level_range: { min: 1, max: 3 }, tags: [], environment_tags: [],
    }],
  };
  let previewed: Record<string, unknown> | null = null;
  let saved: Record<string, unknown> | null = null;
  await mockApi(
    page,
    world,
    undefined,
    async (payload, route) => {
      saved = payload;
      const updated = { ...(payload.adventure_beat_links as Array<Record<string, unknown>>)[0] };
      delete updated.expected_previous;
      await fulfillJson(route, {
        result: { review: { created: [], changed: [{ table: "adventure_beat_links", id: updated.id }], deleted: [] }, warnings: [], blockers: [] },
        packet: storyPacketWithLocationLink(updated),
      });
    },
    async (payload, route) => {
      previewed = payload;
      await fulfillJson(route, { review: { created: [], changed: [{ table: "adventure_beat_links", id: "adventure-link-1" }], deleted: [] }, warnings: [], blockers: [] });
    },
  );
  await page.goto("/author/world?selected=location-1");

  const panel = page.getByTestId("story-placement-panel");
  await expect(panel).toContainText("Enter The First City", { timeout: 15000 });
  await expect(panel.getByRole("button", { name: "Edit placement" })).toHaveCount(1, { timeout: 15000 });
  await panel.getByRole("button", { name: "Edit placement" }).click();
  const editor = page.getByTestId("story-placement-edit");
  await editor.getByTestId("story-preset-location-destroyed").click();
  await editor.getByLabel("State Label").fill("Ruined");
  await editor.getByRole("button", { name: "Preview Changes" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 changed");

  await expect.poll(() => previewed).not.toBeNull();
  const previewLink = (previewed?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(previewLink.id).toBe("adventure-link-1");
  expect(previewLink.role).toBe("state");
  expect(previewLink.occurrence_kind).toBe("consequence");
  expect(previewLink.change_type).toBe("destroyed");
  expect(previewLink.importance).toBe("critical");
  expect(previewLink.state_label).toBe("Ruined");
  expect(previewLink.target_type).toBe("location");
  expect(previewLink.target_id).toBe("location-1");
  expect(previewLink.notes).toBe("");
  expect(previewLink.tags).toEqual([]);
  expect(previewLink.expected_previous).toEqual(canonicalLocationLink);

  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Changes" }).click();
  await expect.poll(() => saved).not.toBeNull();
  await expect(page.getByTestId("story-placement-create")).toBeVisible();
  await expect(panel).toContainText("Ruined");
});

test("story placement removes only the canonical link through the deletion bundle", async ({ page }) => {
  const world = {
    ...emptyWorld,
    locations: [{
      id: "location-1", slug: "first-city", name: "First City", location_type: "Zone", place_kind: "Settlement",
      coordinates: { x: 50, y: 50 }, level_range: { min: 1, max: 3 }, tags: [], environment_tags: [],
    }],
  };
  let previewed: Record<string, unknown> | null = null;
  let saved: Record<string, unknown> | null = null;
  await mockApi(
    page,
    world,
    undefined,
    async (payload, route) => {
      saved = payload;
      await fulfillJson(route, {
        result: { review: { created: [], changed: [], deleted: [{ table: "adventure_beat_links", id: "adventure-link-1" }] }, warnings: [], blockers: [] },
        packet: storyPacketWithLocationLink(null),
      });
    },
    async (payload, route) => {
      previewed = payload;
      await fulfillJson(route, { review: { created: [], changed: [], deleted: [{ table: "adventure_beat_links", id: "adventure-link-1" }] }, warnings: [], blockers: [] });
    },
  );
  await page.goto("/author/world?selected=location-1");

  const panel = page.getByTestId("story-placement-panel");
  await expect(panel).toContainText("Enter The First City", { timeout: 15000 });
  await panel.getByRole("button", { name: "Edit placement" }).click();
  await page.getByTestId("story-placement-edit").getByRole("button", { name: "Preview Removal" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 deleted");

  await expect.poll(() => previewed).not.toBeNull();
  expect(previewed?.adventure_beat_links).toEqual([]);
  expect(previewed?.deletions).toEqual({ adventure_beats: [], adventure_beat_links: ["adventure-link-1"] });

  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Removal" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect(saved?.adventure_beat_links).toEqual([]);
  expect(saved?.deletions).toEqual({ adventure_beats: [], adventure_beat_links: ["adventure-link-1"] });
  await expect(panel.getByRole("button", { name: "Edit placement" })).toHaveCount(0);
  await expect(panel).toContainText("Welcome Event");
  await expect(page.getByRole("heading", { name: "First City" })).toBeVisible();
});

test("targeted lifecycle warnings appear in the owning workspace and timeline issues", async ({ page }) => {
  const world = {
    ...emptyWorld,
    locations: [{
      id: "location-1", slug: "first-city", name: "First City", location_type: "Zone", place_kind: "Settlement",
      coordinates: { x: 50, y: 50 }, level_range: { min: 1, max: 3 }, tags: [], environment_tags: [],
    }],
  };
  const message = "First City is restored without an earlier destroyed, unavailable, or changed state in this story lane.";
  const storyTimeline = {
    ...storyTimelinePacket,
    health: {
      ...storyTimelinePacket.health,
      warnings: [{
        code: "location_restored_without_prior_disruption",
        severity: "warning",
        schema_name: "adventure_beat_links",
        entry_id: "adventure-link-1",
        target_type: "location",
        target_id: "location-1",
        scope_kind: "story_arc",
        scope_id: "arc-1",
        message,
      }],
    },
  };
  await mockApi(page, world, undefined, undefined, undefined, storyTimeline);
  await page.goto("/author/world?selected=location-1");

  const panel = page.getByTestId("story-placement-panel");
  await expect(panel).toContainText(message, { timeout: 15000 });
  await expect(panel.getByTestId("story-context-strip")).toContainText("1 warning");

  await page.goto("/author/story-timeline");
  await page.getByRole("button", { name: "Issues", exact: true }).click();
  await expect(page.getByText(message)).toBeVisible();
});

test("world builder state layer filters canonical location lifecycle", async ({ page }) => {
  const world = {
    ...emptyWorld,
    locations: [
      {
        id: "location-1", slug: "first-city", name: "First City", location_type: "Zone", place_kind: "Settlement",
        coordinates: { x: 50, y: 50 }, level_range: { min: 1, max: 3 }, tags: [], environment_tags: [],
      },
      {
        id: "location-2", slug: "market-road", name: "Market Road", location_type: "Zone", place_kind: "Road",
        coordinates: { x: 70, y: 50 }, level_range: { min: 1, max: 3 }, tags: [], environment_tags: [],
      },
    ],
  };
  const message = "Location First City has 3 scoped event uses in story arc arc-1 but no canonical introduced placement in this story lane.";
  const destroyedTrack = {
    id: "adventure-link:location-destroyed",
    link_id: "location-destroyed",
    entity_kind: "location",
    entity_id: "location-1",
    label: "First City",
    timeline_id: "timeline-1",
    story_arc_id: "arc-1",
    source_kind: "adventure_beat",
    source_id: "adventure-beat-1",
    source_label: "First City Falls",
    order: 1,
    role: "state",
    occurrence_kind: "consequence",
    change_type: "destroyed",
    state_label: "Ruined",
    importance: "critical",
  };
  const activeTrack = {
    ...mockEntityTrack("location", "location-2", "Market Road"),
    id: "adventure-link:location-active",
    link_id: "location-active",
    change_type: "active",
    state_label: "",
  };
  const storyTimeline = {
    ...storyTimelinePacket,
    entity_tracks: {
      ...storyTimelinePacket.entity_tracks,
      locations: [destroyedTrack, activeTrack],
    },
    health: {
      ...storyTimelinePacket.health,
      warnings: [{
        code: "location_missing_introduction_placement",
        severity: "warning",
        schema_name: "locations",
        entry_id: "location-1",
        target_type: "location",
        target_id: "location-1",
        scope_kind: "story_arc",
        scope_id: "arc-1",
        message,
      }],
    },
  };
  await mockApi(page, world, undefined, undefined, undefined, storyTimeline);
  await page.goto("/author/world?selected=location-1");

  await page.getByRole("button", { name: "State", exact: true }).click();
  await page.getByLabel("Lifecycle Filter").selectOption("destroyed");

  const firstCityMapNode = page.locator("button[title*='Story state: destroyed']");
  await expect(firstCityMapNode).toBeVisible();
  await expect(firstCityMapNode).toHaveAttribute("title", /First City/);
  await expect(page.locator("button[title*='Market Road']")).toHaveCount(0);
  await expect(page.getByTestId("location-story-state-panel")).toContainText("First City Falls");
  await expect(page.getByTestId("location-story-state-panel")).toContainText("Ruined");
  await expect(page.getByTestId("location-story-state-panel")).toContainText(message);
  await expect(page.getByTestId("location-story-state-panel").getByRole("link", { name: "Open Timeline" })).toHaveAttribute("href", /track=location/);
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
  onPreview?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dialogues") return fulfillJson(route, [dialoguePacket.dialogue]);
    if (url.pathname === "/api/ui/dialogues/dialogue-1") return fulfillJson(route, dialoguePacket);
    if (url.pathname === "/api/ui/dialogues/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onPreview) return onPreview(payload, route);
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

const canonicalLocationLink = {
  id: "adventure-link-1",
  adventure_beat_id: "adventure-beat-1",
  target_type: "location",
  target_id: "location-1",
  role: "setting",
  occurrence_kind: "appearance",
  change_type: "active",
  state_label: null,
  starts_at_beat_id: null,
  ends_at_beat_id: null,
  continuity_group_id: "location-1",
  importance: "major",
  sort_order: 0,
  notes: null,
  tags: [],
};

function mockEntityTrack(entityKind: string, entityId: string, label: string) {
  return {
    id: `adventure-link:${entityKind}-link`,
    link_id: `${entityKind}-link`,
    entity_kind: entityKind,
    entity_id: entityId,
    label,
    timeline_id: "timeline-1",
    story_arc_id: "arc-1",
    source_kind: "adventure_beat",
    source_id: "adventure-beat-1",
    source_label: "Enter The First City",
    order: 0,
    role: "reference",
    occurrence_kind: "appearance",
    change_type: "active",
    importance: "major",
  };
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
      attachments: [{ ...canonicalLocationLink, label: "First City" }],
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
      link_id: "adventure-link-1",
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
    characters: [mockEntityTrack("character", "char-1", "Guide")],
    quests: [mockEntityTrack("quest", "quest-1", "Arrival")],
    events: [mockEntityTrack("event", "event-1", "Welcome Event")],
    dialogues: [mockEntityTrack("dialogue", "dialogue-1", "Welcome")],
    encounters: [mockEntityTrack("encounter", "encounter-1", "Road Ambush")],
    lore_entries: [mockEntityTrack("lore_entry", "lore-1", "City Charter")],
    items: [mockEntityTrack("item", "item-1", "Signal Key")],
    factions: [mockEntityTrack("faction", "faction-1", "City Watch")],
    story_arcs: [mockEntityTrack("story_arc", "arc-1", "The First City")],
  },
  unplaced: { story_arc_ids: [], quest_ids: [], event_ids: [], character_story_beat_ids: [], adventure_beat_ids: [] },
  catalogs: {
    quests: [{ id: "quest-1", title: "Arrival", description: "Reach the city." }],
    events: [{ id: "event-1", title: "Welcome Event", location_id: "location-1", dialogue_id: "dialogue-1" }],
    character_story_beats: [{ id: "beat-1", title: "Guide Welcomes The Player", character_id: "char-1", event_id: "event-1" }],
    adventure_beats: [{ id: "adventure-beat-1", title: "Enter The First City", story_arc_id: "arc-1", beat_type: "Introduction" }],
    adventure_beat_links: [canonicalLocationLink],
    characters: [{ id: "char-1", name: "Guide" }],
    locations: [{ id: "location-1", name: "First City" }],
    dialogues: [{ id: "dialogue-1", title: "Welcome" }],
    encounters: [{ id: "encounter-1", name: "Road Ambush" }],
    lore_entries: [{ id: "lore-1", title: "City Charter" }],
    items: [{ id: "item-1", name: "Signal Key" }],
    factions: [{ id: "faction-1", name: "City Watch" }],
  },
  dependency_index: { nodes: [], edges: [{ id: "quest:quest-1>unlocks>event:event-1", source: "quest:quest-1", target: "event:event-1", relation: "unlocks", explicit: false }], health: {} },
  health: { warnings: [], dependency: {} },
};

function storyPacketWithLocationLink(link: Record<string, unknown> | null) {
  const placementLink = link ? { ...link, label: "First City" } : null;
  const track = link ? {
    id: `adventure-link:${String(link.id)}`,
    link_id: link.id,
    entity_kind: "location",
    entity_id: "location-1",
    label: "First City",
    timeline_id: "timeline-1",
    story_arc_id: "arc-1",
    source_kind: "adventure_beat",
    source_id: "adventure-beat-1",
    source_label: "Enter The First City",
    order: 0,
    role: link.role,
    occurrence_kind: link.occurrence_kind,
    change_type: link.change_type,
    state_label: link.state_label,
    importance: link.importance,
  } : null;
  return {
    ...storyTimelinePacket,
    placements: storyTimelinePacket.placements.map((placement) => placement.kind === "adventure_beat"
      ? { ...placement, attachments: placementLink ? [placementLink] : [] }
      : placement),
    entity_tracks: {
      ...storyTimelinePacket.entity_tracks,
      locations: track ? [track] : [],
    },
    catalogs: {
      ...storyTimelinePacket.catalogs,
      adventure_beat_links: link ? [link] : [],
    },
  };
}

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

test("character studio shows occurrences and places a character consequence", async ({ page }) => {
  const introductionWarning = "Character Guide has 3 scoped uses in story arc arc-1 (1 dialogue, 1 encounter, 1 character story beat) but no canonical introduced or joins placement in this story lane.";
  const characterStoryTimeline = {
    ...storyTimelinePacket,
    health: {
      ...storyTimelinePacket.health,
      warnings: [{
        code: "character_missing_introduction_placement",
        severity: "warning",
        schema_name: "characters",
        entry_id: "char-1",
        target_type: "character",
        target_id: "char-1",
        scope_kind: "story_arc",
        scope_id: "arc-1",
        usage_count: 3,
        usage_counts: { dialogue: 1, encounter: 1, character_story_beat: 1 },
        usage_evidence: [
          { kind: "dialogue", entry_id: "dialogue-1", label: "Welcome", scope_kind: "story_arc", scope_id: "arc-1", order: 0 },
          { kind: "encounter", entry_id: "encounter-1", label: "Road Ambush", scope_kind: "story_arc", scope_id: "arc-1", order: 0 },
          { kind: "character_story_beat", entry_id: "beat-1", label: "Guide Welcomes The Player", scope_kind: "story_arc", scope_id: "arc-1", order: 0 },
        ],
        message: introductionWarning,
      }],
    },
  };
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
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, characterStoryTimeline);
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
          ...characterStoryTimeline,
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
  await expect(page.getByTestId("story-placement-panel")).toContainText(introductionWarning);
  await expect(page.getByTestId("story-context-strip")).toContainText("1 warning");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Main Story / The First City");
  await expect(page.getByTestId("story-placement-panel").getByRole("link", { name: "Open Timeline" })).toHaveAttribute("href", /\/author\/story-timeline/);
  await page.locator("aside").filter({ hasText: "Context Dock" }).getByRole("button", { name: "Presence" }).click();
  await expect(page.getByTestId("character-presence-timeline")).toContainText("Presence Summary");
  await expect(page.getByTestId("character-presence-timeline")).toContainText("Guide Welcomes The Player");
  await expect(page.getByTestId("character-presence-timeline")).toContainText("Welcome");
  await expect(page.getByTestId("character-presence-timeline")).toContainText("Usage");
  await expect(page.getByTestId("character-presence-timeline")).toContainText(introductionWarning);
  await expect(page.getByTestId("story-presets-character")).toContainText("Returns");
  await page.getByTestId("story-preset-character-dies").click();
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();
  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.adventure_beat_id).toBe("adventure-beat-1");
  expect(link.target_type).toBe("character");
  expect(link.target_id).toBe("char-1");
  expect(link.role).toBe("state");
  expect(link.occurrence_kind).toBe("consequence");
  expect(link.change_type).toBe("dies");
  expect(link.importance).toBe("critical");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City");

  await page.goto("/author/story-timeline");
  await page.getByRole("button", { name: "Issues", exact: true }).click();
  await expect(page.getByText(introductionWarning)).toBeVisible();
});

test("character studio authors a cross-entity item consequence as separate beat links", async ({ page }) => {
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
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, {
      ...storyTimelinePacket,
      catalogs: {
        ...storyTimelinePacket.catalogs,
        adventure_beat_links: [canonicalLocationLink],
        items: [{ id: "item-1", name: "Signal Key" }],
      },
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
        packet: storyTimelinePacket,
      });
    }
    return fulfillJson(route, []);
  });

  await page.goto("/author/characters/char-1");
  await expect(page.getByTestId("cross-entity-consequence")).toBeVisible();
  await page.getByLabel("Target Type").selectOption("item");
  await page.getByLabel("Explicit Target").selectOption("item-1");
  await page.getByTestId("cross-entity-preset-item-destroyed").click();
  await page.getByTestId("cross-entity-consequence").getByRole("button", { name: "Preview Consequence" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("2 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Consequence" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const links = saved?.adventure_beat_links as Array<Record<string, unknown>>;
  expect(links).toHaveLength(2);
  expect(links[0]).toEqual(expect.objectContaining({
    adventure_beat_id: "adventure-beat-1",
    target_type: "character",
    target_id: "char-1",
    role: "cast",
    occurrence_kind: "appearance",
    change_type: "active",
  }));
  expect(links[1]).toEqual(expect.objectContaining({
    adventure_beat_id: "adventure-beat-1",
    target_type: "item",
    target_id: "item-1",
    role: "state",
    occurrence_kind: "consequence",
    change_type: "destroyed",
    state_label: "Destroyed",
    importance: "critical",
  }));
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
  }, undefined, async (_payload, route) => {
    await fulfillJson(route, { review: { created: [{ table: "dialogue_nodes", id: "node-new" }], changed: [], deleted: [], unlinked: [] }, warnings: [{ id: "warning-1", message: "Acknowledge this reassignment." }], health_warnings: [], blockers: [] });
  });
  await page.goto("/author/dialogues/dialogue-1");

  await page.getByTestId("dialogue-node-node-2").getByRole("button", { name: "+ Choice" }).click();
  await expect(page.getByText("3 lines /")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Flow" })).toBeDisabled();
  await page.locator('[data-testid^="dialogue-node-"]').last().getByRole("textbox").fill("A newly drafted line.");
  await page.getByRole("button", { name: "Save Flow" }).click();
  await expect(page.getByRole("button", { name: "Commit Bundle" })).toBeDisabled();
  await page.getByText("Acknowledge this reassignment.").click();
  await expect(page.getByRole("button", { name: "Commit Bundle" })).toBeEnabled();
  await page.getByRole("button", { name: "Commit Bundle" }).click();

  await expect.poll(() => saved).not.toBeNull();
  expect((saved?.nodes as unknown[]).length).toBe(3);
});

test("dialogue flow places a dialogue state consequence through a semantic preset", async ({ page }) => {
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
  await expect(page.getByTestId("story-presets-dialogue")).toContainText("Reveals Lore");
  await page.getByTestId("story-preset-dialogue-sets-state").click();
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("dialogue");
  expect(link.target_id).toBe("dialogue-1");
  expect(link.role).toBe("state");
  expect(link.occurrence_kind).toBe("consequence");
  expect(link.change_type).toBe("changed");
  expect(link.importance).toBe("major");
  expect(link.state_label).toBe("State Set");
});

test("dialogue flow authors an explicit faction consequence as separate beat links", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await mockDialogueApi(page, undefined, async (payload, route) => {
    saved = payload;
    const links = payload.adventure_beat_links as Array<Record<string, unknown>>;
    await fulfillJson(route, {
      result: { review: { created: links.map((link) => ({ table: "adventure_beat_links", id: link.id })), changed: [], deleted: [] }, warnings: [], blockers: [] },
      packet: storyTimelinePacket,
    });
  });
  await page.goto("/author/dialogues/dialogue-1");

  const consequenceTray = page.getByTestId("cross-entity-consequence");
  await expect(consequenceTray).toBeVisible();
  await consequenceTray.getByLabel("Target Type").selectOption("faction");
  await consequenceTray.getByLabel("Explicit Target").selectOption("faction-1");
  await page.getByTestId("cross-entity-preset-faction-hostile").click();
  await consequenceTray.getByRole("button", { name: "Preview Consequence" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("2 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Consequence" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const links = saved?.adventure_beat_links as Array<Record<string, unknown>>;
  expect(links).toHaveLength(2);
  expect(links[0]).toEqual(expect.objectContaining({
    adventure_beat_id: "adventure-beat-1",
    target_type: "dialogue",
    target_id: "dialogue-1",
    role: "runtime",
    occurrence_kind: "appearance",
    change_type: "active",
  }));
  expect(links[1]).toEqual(expect.objectContaining({
    adventure_beat_id: "adventure-beat-1",
    target_type: "faction",
    target_id: "faction-1",
    role: "state",
    occurrence_kind: "consequence",
    change_type: "changed",
    state_label: "Hostile",
    importance: "major",
  }));
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
    requirements_id: "req-1", participants: [], rewards: { xp: 0, items: [{ item_id: "item-1", quantity: 1 }], currencies: [{ currency_id: "currency-1", amount: 5 }], reputation: [{ faction_id: "faction-1", amount: -2 }], flags_set: ["flag-1"] }, tags: [],
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
  items: [{ id: "item-1", name: "Signal Key" }],
  currencies: [{ id: "currency-1", name: "Gold" }],
  factions: [{ id: "faction-1", name: "City Watch" }],
  flags: [{ id: "flag-1", name: "Bridge Open" }],
  encounter_tables: [{
    id: "table-1", slug: "table-1", location_id: "loc-1", name: "Road Table", encounter_entries: [], environmental_modifiers: [], tags: [],
    location: { id: "loc-1", slug: "loc-1", name: "Old Road" },
  }],
  placements: [],
  context: { pois: [], events: [] },
};

const encounterStageStoryPacket = {
  ...storyTimelinePacket,
  entity_tracks: {
    ...storyTimelinePacket.entity_tracks,
    encounters: [{
      ...mockEntityTrack("encounter", "enc-1", "Road Ambush"),
      link_id: "enc-link",
      id: "adventure-link:enc-link",
      role: "runtime",
    }],
    locations: [{
      ...mockEntityTrack("location", "location-1", "Old Road"),
      link_id: "loc-consequence-link",
      id: "adventure-link:loc-consequence-link",
      role: "state",
      occurrence_kind: "consequence",
      change_type: "destroyed",
      state_label: "Destroyed",
      importance: "critical",
    }],
  },
  catalogs: {
    ...storyTimelinePacket.catalogs,
    encounters: [{ id: "enc-1", name: "Road Ambush" }],
    items: [{ id: "item-1", name: "Signal Key" }],
    factions: [{ id: "faction-1", name: "City Watch" }],
    locations: [{ id: "location-1", name: "Old Road" }],
  },
};

async function mockEncounterApi(page: Page, onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/encounters/enc-1") return fulfillJson(route, encounterPacket);
    if (url.pathname === "/api/ui/encounters") return fulfillJson(route, encounterPacket);
    if (url.pathname === "/api/ui/adventure-timeline") return fulfillJson(route, encounterStageStoryPacket);
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
  const aftermath = page.locator("section").filter({ has: page.getByRole("heading", { name: "Encounter Aftermath" }) });
  await expect(aftermath).toBeVisible();
  await expect(aftermath.getByRole("link", { name: "Signal Key" })).toBeVisible();
  await expect(aftermath.getByText("Bridge Open")).toBeVisible();
  await expect(aftermath.getByRole("link", { name: "City Watch" })).toBeVisible();
  await expect(aftermath.getByRole("link", { name: "Old Road" })).toBeVisible();
  await page.getByRole("button", { name: /Profileless/ }).click();
  await page.getByRole("button", { name: "Combat !" }).click();
  await expect(page.getByText("Profileless uses Combat without a combat profile.")).toBeVisible();
  await expect(aftermath.getByRole("link", { name: "Profileless" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "XP" }).fill("40");
  await expect(aftermath.getByText("40")).toBeVisible();
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

test("encounter stage places a decisive outcome through a semantic preset", async ({ page }) => {
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
  await expect(page.getByTestId("story-presets-encounter")).toContainText("Encounter Resolved");
  await page.getByTestId("story-preset-encounter-boss-defeated").click();
  await page.getByTestId("story-placement-create").getByRole("button", { name: "Preview Placement" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("1 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Placement" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const link = (saved?.adventure_beat_links as Array<Record<string, unknown>>)[0];
  expect(link.target_type).toBe("encounter");
  expect(link.target_id).toBe("enc-1");
  expect(link.role).toBe("state");
  expect(link.occurrence_kind).toBe("consequence");
  expect(link.change_type).toBe("changed");
  expect(link.importance).toBe("critical");
  expect(link.state_label).toBe("Boss Defeated");
  await expect(page.getByTestId("story-placement-panel")).toContainText("Enter The First City");
});

test("encounter stage authors an explicit location consequence as separate beat links", async ({ page }) => {
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
        packet: storyTimelinePacket,
      });
    }
    if (url.pathname === "/api/encounters") return fulfillJson(route, encounterPacket.encounters);
    if (url.pathname === "/api/characters") return fulfillJson(route, encounterPacket.characters.map((entry) => entry.character));
    if (url.pathname === "/api/combat_profiles") return fulfillJson(route, []);
    return fulfillJson(route, []);
  });

  await page.goto("/author/encounters/enc-1");
  const consequenceTray = page.getByTestId("cross-entity-consequence");
  await expect(consequenceTray).toBeVisible();
  await consequenceTray.getByLabel("Target Type").selectOption("location");
  await consequenceTray.getByLabel("Explicit Target").selectOption("location-1");
  await page.getByTestId("cross-entity-preset-location-destroyed").click();
  await consequenceTray.getByRole("button", { name: "Preview Consequence" }).click();
  await expect(page.getByTestId("story-placement-review")).toContainText("2 created");
  await page.getByTestId("story-placement-review").getByRole("button", { name: "Commit Consequence" }).click();

  await expect.poll(() => saved).not.toBeNull();
  const links = saved?.adventure_beat_links as Array<Record<string, unknown>>;
  expect(links).toHaveLength(2);
  expect(links[0]).toEqual(expect.objectContaining({
    adventure_beat_id: "adventure-beat-1",
    target_type: "encounter",
    target_id: "enc-1",
    role: "runtime",
    occurrence_kind: "appearance",
    change_type: "active",
  }));
  expect(links[1]).toEqual(expect.objectContaining({
    adventure_beat_id: "adventure-beat-1",
    target_type: "location",
    target_id: "location-1",
    role: "state",
    occurrence_kind: "consequence",
    change_type: "destroyed",
    state_label: "Destroyed",
    importance: "critical",
  }));
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
    combat_profiles: [
      { id: "profile-1", character_id: "char-1", character: { id: "char-1", name: "Ash Duelist" }, enemy_type: "boss", aggression: "Hostile", custom_abilities: [], status_rules: [] },
    ],
    encounters: [
      { id: "encounter-1", slug: "gate-duel", name: "Gate Duel", encounter_type: "Combat", participants: [{ character_id: "char-1", combat_side: "Hostile", contexts: ["Boss"] }], tags: ["boss"] },
      { id: "encounter-2", slug: "road-ambush", name: "Road Ambush", encounter_type: "Combat", participants: [{ character_id: "char-missing", combat_side: "Hostile", contexts: ["Combat"] }], tags: [] },
    ],
    characterclasses: [],
    talent_nodes: [],
    items: [{ id: "item-1", name: "Shared Wand" }],
    characters: [{ id: "char-1", name: "Ash Duelist" }],
  },
  usage: {
    abilities: { "ability-1": { combat_profiles: [], characterclasses: [], talent_nodes: [] } },
    effects: { "effect-shared": { abilities: [{ id: "ability-1", name: "Flame Pulse" }], items: [{ id: "item-1", name: "Shared Wand" }] } },
    statuses: {},
  },
  analysis: { similar_abilities: [] },
};

async function mockAbilityApi(
  page: Page,
  onBundle?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
  onPreview?: (payload: Record<string, unknown>, route: Route) => Promise<void>,
) {
  await page.route("http://localhost:5000/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ui/abilities" || url.pathname === "/api/ui/abilities/ability-1") return fulfillJson(route, abilityPacket);
    if (url.pathname === "/api/ui/abilities/preview" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (onPreview) return onPreview(payload, route);
      const created = [payload.ability, ...(payload.effect_upserts as unknown[] || []), ...(payload.status_upserts as unknown[] || [])]
        .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
        .map((entry, index) => ({ table: index === 0 ? "abilities" : "bundle_records", id: entry.id }));
      return fulfillJson(route, { review: { created, changed: [], deleted: [] }, warnings: [], health_warnings: [], blockers: [] });
    }
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
  let previewed: Record<string, unknown> | null = null;
  await mockAbilityApi(page, async (payload, route) => {
    saved = payload;
    await fulfillJson(route, { ...abilityPacket, ability: payload.ability, linked_effects: payload.effect_upserts, linked_statuses: payload.status_upserts });
  }, async (payload, route) => {
    previewed = payload;
    await fulfillJson(route, { review: { created: [{ table: "abilities", id: "ability-1" }, { table: "effects", id: "effect-new" }, { table: "statuses", id: "status-new" }], changed: [], deleted: [] }, warnings: [], health_warnings: [], blockers: [] });
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
  await expect(page.getByRole("heading", { name: "Ability Bundle Review" })).toBeVisible();
  await expect.poll(() => previewed).not.toBeNull();
  await page.getByRole("button", { name: "Commit Bundle" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect((saved?.effect_upserts as Array<Record<string, unknown>>).length).toBe(1);
  expect((saved?.status_upserts as Array<Record<string, unknown>>).length).toBe(1);
});

test("ability spellcraft keeps the shared review open after a failed commit", async ({ page }) => {
  await mockAbilityApi(page, async (_payload, route) => {
    await fulfillJson(route, { message: "Ability changed on the server.", path: "ability" }, 400);
  });
  await page.goto("/author/abilities/new");
  await page.getByLabel("Name").first().fill("Changed Ability");
  await page.getByRole("button", { name: "Save All" }).first().click();
  await page.getByRole("button", { name: "Commit Bundle" }).click();
  await expect(page.getByRole("heading", { name: "Ability Bundle Review" })).toBeVisible();
  await expect(page.getByText(/Ability changed on the server/)).toBeVisible();
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

test("ability spellcraft assigns encounter roles through combat profiles", async ({ page }) => {
  let previewed: Record<string, unknown> | null = null;
  await mockAbilityApi(page, undefined, async (payload, route) => {
    previewed = payload;
    await fulfillJson(route, { review: { created: [], changed: [{ table: "combat_profiles", id: "profile-1" }], deleted: [] }, warnings: [], health_warnings: [], blockers: [] });
  });
  await page.goto("/author/abilities/ability-1");
  const usagePanel = page.locator("section").filter({ hasText: "Usage & Combat Assignment" });
  await expect(usagePanel).toContainText("Gate Duel");
  await expect(usagePanel).toContainText("Road Ambush");
  await expect(usagePanel).toContainText("Create a combat profile before this role can receive abilities.");
  await usagePanel.getByTestId("ability-encounter-role-encounter-1-char-1").getByRole("button", { name: "Assign" }).click();
  await expect(usagePanel.getByTestId("ability-encounter-role-encounter-1-char-1")).toContainText("Assigned");
  await page.getByRole("button", { name: "Save All" }).first().click();

  await expect.poll(() => previewed).not.toBeNull();
  expect(previewed?.assigned_combat_profile_ids).toEqual(["profile-1"]);
  expect((previewed?.combat_profile_upserts as Array<Record<string, unknown>>)[0].id).toBe("profile-1");
});
