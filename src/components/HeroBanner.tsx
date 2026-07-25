import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveIconUrl } from '@/lib/icon-url';

interface HeroBannerProps {
  bannerImage?: string;
  bannerImages?: string[];
  autoplayDelay?: number;
}

const HeroBanner: React.FC<HeroBannerProps> = ({
  bannerImage,
  bannerImages = [],
  autoplayDelay = 4000
}) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const allImages = React.useMemo(() => {
    const images: string[] = [];
    if (bannerImages && bannerImages.length > 0) {
      images.push(...bannerImages);
    } else if (bannerImage) {
      images.push(bannerImage);
    }
    return images;
  }, [bannerImage, bannerImages]);

  const clonedImages = React.useMemo(() => {
    if (allImages.length <= 1) return allImages;
    return [allImages[allImages.length - 1], ...allImages, allImages[0]];
  }, [allImages]);

  const totalReal = allImages.length;
  const hasImages = allImages.length > 0;
  const hasMultipleImages = allImages.length > 1;

  // Progress bar timer
  const startProgress = useCallback(() => {
    if (progressRef.current) clearInterval(progressRef.current);
    setProgress(0);
    const step = 50;
    const increment = (step / autoplayDelay) * 100;
    progressRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 0;
        return prev + increment;
      });
    }, step);
  }, [autoplayDelay]);

  useEffect(() => {
    if (!api || !hasMultipleImages) return;

    api.scrollTo(1, false);
    startProgress();

    const onSelect = () => {
      const index = api.selectedScrollSnap();

      if (index === 0) {
        setTimeout(() => {
          api.scrollTo(totalReal, false);
          setCurrent(totalReal - 1);
        }, 0);
        startProgress();
        return;
      }

      if (index === clonedImages.length - 1) {
        setTimeout(() => {
          api.scrollTo(1, false);
          setCurrent(0);
        }, 0);
        startProgress();
        return;
      }

      setCurrent(index - 1);
      startProgress();
    };

    api.on('select', onSelect);

    return () => {
      api.off('select', onSelect);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [api, totalReal, clonedImages.length, startProgress]);

  // Pause progress on hover
  useEffect(() => {
    if (isHovered && progressRef.current) {
      clearInterval(progressRef.current);
    } else if (!isHovered && hasMultipleImages) {
      startProgress();
    }
  }, [isHovered, hasMultipleImages, startProgress]);

  const goPrev = () => {
    if (!api) return;
    const idx = api.selectedScrollSnap();
    if (idx <= 1) {
      api.scrollTo(totalReal, true);
    } else {
      api.scrollPrev();
    }
  };

  const goNext = () => {
    if (!api) return;
    const idx = api.selectedScrollSnap();
    if (idx >= clonedImages.length - 2) {
      api.scrollTo(1, true);
    } else {
      api.scrollNext();
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-2xl"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {hasImages ? (
          <Carousel
            setApi={setApi}
            opts={{
              loop: false,
              align: 'start',
            }}
            plugins={hasMultipleImages ? [
              Autoplay({
                delay: autoplayDelay,
                stopOnInteraction: false,
                stopOnMouseEnter: true,
              }),
            ] : []}
            className="w-full"
          >
            <CarouselContent className="-ml-0">
              {clonedImages.map((image, index) => {
                const imgUrl = resolveIconUrl(image);
                return (
                  <CarouselItem
                    key={index}
                    className="basis-full pl-0 relative"
                  >
                    {/* Responsive Container */}
                    <div className="w-full h-[220px] sm:h-[320px] md:h-[400px] relative overflow-hidden flex items-center justify-center">

                      {/* 1. Blurred Background Image (Fills gaps auto-optimized) */}
                      <img
                        src={imgUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-40 select-none pointer-events-none"
                      />

                      {/* 2. Main Auto-Fit Image */}
                      <img
                        src={imgUrl}
                        alt="Banner"
                        className="relative z-10 max-w-full max-h-full object-contain rounded-xl shadow-lg select-none"
                        loading="lazy"
                      />

                      {/* 3. Smooth Vignette Edge */}
                      <div className="absolute inset-0 z-15 bg-gradient-to-t from-neutral-950/80 via-transparent to-neutral-950/20 pointer-events-none" />
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>

            {/* Navigation Arrows */}
            {hasMultipleImages && (
              <>
                <button
                  onClick={goPrev}
                  className={`absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white shadow-xl transition-all duration-300 hover:bg-black/80 hover:scale-105 active:scale-95 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                    }`}
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={goNext}
                  className={`absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white shadow-xl transition-all duration-300 hover:bg-black/80 hover:scale-105 active:scale-95 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
                    }`}
                  aria-label="Next slide"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            {/* Progress Bar Indicators */}
            {hasMultipleImages && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-30 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                {allImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => api?.scrollTo(index + 1)}
                    className="relative h-1.5 rounded-full overflow-hidden transition-all duration-300"
                    style={{ width: current === index ? 28 : 10 }}
                    aria-label={`Go to slide ${index + 1}`}
                  >
                    <div className="absolute inset-0 bg-white/20 rounded-full" />
                    <div
                      className="absolute inset-y-0 left-0 bg-red-500 rounded-full transition-all"
                      style={{
                        width: current === index ? `${Math.min(progress, 100)}%` : index < current ? '100%' : '0%',
                        transitionDuration: current === index ? '50ms' : '300ms',
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </Carousel>
        ) : (
          <div className="w-full h-[350px] bg-neutral-900 animate-pulse rounded-2xl" />
        )}
      </div>
    </div>
  );
};

export default HeroBanner;