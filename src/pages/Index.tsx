import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Lottie from 'lottie-react';
import Header from '@/components/Header';
import HeaderSpacer from '@/components/HeaderSpacer';
import HeroBanner from '@/components/HeroBanner';
import GameCard from '@/components/GameCard';
import FeaturedGameCard from '@/components/FeaturedGameCard';
import EventBannerCarousel from '@/components/EventBannerCarousel';
import Footer from '@/components/Footer';
import { useSite } from '@/contexts/SiteContext';
import { useFavicon } from '@/hooks/useFavicon';
import {
  AlertCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const Index: React.FC = () => {
  const { settings, games, isLoading } = useSite();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('search') || '';

  const isKesor = settings.siteName?.toLowerCase().includes('kesor');
  const primaryColor = settings.primaryColor || (isKesor ? '#D4A84B' : '#E53E3E');

  const featuredRef = useRef<HTMLDivElement>(null);
  const [featuredIdx, setFeaturedIdx] = useState(0);

  const scrollToIndex = useCallback((dir: 'left' | 'right') => {
    if (!featuredRef.current) return;
    const cards = Array.from(featuredRef.current.children) as HTMLElement[];
    if (!cards.length) return;

    // Find current visible card (closest to left edge)
    const containerLeft = featuredRef.current.getBoundingClientRect().left;
    let currentIdx = 0;
    let minDist = Infinity;
    cards.forEach((card, i) => {
      const dist = Math.abs(card.getBoundingClientRect().left - containerLeft);
      if (dist < minDist) { minDist = dist; currentIdx = i; }
    });

    const next = dir === 'right'
      ? Math.min(currentIdx + 1, cards.length - 1)
      : Math.max(currentIdx - 1, 0);

    cards[next].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    setFeaturedIdx(next);
  }, []);

  useFavicon(settings.siteIcon);

  const featuredGames = useMemo(() => {
    let result = games.filter(game => game.tags?.includes('featured'));
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(game =>
        (game.name || '').toLowerCase().includes(query)
      );
    }
    return result;
  }, [games, searchQuery]);

  // Auto-slide every 10s
  useEffect(() => {
    if (featuredGames.length < 2) return;
    const id = setInterval(() => {
      scrollToIndex('right');
    }, 10000);
    return () => clearInterval(id);
  }, [featuredGames.length, scrollToIndex]);

  const filteredGames = useMemo(() => {
    let result = [...games];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(game =>
        (game.name || '').toLowerCase().includes(query)
      );
    }
    result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return result;
  }, [games, searchQuery]);

  return (
    <>
      <Helmet>
        <title>{settings.browserTitle || `${settings.siteName} - Game Topup Cambodia`}</title>
        <meta name="description" content="Top up your favorite games instantly. Mobile Legends, Free Fire, PUBG, and more. Fast, secure, and affordable." />
      </Helmet>

      <style>{`
        @keyframes fire {
          0%, 100% { transform: scale(1) rotate(0deg); filter: hue-rotate(0deg); }
          15% { transform: scale(1.25) rotate(-6deg); filter: hue-rotate(-10deg); }
          30% { transform: scale(0.95) rotate(4deg); filter: hue-rotate(5deg); }
          45% { transform: scale(1.15) rotate(-3deg); filter: hue-rotate(-5deg); }
          60% { transform: scale(1.05) rotate(2deg); filter: hue-rotate(8deg); }
          75% { transform: scale(1.2) rotate(-5deg); filter: hue-rotate(-8deg); }
          90% { transform: scale(0.9) rotate(3deg); filter: hue-rotate(3deg); }
        }
        .animate-fire {
          animation: fire 0.8s ease-in-out infinite;
          display: inline-block;
          transform-origin: center;
        }
      `}</style>

      <div className="min-h-screen flex flex-col bg-transparent text-foreground relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-30">
          <div className="absolute top-[5%] left-[5%] w-[45vw] h-[45vw] rounded-full bg-gold/10 blur-[130px]" />
          <div className="absolute top-[35%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-amber-500/5 blur-[160px]" />
          <div className="absolute bottom-[5%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-gold/5 blur-[140px]" />
        </div>
        {settings.backgroundImage && (
          <>
            <div 
              className="fixed inset-0 -z-20 pointer-events-none"
              style={{
                backgroundImage: `url(${settings.backgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="fixed inset-0 bg-background/80 -z-10 pointer-events-none" />
          </>
        )}
        <Header />
        <HeaderSpacer />

        <HeroBanner
          bannerImage={settings.bannerImage}
          bannerImages={settings.bannerImages}
          bannerHeight={settings.bannerHeight}
        />

        <section className="w-[90%] mx-auto py-6 sm:py-12 flex-1">
          {/* Event Banners Section */}
          <EventBannerCarousel />

          {/* Featured Games Section */}
          {!isLoading && featuredGames.length > 0 && (
            <div className="mb-8 sm:mb-10">
              {/* Section header with scroll buttons */}
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <Sparkles className="w-4 h-5 sm:w-5 sm:h-5" style={{ color: primaryColor }} />
                  {settings.featuredGamesTitle || 'Featured Games'}
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => { e.preventDefault(); scrollToIndex('left'); }}
                    className="w-8 h-8 rounded-full bg-white dark:bg-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="w-4 h-4 text-zinc-500" />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); scrollToIndex('right'); }}
                    className="w-8 h-8 rounded-full bg-white dark:bg-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    aria-label="Next"
                  >
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </button>
                </div>
              </div>

              {/* Carousel for all screen sizes */}
              <div className="relative">
                <div
                  ref={featuredRef}
                  className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden"
                >
                  {featuredGames.map((game, index) => (
                    <div key={`featured-${game.id}`} className="snap-start shrink-0 w-[43vw] sm:w-[45vw] lg:w-[22vw] max-w-[200px] sm:max-w-sm">
                      <FeaturedGameCard game={game} index={index} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="mb-5 sm:mb-6 text-center">
            <div 
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold border mb-2 sm:mb-3 animate-pulse"
              style={{ 
                backgroundColor: `${primaryColor}10`,
                color: primaryColor,
                borderColor: `${primaryColor}25`
              }}
            >
              <span className="inline-block animate-fire">🔥</span> TOP RECHARGES IN CAMBODIA
            </div>
            <h2 className="font-display text-xl sm:text-4xl font-black leading-tight text-zinc-900 dark:text-zinc-50 mb-2 sm:mb-3">
              ជ្រើសរើសទំនិញ
            </h2>
            <div 
              className="w-12 h-1 sm:w-16 rounded-full mx-auto"
              style={{ backgroundColor: primaryColor }}
            />
          </div>

          {/* All Games */}
          {isLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
              {[...Array(14)].map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse border border-zinc-100 dark:border-zinc-900" />
              ))}
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="text-center py-16 sm:py-24">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mb-4">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h3 className="text-base sm:text-lg font-bold mb-2 text-zinc-950 dark:text-zinc-50">រកមិនឃើញហ្គេមទេ</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {searchQuery
                  ? `មិនមានលទ្ធផលស្វែងរកសម្រាប់ "${searchQuery}" ឡើយ។`
                  : 'មិនមានហ្គេមឡើយនៅឡើយទេ។'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
              {filteredGames.map((game, index) => (
                <GameCard
                  key={game.id}
                  game={game}
                  cardBgColor={settings.gameCardBgColor}
                  cardBorderColor={settings.gameCardBorderColor}
                  cardFrameImage={settings.gameCardFrameImage}
                  cardBorderImage={settings.gameCardBorderImage}
                  priority={index < 4}
                  index={index}
                />
              ))}
            </div>
          )}
        </section>

        <Footer
          backgroundColor={settings.footerBgColor || undefined}
          textColor={settings.footerTextColor}
          copyrightText={settings.footerText}
          socialIcons={{
            telegram: settings.footerTelegramIcon,
            tiktok: settings.footerTiktokIcon,
            facebook: settings.footerFacebookIcon
          }}
          socialUrls={{
            telegram: settings.footerTelegramUrl,
            tiktok: settings.footerTiktokUrl,
            facebook: settings.footerFacebookUrl
          }}
          paymentIcons={settings.footerPaymentIcons}
        />
      </div>
    </>
  );
};

export default Index;
