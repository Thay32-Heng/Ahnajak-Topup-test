import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart } from 'lucide-react';
import { Game, useSite } from '@/contexts/SiteContext';
import { resolveIconUrl } from '@/lib/icon-url';

interface Props {
  game: Game;
  index: number;
}

const FeaturedGameCard: React.FC<Props> = ({ game, index }) => {
  const { settings } = useSite();
  const primaryColor = settings.primaryColor || '#D4A84B';
  const [favorited, setFavorited] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const subtitle = game.packages?.[0]?.name
    ? `${game.packages[0].name}`
    : 'Available Now';

  return (
    <div
      className="group animate-fade-in relative"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      <Link to={game.tags?.includes('vg') ? `/get-vg/${game.slug}` : `/topup/${game.slug}`} className="block h-full">
        <div className="relative h-[100px] bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden transition-all duration-250 ease-out shadow-md group-hover:-translate-y-1 group-hover:shadow-xl">
          {/* Hover glow */}
          <div
            className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ boxShadow: `inset 0 0 30px -5px ${primaryColor}40` }}
          />

          {/* Gradient border */}
          <div className="absolute inset-0 rounded-2xl p-[1.5px] pointer-events-none">
            <div
              className="w-full h-full rounded-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
              }}
            />
          </div>

          {/* White inner background */}
          <div className="absolute inset-[1.5px] rounded-2xl bg-white dark:bg-zinc-900" />

          {/* Content */}
          <div className="relative z-10 flex items-center h-full px-3 sm:px-4 gap-3">
            {/* Thumbnail container */}
            <div className="relative shrink-0">
              {/* Favorite button */}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setFavorited(!favorited); }}
                className="absolute top-0 left-0 z-20 w-[26px] h-[26px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] flex items-center justify-center transition-transform duration-200 active:scale-90 hover:scale-110"
                aria-label="Favorite"
              >
                <Heart
                  className="w-3 h-3 transition-colors duration-200"
                  style={{
                    color: primaryColor,
                    fill: favorited ? primaryColor : 'transparent',
                  }}
                />
              </button>

              {/* Image */}
              <div className="w-[64px] h-[64px] sm:w-[72px] sm:h-[72px] rounded-[14px] sm:rounded-[16px] overflow-hidden border-2 border-white dark:border-zinc-700 shadow-[0_2px_8px_rgba(0,0,0,0.06)] shrink-0 bg-zinc-100 dark:bg-zinc-800">
                {!imgLoaded && (
                  <div className="w-full h-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
                )}
                <img
                  src={resolveIconUrl(game.image)}
                  alt={game.name}
                  loading={index < 4 ? 'eager' : 'lazy'}
                  onLoad={() => setImgLoaded(true)}
                  className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-110 ${
                    imgLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </div>
            </div>

            {/* Game info */}
            <div className="flex-1 min-w-0 pr-1 sm:pr-0">
              <h3 className="font-bold text-[13px] sm:text-base text-zinc-900 dark:text-zinc-50 truncate leading-tight">
                {game.name}
              </h3>
              <p className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                {subtitle}
              </p>
            </div>

            {/* Action button */}
            <div className="shrink-0 ml-auto">
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-250 active:scale-95 group-hover:scale-110"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}bb)`,
                  boxShadow: `0 4px 14px -2px ${primaryColor}55`,
                }}
              >
                <ShoppingCart className="w-[16px] h-[16px] sm:w-4 sm:h-4 text-white" strokeWidth={2.2} />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default FeaturedGameCard;
