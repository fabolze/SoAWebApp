import React, { useEffect, useMemo, useRef, useState } from 'react';
import useDebouncedValue from './hooks/useDebouncedValue';

export type SearchableOption = {
  value: string;
  label: string;
};

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  valueLabel?: string;
  searchDebounceMs?: number;
  virtualizeThreshold?: number;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  valueLabel,
  searchDebounceMs = 120,
  virtualizeThreshold = 120,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(240);
  const debouncedInputValue = useDebouncedValue(inputValue, searchDebounceMs);
  const rowHeight = 36;
  const overscan = 6;

  useEffect(() => {
    const selected = options.find((o) => o.value === value);
    setSelectedLabel(selected ? selected.label : '');
  }, [value, options]);

  useEffect(() => {
    if (valueLabel) {
      setSelectedLabel(valueLabel);
    }
  }, [valueLabel]);

  const filteredOptions = useMemo(() => {
    const query = debouncedInputValue.toLowerCase();
    if (!query) return options;
    return options.filter((o) => o.label.toLowerCase().includes(query));
  }, [options, debouncedInputValue]);

  const isVirtualized = filteredOptions.length >= virtualizeThreshold;
  const startIndex = isVirtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const visibleCount = isVirtualized ? Math.ceil(viewportHeight / rowHeight) + overscan * 2 : filteredOptions.length;
  const endIndex = isVirtualized ? Math.min(filteredOptions.length, startIndex + visibleCount) : filteredOptions.length;
  const visibleOptions = isVirtualized ? filteredOptions.slice(startIndex, endIndex) : filteredOptions;
  const totalHeight = filteredOptions.length * rowHeight;

  const handleFocus = () => {
    setInputValue(selectedLabel || '');
    setShowDropdown(true);
  };

  const handleBlur = () => {
    setTimeout(() => setShowDropdown(false), 150);
  };

  useEffect(() => {
    if (!showDropdown) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1);
    setScrollTop(0);
    if (dropdownRef.current) {
      dropdownRef.current.scrollTop = 0;
      setViewportHeight(dropdownRef.current.clientHeight || 240);
    }
  }, [showDropdown, filteredOptions.length]);

  useEffect(() => {
    if (!showDropdown || highlightedIndex < 0 || !dropdownRef.current) return;
    const container = dropdownRef.current;
    const itemTop = highlightedIndex * rowHeight;
    const itemBottom = itemTop + rowHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (itemTop < viewTop) {
      container.scrollTop = itemTop;
    } else if (itemBottom > viewBottom) {
      container.scrollTop = itemBottom - container.clientHeight;
    }
  }, [showDropdown, highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showDropdown) {
        setShowDropdown(true);
        return;
      }
      setHighlightedIndex((prev) => {
        if (filteredOptions.length === 0) return -1;
        const next = prev < 0 ? 0 : Math.min(prev + 1, filteredOptions.length - 1);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!showDropdown) {
        setShowDropdown(true);
        return;
      }
      setHighlightedIndex((prev) => {
        if (filteredOptions.length === 0) return -1;
        const next = prev <= 0 ? 0 : prev - 1;
        return next;
      });
    } else if (e.key === 'Enter') {
      if (showDropdown && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault();
        const option = filteredOptions[highlightedIndex];
        onChange(option.value);
        setInputValue(option.label);
        setShowDropdown(false);
      }
    } else if (e.key === 'Escape') {
      if (showDropdown) {
        e.preventDefault();
        setShowDropdown(false);
      }
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 bg-white text-gray-800 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        value={showDropdown ? inputValue : selectedLabel || ''}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-10 left-0 right-0 bg-white text-slate-900 border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto mt-1"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {filteredOptions.length === 0 ? (
            <div className="p-2 text-gray-500 text-sm">No results</div>
          ) : isVirtualized ? (
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: startIndex * rowHeight, left: 0, right: 0 }}>
                {visibleOptions.map((option, index) => {
                  const absoluteIndex = startIndex + index;
                  return (
                    <div
                      key={option.value}
                      className={`px-3 py-2 cursor-pointer text-slate-900 hover:bg-slate-100 ${highlightedIndex === absoluteIndex ? 'bg-slate-100' : ''}`}
                      style={{ height: rowHeight }}
                      onMouseDown={() => {
                        onChange(option.value);
                        setInputValue(option.label);
                        setShowDropdown(false);
                      }}
                    >
                      {option.label}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            visibleOptions.map((option, index) => (
              <div
                key={option.value}
                className={`px-3 py-2 cursor-pointer text-slate-900 hover:bg-slate-100 ${highlightedIndex === index ? 'bg-slate-100' : ''}`}
                onMouseDown={() => {
                  onChange(option.value);
                  setInputValue(option.label);
                  setShowDropdown(false);
                }}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
