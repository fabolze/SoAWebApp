import React, { useState, useEffect, useRef } from 'react';
import useDebouncedValue from './hooks/useDebouncedValue';

interface AutocompleteProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  fetchOptions: (search: string) => Promise<any[]>;
  getOptionLabel?: (option: any) => string;
  getOptionValue?: (option: any) => string;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
  valueLabel?: string;
  hideLabel?: boolean;
  hideDescription?: boolean;
}

const Autocomplete: React.FC<AutocompleteProps> = ({
  label,
  value,
  onChange,
  fetchOptions,
  getOptionLabel = (o) => o.name || o.title || o.id || JSON.stringify(o),
  getOptionValue = (o) => o.id || o,
  placeholder,
  disabled,
  description,
  valueLabel,
  hideLabel,
  hideDescription,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const requestSeqRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(240);
  const debouncedInputValue = useDebouncedValue(inputValue, 180);
  const rowHeight = 36;
  const overscan = 6;

  useEffect(() => {
    if (value && options.length > 0) {
      const selected = options.find((o) => getOptionValue(o) === value);
      setSelectedLabel(selected ? getOptionLabel(selected) : '');
    }
  }, [value, options, getOptionLabel, getOptionValue]);

  useEffect(() => {
    if (valueLabel) {
      setSelectedLabel(valueLabel);
    }
  }, [valueLabel]);

  useEffect(() => {
    if (!showDropdown) return;
    const requestId = ++requestSeqRef.current;
    setLoading(true);
    fetchOptions(debouncedInputValue)
      .then((opts) => {
        if (requestId !== requestSeqRef.current) return;
        setOptions(Array.isArray(opts) ? opts : []);
      })
      .catch(() => {
        if (requestId !== requestSeqRef.current) return;
        setOptions([]);
      })
      .finally(() => {
        if (requestId !== requestSeqRef.current) return;
        setLoading(false);
      });
  }, [debouncedInputValue, showDropdown, fetchOptions]);

  const isVirtualized = options.length >= 120;
  const startIndex = isVirtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const visibleCount = isVirtualized ? Math.ceil(viewportHeight / rowHeight) + overscan * 2 : options.length;
  const endIndex = isVirtualized ? Math.min(options.length, startIndex + visibleCount) : options.length;
  const visibleOptions = isVirtualized ? options.slice(startIndex, endIndex) : options;
  const totalHeight = options.length * rowHeight;

  useEffect(() => {
    if (!showDropdown) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex(options.length > 0 ? 0 : -1);
    setScrollTop(0);
    if (dropdownRef.current) {
      dropdownRef.current.scrollTop = 0;
      setViewportHeight(dropdownRef.current.clientHeight || 240);
    }
  }, [showDropdown, options]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowDropdown(true);
  };

  const handleSelect = (option: any) => {
    onChange(getOptionValue(option));
    setInputValue(getOptionLabel(option));
    setShowDropdown(false);
  };

  const handleBlur = () => {
    setTimeout(() => setShowDropdown(false), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showDropdown) {
        setShowDropdown(true);
        return;
      }
      setHighlightedIndex((prev) => {
        if (options.length === 0) return -1;
        const next = prev < 0 ? 0 : Math.min(prev + 1, options.length - 1);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!showDropdown) {
        setShowDropdown(true);
        return;
      }
      setHighlightedIndex((prev) => {
        if (options.length === 0) return -1;
        const next = prev <= 0 ? 0 : prev - 1;
        return next;
      });
    } else if (e.key === 'Enter') {
      if (showDropdown && highlightedIndex >= 0 && highlightedIndex < options.length) {
        e.preventDefault();
        handleSelect(options[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      if (showDropdown) {
        e.preventDefault();
        setShowDropdown(false);
      }
    }
  };

  return (
    <div className="form-field relative">
      {!hideLabel && <label className="font-medium text-gray-800 mb-1 block">{label}</label>}
      {!hideDescription && description && <p className="text-sm text-gray-500 mb-1">{description}</p>}
      <input
        ref={inputRef}
        type="text"
        className="w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 bg-white text-gray-800 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        value={showDropdown ? inputValue : selectedLabel || ''}
        onChange={handleInputChange}
        onFocus={() => {
          setInputValue(selectedLabel || '');
          setShowDropdown(true);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || `Search ${label}...`}
        disabled={disabled}
        autoComplete="off"
      />
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-10 left-0 right-0 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto mt-1"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {loading ? (
            <div className="p-2 text-gray-500 text-sm flex items-center gap-2">
              <span className="loading loading-spinner loading-sm"></span>
              Loading...
            </div>
          ) : options.length === 0 ? (
            <div className="p-2 text-gray-500 text-sm">No results</div>
          ) : isVirtualized ? (
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: startIndex * rowHeight, left: 0, right: 0 }}>
                {visibleOptions.map((option, index) => {
                  const absoluteIndex = startIndex + index;
                  return (
                    <div
                      key={String(getOptionValue(option))}
                      className={`px-3 py-2 cursor-pointer hover:bg-primary hover:text-white ${highlightedIndex === absoluteIndex ? 'bg-primary text-white' : ''}`}
                      style={{ height: rowHeight }}
                      onMouseDown={() => handleSelect(option)}
                    >
                      {getOptionLabel(option)}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            visibleOptions.map((option, index) => (
              <div
                key={getOptionValue(option)}
                className={`px-3 py-2 cursor-pointer hover:bg-primary hover:text-white ${highlightedIndex === index ? 'bg-primary text-white' : ''}`}
                onMouseDown={() => handleSelect(option)}
              >
                {getOptionLabel(option)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Autocomplete;
