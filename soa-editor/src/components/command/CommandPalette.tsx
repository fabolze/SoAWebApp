import { useEffect, useMemo, useRef, useState } from "react";
import { TEXT_CLASSES } from "../../styles/uiTokens";

export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  disabled?: boolean;
  run: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  title?: string;
  items: CommandPaletteItem[];
  onClose: () => void;
}

export default function CommandPalette({
  open,
  title = "Command Palette",
  items,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = `${item.title} ${item.subtitle || ""} ${(item.keywords || []).join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlightedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (highlightedIndex >= filtered.length) {
      setHighlightedIndex(filtered.length > 0 ? filtered.length - 1 : 0);
    }
  }, [filtered.length, highlightedIndex, open]);

  const runItem = async (item: CommandPaletteItem | undefined) => {
    if (!item || item.disabled) return;
    await item.run();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 px-4 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <div className={`text-sm font-semibold ${TEXT_CLASSES.body}`}>{title}</div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runItem(filtered[highlightedIndex]);
              }
            }}
            placeholder="Type a command..."
            className="mt-2 w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className={`px-4 py-3 text-sm ${TEXT_CLASSES.muted}`}>No matching commands.</div>
          ) : (
            filtered.map((item, index) => {
              const active = index === highlightedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => runItem(item)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 ${
                    active ? "bg-slate-100" : "bg-white"
                  } ${item.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}
                >
                  <div className={`text-sm font-medium ${TEXT_CLASSES.body}`}>{item.title}</div>
                  {item.subtitle && <div className={`text-xs mt-0.5 ${TEXT_CLASSES.muted}`}>{item.subtitle}</div>}
                </button>
              );
            })
          )}
        </div>
        <div className={`px-4 py-2 text-xs ${TEXT_CLASSES.subtle} bg-slate-50 rounded-b-xl`}>
          `Ctrl+K` open, `Enter` run, `Esc` close
        </div>
      </div>
    </div>
  );
}
