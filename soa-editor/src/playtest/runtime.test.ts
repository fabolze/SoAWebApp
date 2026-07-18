import { describe, expect, it } from "vitest";
import { applyEncounterVictory, canTravelTo, canUnlockTalent, createNewGame, equipItem, gainXp, maxHealth, playerArmor, playerDamage, purchaseItem, sellItem, tonicHealing, unequipItem, unlockTalent, type PlayState } from "./runtime";

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

  it("keeps the forge economy finite and supports safe resale", () => {
    let state = createNewGame();
    const bought = purchaseItem(state, "travelCoat");
    expect(bought.reason).toBeUndefined();
    state = bought.state;
    expect(state.gold).toBe(18);
    expect(state.shopStock.travelCoat).toBe(0);
    expect(state.inventory.travelCoat).toBe(1);
    expect(purchaseItem(state, "travelCoat").reason).toMatch(/sold out/i);

    state = equipItem(state, "travelCoat");
    expect(sellItem(state, "travelCoat").reason).toMatch(/unequip/i);
    state = unequipItem(state, "armor");
    const sold = sellItem(state, "travelCoat");
    expect(sold.value).toBe(12);
    expect(sold.state.gold).toBe(30);
    expect(sold.state.shopStock.travelCoat).toBe(1);
  });

  it("applies equipment and talent branch bonuses", () => {
    let state: PlayState = { ...createNewGame(), inventory: { ...createNewGame().inventory, travelCoat: 1, marshWard: 1 } };
    state = equipItem(state, "travelCoat");
    state = equipItem(state, "marshWard");
    expect(maxHealth(state)).toBe(118);
    expect(playerArmor(state)).toBe(5);

    expect(canUnlockTalent(state, "bastion").reason).toMatch(/resolve/i);
    state = unlockTalent(state, "resolve");
    state = { ...state, talentPoints: 1 };
    state = unlockTalent(state, "bastion");
    expect(maxHealth(state)).toBe(144);
    expect(playerArmor(state)).toBe(8);
  });

  it("improves tonic healing through fieldcraft only after its prerequisite", () => {
    let state = createNewGame();
    expect(tonicHealing(state)).toBe(35);
    expect(canUnlockTalent(state, "fieldcraft").allowed).toBe(false);
    state = unlockTalent(state, "quickstep");
    state = { ...state, talentPoints: 1 };
    state = unlockTalent(state, "fieldcraft");
    expect(tonicHealing(state)).toBe(50);
  });
});
