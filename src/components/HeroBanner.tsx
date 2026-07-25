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
  bannerHeight?: number;
  autoplayDelay?: number;
}

const HeroBanner: React.FC<HeroBannerProps> = ({
  bannerImage,
  bannerImages = [],
  bannerHeight = 256,
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

  const slideHeight = Math.round(Math.min(bannerHeight, typeof window !== 'undefined' && window.innerWidth < 640 ? 180 : bannerHeight) * 0.85);

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
    <div className="w-full">
      <div
        className="relative overflow-hidden"
        style={{ height: `${slideHeight}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {hasImages ? (
          <Carousel
            setApi={setApi}
            opts={{
              loop: false,
              align: 'center',
            }}
            plugins={hasMultipleImages ? [
              Autoplay({
                delay: autoplayDelay,
                stopOnInteraction: false,
                stopOnMouseEnter: true,
              }),
            ] : []}
            className="w-full h-full"
          >
            <CarouselContent className="h-full -ml-0">
              {clonedImages.map((image, index) => {
                const isCenter = (index - 1) === current;
                return (
                  <CarouselItem
                    key={index}
                    className={`h-full pl-0 basis-full transition-all duration-500 ease-out relative ${isCenter ? 'z-10' : 'z-0'
                      }`}
                  >
                    <div
                        className={`w-full h-full overflow-hidden transition-all duration-500 ease-out relative ${isCenter
                        ? 'scale-100'
                        : 'opacity-50'
                        }`}
                      style={{ height: `${slideHeight}px` }}
                    >
                      {/* Slide image */}
                      <img
                        src={resolveIconUrl(image)}
                        alt=""
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />

                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>

            {/* Hover arrows */}
            {hasMultipleImages && (
              <>
                <button
                  onClick={goPrev}
                  className={`absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg transition-all duration-300 hover:bg-white/30 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                    }`}
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={goNext}
                  className={`absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg transition-all duration-300 hover:bg-white/30 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
                    }`}
                  aria-label="Next slide"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Progress bar indicators */}
            {hasMultipleImages && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
                {allImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => api?.scrollTo(index + 1)}
                    className="relative h-1 rounded-full overflow-hidden transition-all duration-300"
                    style={{ width: current === index ? 32 : 12 }}
                    aria-label={`Go to slide ${index + 1}`}
                  >
                    {/* Background track */}
                    <div className="absolute inset-0 bg-white/30 rounded-full" />
                    {/* Fill */}
                    <div
                      className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all"
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
          <div className="w-full h-full bg-neutral-900 rounded-2xl animate-pulse" />
        )}
      </div>

      <style>{``}</style>
    </div>
  );
};

export default HeroBanner;
