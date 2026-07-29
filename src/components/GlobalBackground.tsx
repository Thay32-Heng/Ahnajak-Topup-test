import React from 'react';
import { useSite } from '@/contexts/SiteContext';

function hexToHSL(hex: string): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const GlobalBackground: React.FC = () => {
  const { settings } = useSite();
  const bgType = settings.bgType || 'color';
  const bgTheme = settings.bgTheme || 'dark';
  const bgColor = settings.backgroundColor || '#000000';
  const primaryColor = settings.primaryColor || '#D4A84B';
  const accentColor = settings.accentColor || '#B38F3D';
  const bgImageUrl = settings.bgImageUrl || '';
  const bgVideoUrl = settings.bgVideoUrl || '';

  const goldHSL = hexToHSL(primaryColor);
  const goldLight = hexToHSL(lighten(primaryColor, 20));
  const goldDark = hexToHSL(darken(primaryColor, 20));
  const goldGlow = hexToHSL(lighten(primaryColor, 10));

  const isLightBg = (() => {
    if (bgType === 'color' || bgType === 'gradient') {
      if (!bgColor.startsWith('#') || bgColor.length !== 7) return false;
      const hex = bgColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
      return yiq >= 128;
    }
    return bgTheme === 'light';
  })();

  return (
    <>
      <style>{`
        :root {
          --gold: ${goldHSL};
          --gold-light: ${goldLight};
          --gold-dark: ${goldDark};
          --gold-glow: ${goldGlow};
          --gradient-gold: linear-gradient(135deg, hsl(${goldGlow}), hsl(${goldDark}));
          --shadow-gold: 0 4px 20px -4px hsl(${goldHSL} / 0.4);
          --sidebar-primary: ${goldHSL};
          --sidebar-border: ${hexToHSL(lighten(primaryColor, 15))};
          --sidebar-ring: ${goldHSL};
        }
      `}</style>
      <div className="fixed inset-0 w-full h-full z-[-9999] pointer-events-none overflow-hidden">
        {/* 1. Base solid background color */}
        <div 
          className="absolute inset-0 w-full h-full transition-colors duration-500" 
          style={{ backgroundColor: bgType === 'color' ? bgColor : '#000000' }} 
        />

        {/* 2. Gradient background */}
        {bgType === 'gradient' && (
          <div 
            className="absolute inset-0 w-full h-full transition-all duration-500"
            style={{ 
              background: `linear-gradient(135deg, ${bgColor} 0%, ${primaryColor}60 50%, ${accentColor}40 100%)` 
            }}
          />
        )}

        {/* 3. Image background */}
        {bgType === 'image' && bgImageUrl && (
          <div 
            className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat transition-all duration-500"
            style={{ backgroundImage: `url(${bgImageUrl})` }}
          />
        )}

        {/* 4. Video background */}
        {bgType === 'video' && bgVideoUrl && (
          <video 
            src={bgVideoUrl}
            autoPlay 
            loop 
            muted 
            playsInline
            className="absolute inset-0 w-full h-full object-cover transition-all duration-500"
          />
        )}

        {/* 5. Overlay */}
        {bgType === 'image' || bgType === 'video' ? (
          <div
            className="absolute inset-0 w-full h-full z-10 transition-all duration-500"
            style={{
              backgroundColor: isLightBg ? 'rgba(255,255,255,0.6)' : 'rgba(9,9,11,0.85)',
            }}
          />
        ) : !isLightBg ? (
          <div className="absolute inset-0 w-full h-full bg-zinc-950/85 z-10 transition-all duration-500" />
        ) : null}
      </div>
    </>
  );
};

function lighten(hex: string, percent: number): string {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  r = Math.min(255, r + Math.round(255 * percent / 100));
  g = Math.min(255, g + Math.round(255 * percent / 100));
  b = Math.min(255, b + Math.round(255 * percent / 100));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darken(hex: string, percent: number): string {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  r = Math.max(0, r - Math.round(255 * percent / 100));
  g = Math.max(0, g - Math.round(255 * percent / 100));
  b = Math.max(0, b - Math.round(255 * percent / 100));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default GlobalBackground;
