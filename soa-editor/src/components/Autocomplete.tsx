import React, { useState, useEffect, useRef } from 'react';

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
}) => {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value && options.length > 0) {
      const selected = options.find((o) => getOptionValue(o) === value);
      setSelectedLabel(selected ? getOptionLabel(selected) : '');
    }
  }, [value, options, getOptionLabel, getOptionValue]);

  useEffect(() => {
    if (showDropdown && inputValue.length >= 0) {
      setLoading(true);
      fetchOptions(inputValue).then((opts) => {
        setOptions(opts);
        setLoading(false);
      });
    }
  }, [inputValue, showDropdown, fetchOptions]);

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

  return (
    <div className="form-field relative">
      <label className="font-medium text-gray-800 mb-1 block">{label}</label>
      {description && <p className="text-sm text-gray-500 mb-1">{description}</p>}
      <input
        ref={inputRef}
        type="text"
        className="w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 bg-white text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
        value={showDropdown ? inputValue : selectedLabel || ''}
        onChange={handleInputChange}
        onFocus={() => setShowDropdown(true)}
        onBlur={handleBlur}
        placeholder={placeholder || `Search ${label}...`}
        disabled={disabled}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="absolute z-10 left-0 right-0 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto mt-1">
          {loading ? (
            <div className="p-2 text-gray-500 text-sm">Loading...</div>
          ) : options.length === 0 ? (
            <div className="p-2 text-gray-500 text-sm">No results</div>
          ) : (
            options.map((option) => (
              <div
                key={getOptionValue(option)}
                className="px-3 py-2 hover:bg-blue-100 cursor-pointer"
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
