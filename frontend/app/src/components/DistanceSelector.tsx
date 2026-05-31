import React from 'react';
import { Navigation } from 'lucide-react';

export const DISTANCE_OPTIONS = [
  { value: 5, label: '5 km' },
  { value: 10, label: '10 km' },
  { value: 15, label: '15 km' },
  { value: 20, label: '20 km' },
  { value: 25, label: '25 km' },
  { value: 50, label: '50 km' },
  { value: 100, label: '100 km' },
] as const;

interface DistanceSelectorProps {
  /** Currently selected distance in km */
  value: number;
  /** Callback when distance changes */
  onChange: (distanceKm: number) => void;
  /** Disable the selector */
  disabled?: boolean;
}

export const DistanceSelector: React.FC<DistanceSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <Navigation className="h-4 w-4 text-slate-400" />
      </div>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full pl-10 pr-8 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {DISTANCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            Within {opt.label}
          </option>
        ))}
      </select>
      {/* Dropdown chevron */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        <svg
          className="h-4 w-4 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
};

export default DistanceSelector;