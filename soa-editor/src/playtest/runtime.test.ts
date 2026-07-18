import { describe, expect, it } from "vitest";
import { applyEncounterVictory, canTravelTo, createNewGame, gainXp, maxHealth, playerDamage, type PlayState } from "./runtime";

describe("browser playtest campaign runtime", () => {
  it("starts with a coherent playable build", () => {
    const state = createNewGame("Ari");
    expect(state.playerName).toBe("Ari");
    expect(state.inventory.wornBlade).toBe(1);
    expect(state.equipment.weapon).toBe("wornBlade");
    expect(playerDamage(state)).toBe(16);
    expect(maxHealth(state)).toBe(100);
  });

  it("gates routes in quest order", () => {
    const start = createNewGame();
    expect(canTravelTo(start, "forest").allowed).toBe(false);
    const accepted = { ...start, questStage: "reach-forest" as const };
    expect(canTravelTo(accepted, "forest").allowed).toBe(true);
    expect(canTravelTo(accepted, "swamp").allowed).toBe(false);
    const forestWon = applyEncounterVictory({ ...accepted, location: "forest" }, "forest");
    expect(forestWon.questStage).toBe("cross-fen");
    expect(canTravelTo(forestWon, "swamp").allowed).toBe(true);
  });

  it("resolves encounter rewards once and advances the campaign", () => {
    let state: PlayState = { ...createNewGame(), questStage: "reach-forest", location: "forest" };
    state = applyEncounterVictory(state, "forest");
    expect(state.gold).toBe(58);
    expect(state.xp).toBe(55);
    const duplicate = applyEncounterVictory(state, "forest");
    expect(duplicate.gold).toBe(58);
    state = applyEncounterVictory({ ...state, location: "swamp" }, "swamp");
    expect(state.inventory.missingScarf).toBe(1);
    state = applyEncounterVictory({ ...state, location: "ruins" }, "ruins");
    expect(state.inventory.portalFragment).toBe(1);
    expect(state.inventory.resonanceCharm).toBe(1);
    expect(state.questStage).toBe("return");
  });

  it("awards levels and talent points deterministically", () => {
    const state = gainXp(createNewGame(), 220);
    expect(state.level).toBe(2);
    expect(state.xp).toBe(120);
    expect(state.talentPoints).toBe(2);
  });
});
