import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';

interface EventBanner {
  id: string;
  title: string | null;
  image: string;
  link: string | null;
}

const EventBannerCarousel: React.FC = () => {
  const [banners, setBanners] = useState<EventBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/event-banners');
        setBanners((data as EventBanner[]) || []);
      } catch {
        setBanners([]);
      }
      setLoading(false);
    })();
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.7;
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  if (loading || banners.length === 0) return null;

  return (
    <>
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-pink-500 text-sm">●</span>
          <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-50 uppercase tracking-wide">
            NEW EVENTS & PROMOTIONS
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-3 -mt-1 ml-4">
          Latest events, promotions, and website updates
        </p>

        <div className="relative group">
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden"
          >
            {banners.map((banner) => (
              <button
                key={banner.id}
                onClick={() => setLightbox(banner.image)}
                className="snap-start shrink-0 w-[55vw] sm:w-[42vw] lg:w-[28vw] max-w-[380px] aspect-[21/9] rounded-2xl overflow-hidden border border-white/10 dark:border-zinc-700/50 bg-zinc-200 dark:bg-zinc-800 hover:scale-[1.02] transition-transform duration-300 focus:outline-none"
              >
                <img
                  src={banner.image}
                  alt={banner.title || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>

          {banners.length > 1 && (
            <>
              <button
                onClick={() => scroll('left')}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightbox}
            alt="Event banner"
            className="max-w-full max-h-full object-contain rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default EventBannerCarousel;
