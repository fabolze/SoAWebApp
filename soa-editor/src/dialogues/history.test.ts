import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, redoHistory, undoHistory } from "./history";

describe("dialogue history", () => {
  it("supports bounded undo and redo", () => {
    let history = createHistory("a");
    history = pushHistory(history, "b");
    history = pushHistory(history, "c");
    history = undoHistory(history);
    expect(history.present).toBe("b");
    history = redoHistory(history);
    expect(history.present).toBe("c");
  });
});
