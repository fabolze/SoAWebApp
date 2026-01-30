import React, { useEffect, useMemo, useRef, useState } from 'react';

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
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  valueLabel,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

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
    const query = inputValue.toLowerCase();
    if (!query) return options;
    return options.filter((o) => o.label.toLowerCase().includes(query));
  }, [options, inputValue]);

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
  }, [showDropdown, filteredOptions.length]);

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
        <div className="absolute z-10 left-0 right-0 bg-white text-slate-900 border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto mt-1">
          {filteredOptions.length === 0 ? (
            <div className="p-2 text-gray-500 text-sm">No results</div>
          ) : (
            filteredOptions.map((option, index) => (
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
