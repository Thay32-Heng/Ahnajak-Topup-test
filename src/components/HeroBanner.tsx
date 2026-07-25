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
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-xl"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {hasImages ? (
          <Carousel
            setApi={setApi}
            opts={{
              loop: false,
              align: 'center',        // FIXED: center instead of start
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
                    {/* FIXED: removed padding, inner bg, and rounded corners */}
                    <div className="w-full h-[240px] sm:h-[340px] md:h-[420px]">
                      <img
                        src={imgUrl}
                        alt="Hero Banner"
                        className="w-full h-full object-cover select-none"
                        loading={index === 1 ? 'eager' : 'lazy'}
                      />
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>

            {hasMultipleImages && (
              <>
                <button
                  onClick={goPrev}
                  className={`absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-white shadow-lg transition-all duration-300 hover:bg-black/90 hover:scale-105 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                    }`}
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={goNext}
                  className={`absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-white shadow-lg transition-all duration-300 hover:bg-black/90 hover:scale-105 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
                    }`}
                  aria-label="Next slide"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {hasMultipleImages && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
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
          <div className="w-full h-[340px] bg-[#0d0d0d] animate-pulse rounded-2xl" />
        )}
      </div>
    </div>
  );
};

export default HeroBanner;