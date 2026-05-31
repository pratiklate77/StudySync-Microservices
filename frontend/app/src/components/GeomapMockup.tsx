import React, { useState } from "react";
import { MapPin, Target, RefreshCw } from "lucide-react";

interface GeomapMockupProps {
  centerCoordinates?: [number, number]; // [lon, lat] e.g. [77.5946, 12.9716]
  interactive?: boolean;
  onSelectLocation?: (coords: [number, number]) => void;
  pins?: { coords: [number, number]; title: string; type?: string }[];
}

export const GeomapMockup: React.FC<GeomapMockupProps> = ({
  centerCoordinates = [77.5946, 12.9716],
  interactive = false,
  onSelectLocation,
  pins = [],
}) => {
  const [selectedCoords, setSelectedCoords] =
    useState<[number, number]>(centerCoordinates);

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert coordinate offsets relative to center mapping
    const newLon = Number(
      (centerCoordinates[0] + (x - rect.width / 2) * 0.0005).toFixed(4),
    );
    const newLat = Number(
      (centerCoordinates[1] - (y - rect.height / 2) * 0.0005).toFixed(4),
    );

    setSelectedCoords([newLon, newLat]);
    if (onSelectLocation) {
      onSelectLocation([newLon, newLat]);
    }
  };

  return (
    <div className="relative w-full h-64 md:h-80 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner select-none">
      {/* Decorative Mock Map Grid Canvas */}
      <div
        onClick={handleMapClick}
        className={`absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] bg-center cursor-pointer ${interactive ? "hover:bg-slate-850/40" : "cursor-default"}`}
      >
        {/* Ambient Map Contours */}
        <div className="absolute top-1/4 left-1/3 w-32 h-20 bg-brand-indigo/10 rounded-full blur-xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-40 h-28 bg-brand-violet/10 rounded-full blur-xl" />

        {/* Map Center Coordinates Text Overlay */}
        <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-sm border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-mono text-slate-400">
          Center: {centerCoordinates[0].toFixed(4)}°E,{" "}
          {centerCoordinates[1].toFixed(4)}°N
        </div>

        {/* Map Target Pin */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group pointer-events-none">
          <div className="bg-brand-indigo p-2 rounded-full shadow-lg ring-4 ring-brand-indigo/20 text-white animate-bounce">
            <Target className="h-5 w-5" />
          </div>
          <span className="bg-slate-950/90 text-white border border-slate-800 text-[10px] px-2 py-0.5 rounded shadow mt-1 whitespace-nowrap">
            Your Location
          </span>
        </div>

        {/* Selected coordinates Pin */}
        {interactive &&
          (selectedCoords[0] !== centerCoordinates[0] ||
            selectedCoords[1] !== centerCoordinates[1]) && (
            <div
              className="absolute flex flex-col items-center z-10"
              style={{
                left: `${50 + (selectedCoords[0] - centerCoordinates[0]) / 0.0005}%`,
                top: `${50 - (selectedCoords[1] - centerCoordinates[1]) / 0.0005}%`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <MapPin className="h-6 w-6 text-brand-emerald drop-shadow-md animate-glow" />
              <span className="bg-slate-950/95 text-brand-emerald border border-slate-800 text-[9px] px-1.5 py-0.5 rounded shadow mt-0.5 whitespace-nowrap">
                Selected
              </span>
            </div>
          )}

        {/* Dynamic Pins from nearby sessions */}
        {pins.map((pin, index) => {
          const xOffset = 50 + (pin.coords[0] - centerCoordinates[0]) / 0.0005;
          const yOffset = 50 - (pin.coords[1] - centerCoordinates[1]) / 0.0005;

          // Guard boundaries to fit layout
          if (xOffset < 5 || xOffset > 95 || yOffset < 5 || yOffset > 95)
            return null;

          return (
            <div
              key={index}
              className="absolute flex flex-col items-center group z-10"
              style={{
                left: `${xOffset}%`,
                top: `${yOffset}%`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <MapPin
                className={`h-6.5 w-6.5 ${pin.type === "paid" ? "text-brand-rose" : "text-brand-indigo"} drop-shadow-lg transition-transform hover:scale-125 cursor-pointer`}
              />

              {/* Tooltip on Pin Hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 text-white text-[10px] p-2 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap mb-1 z-30">
                <p className="font-bold">{pin.title}</p>
                <p className="text-[8px] text-slate-400 mt-0.5 font-mono">
                  {pin.coords[0]}, {pin.coords[1]}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Decorative controls */}
      <div className="absolute top-3 right-3 flex flex-col space-y-1.5">
        <button
          title="Reset Location"
          onClick={() => {
            setSelectedCoords(centerCoordinates);
            if (onSelectLocation) onSelectLocation(centerCoordinates);
          }}
          className="bg-slate-950/80 backdrop-blur-sm border border-slate-800 hover:bg-slate-900 text-slate-300 p-2 rounded-xl transition-all shadow"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
export default GeomapMockup;
