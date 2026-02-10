import { useContext } from "react";
import { DirtyStateContext } from "./DirtyStateContext";

export function useDirtyState() {
  const ctx = useContext(DirtyStateContext);
  if (!ctx) {
    throw new Error("useDirtyState must be used within DirtyStateProvider");
  }
  return ctx;
}
