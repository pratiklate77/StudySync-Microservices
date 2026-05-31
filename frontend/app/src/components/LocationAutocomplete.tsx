import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { sessionsApi, type LocationSuggestion } from '../api/sessions';

interface LocationAutocompleteProps {
  /** Placeholder text for the input */
  placeholder?: string;
  /** Callback when a location is selected */
  onSelect: (location: LocationSuggestion) => void;
  /** Initial value for the input */
  initialValue?: string;
  /** Optional external control of the input value */
  value?: string;
  /** Optional change handler for when input is typed (use with value) */
  onChange?: (value: string) => void;
  /** Disable the input */
  disabled?: boolean;
  /** Error state */
  error?: string;
}

const DEBOUNCE_MS = 400;

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  placeholder = 'Search for a city, area, or landmark...',
  onSelect,
  initialValue = '',
  value: externalValue,
  onChange: externalOnChange,
  disabled = false,
  error,
}) => {
  const [inputValue, setInputValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use external value if provided (controlled component)
  const currentValue = externalValue !== undefined ? externalValue : inputValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (externalValue === undefined) {
        setInputValue(val);
      }
      externalOnChange?.(val);

      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (val.trim().length < 2) {
        setSuggestions([]);
        setShowDropdown(true);
        return;
      }

      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await sessionsApi.searchLocations(val.trim());
          setSuggestions(results);
          setShowDropdown(results.length > 0);
          setActiveIndex(-1);
        } catch {
          setSuggestions([]);
          setShowDropdown(false);
        } finally {
          setLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    [externalValue, externalOnChange],
  );

  const handleSelect = useCallback(
    (location: LocationSuggestion) => {
      if (externalValue === undefined) {
        setInputValue(location.name);
      }
      externalOnChange?.(location.name);
      setSuggestions([]);
      setShowDropdown(false);
      onSelect(location);
    },
    [externalValue, externalOnChange, onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        handleSelect(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    },
    [showDropdown, suggestions, activeIndex, handleSelect],
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        {/* Search icon */}
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          {loading ? (
            <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-slate-400" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={currentValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full pl-10 pr-4 py-3 bg-slate-950 border ${
            error
              ? 'border-red-500 focus:border-red-500'
              : 'border-slate-800 focus:border-brand-indigo'
          } rounded-xl text-xs text-slate-200 outline-none transition-all placeholder-slate-500`}
        />
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`w-full flex items-start space-x-3 px-4 py-3 text-left transition-colors ${
                index === activeIndex
                  ? 'bg-brand-indigo/20 border-l-2 border-brand-indigo'
                  : 'hover:bg-slate-900 border-l-2 border-transparent'
              }`}
            >
              <MapPin className="h-4 w-4 text-brand-indigo shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {suggestion.name.split(',')[0]}
                </p>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                  {suggestion.name}
                </p>
                <p className="text-[9px] text-slate-600 font-mono mt-0.5">
                  {suggestion.latitude.toFixed(4)}°N, {suggestion.longitude.toFixed(4)}°E
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Error text */}
      {error && (
        <p className="text-[10px] text-red-400 mt-1.5 flex items-center space-x-1">
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

export default LocationAutocomplete;