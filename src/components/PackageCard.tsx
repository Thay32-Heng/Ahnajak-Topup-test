import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Package, useSite } from '@/contexts/SiteContext';
import { resolveIconUrl } from '@/lib/icon-url';

interface PackageCardProps {
  pkg: Package;
  selected: boolean;
  onSelect: () => void;
  gameDefaultIcon?: string;
  priority?: boolean;
  isSpecial?: boolean;
}

const PackageCard: React.FC<PackageCardProps> = ({
  pkg,
  selected,
  onSelect,
  gameDefaultIcon,
  priority = false,
  isSpecial = false,
}) => {
  const { settings } = useSite();
  const [iconLoaded, setIconLoaded] = useState(false);
  const [iconError, setIconError] = useState(false);

  const iconSrc = resolveIconUrl(pkg.icon || gameDefaultIcon || settings.packageIconUrl, settings.iconCdnBaseUrl);
  const primaryColor = settings.primaryColor || (settings.siteName === 'KESOR TOPUP' ? '#D4A84B' : '#E53E3E');

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group relative w-full rounded-2xl transition-[transform] duration-200 ease-out text-center sm:text-left",
        "hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none",
      )}
    >
      <div
        className={cn(
          "relative flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full overflow-hidden rounded-2xl p-2 sm:p-3 border shadow-sm transition-[border-color,box-shadow] duration-200",
          !settings.packageBgImage && !settings.packageBgColor && (
            selected
              ? "bg-zinc-50/50 dark:bg-zinc-900/60"
              : "bg-white/80 dark:bg-zinc-900/20 hover:border-zinc-300 dark:hover:border-zinc-800"
          )
        )}
        style={{
          borderColor: selected ? primaryColor : (settings.packageBorderColor || 'rgba(228, 228, 231, 0.6)'),
          borderWidth: settings.packageBorderWidth !== undefined ? `${settings.packageBorderWidth}px` : undefined,
          boxShadow: selected ? `0 4px 20px -2px ${primaryColor}15, 0 0 0 2px ${primaryColor}10` : undefined,
          backgroundColor: settings.packageBgColor || undefined,
          backgroundImage: settings.packageBgImage ? `url(${settings.packageBgImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Left: Icon */}
        <div className="w-[90%] sm:w-[35%] aspect-square flex-shrink-0 z-10 relative">
          <div className="relative w-full h-full flex items-center justify-center p-0.5">
            {iconSrc && !iconError ? (
              <>
                {!iconLoaded && <div className="absolute inset-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 animate-pulse" />}
                <img
                  src={iconSrc}
                  alt=""
                  className="max-w-full max-h-full object-contain drop-shadow-md"
                  style={{ opacity: iconLoaded ? 1 : 0, transition: "opacity 200ms" }}
                  loading={priority ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={priority ? "high" : "low"}
                  onLoad={() => setIconLoaded(true)}
                  onError={() => {
                    setIconError(true);
                    setIconLoaded(true);
                  }}
                />
              </>
            ) : iconError ? (
              <span className="text-lg">💎</span>
            ) : null}
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex-1 flex flex-col items-center sm:items-start justify-center z-10 min-w-0 w-full">
          <div
            className="text-sm sm:text-base font-extrabold text-white leading-tight truncate drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.4)]"
            style={settings.packageTextColor ? { color: settings.packageTextColor } : {}}
          >
            {pkg.amount.toLocaleString()}
          </div>
          <div
            className="text-[10px] sm:text-xs text-white/95 font-medium leading-none mt-0.5 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
            style={settings.packageTextColor ? { color: settings.packageTextColor, opacity: 0.8 } : {}}
          >
            {pkg.name}
          </div>
          <div className="mt-1.5 flex items-center">
            <span
              className="inline-block px-2.5 py-0.5 rounded-lg text-xs sm:text-sm font-bold shadow-sm whitespace-nowrap transition-colors"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, color-mix(in srgb, ${primaryColor} 70%, #000))`,
                border: `1px solid color-mix(in srgb, ${primaryColor} 50%, transparent)`,
                color: settings.packagePriceColor || '#ffffff',
              }}
            >
              {settings.packageCurrencySymbol || "$"}{" "}
              {pkg.price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Points badge */}
        {pkg.points > 0 && (
          <div className="absolute top-1 right-2 flex items-center gap-0.5 text-[8px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded-md border border-zinc-200/50 dark:border-zinc-800/50 z-20">
            <span className="text-amber-500">★</span> {pkg.points}
          </div>
        )}

        {/* Label ribbon - bottom left */}
        {(isSpecial || pkg.label) && (
          <div className="absolute bottom-0 left-0 z-20 pointer-events-none">
            <div
              className="px-2 py-0.5 text-[7px] sm:text-[8px] font-black uppercase tracking-wider rounded-tr-md shadow-sm"
              style={{
                background: pkg.labelBgColor
                  ? pkg.labelBgColor
                  : `linear-gradient(to right, ${primaryColor}, color-mix(in srgb, ${primaryColor} 60%, white))`,
                color: pkg.labelTextColor || "#ffffff",
              }}
            >
              {pkg.label || "★ Hot"}
            </div>
          </div>
        )}

        {/* Selected Checkmark indicator inside right section */}
        {selected && (
          <div
            className="absolute bottom-2.5 right-2.5 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shadow-sm z-20 animate-fade-in"
            style={{ backgroundColor: primaryColor }}
          >
            ✓
          </div>
        )}
      </div>
    </button>
  );
};

export default React.memo(
  PackageCard,
  (prev, next) =>
    prev.pkg === next.pkg &&
    prev.selected === next.selected &&
    prev.priority === next.priority &&
    prev.gameDefaultIcon === next.gameDefaultIcon &&
    prev.isSpecial === next.isSpecial,
);
