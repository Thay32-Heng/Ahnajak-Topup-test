import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSite } from '@/contexts/SiteContext';
import { toast } from '@/hooks/use-toast';
import { Sparkles, Save, Paintbrush, ShieldCheck, Image, Video, MonitorPlay } from 'lucide-react';

const AiTab: React.FC = () => {
  const { settings, updateSettings } = useSite();
  const [siteName, setSiteName] = useState(settings.siteName || 'Ahnajak Topup');
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor || '#D4A84B');
  const [accentColor, setAccentColor] = useState(settings.accentColor || '#B38F3D');
  const [bgType, setBgType] = useState<'color' | 'gradient' | 'image' | 'video'>(settings.bgType || 'color');
  const [bgTheme, setBgTheme] = useState<'light' | 'dark'>(settings.bgTheme || 'dark');
  const [backgroundColor, setBackgroundColor] = useState(settings.backgroundColor || '#000000');
  const [bgImageUrl, setBgImageUrl] = useState(settings.bgImageUrl || '');
  const [bgVideoUrl, setBgVideoUrl] = useState(settings.bgVideoUrl || '');
  const [saving, setSaving] = useState(false);

  // Common premium dark theme presets
  const presets = [
    { name: 'Amber Gold (Default)', primary: '#D4A84B', accent: '#B38F3D' },
    { name: 'Neon Cyan', primary: '#0ea5e9', accent: '#0284c7' },
    { name: 'Electric Purple', primary: '#a855f7', accent: '#7e22ce' },
    { name: 'Emerald Green', primary: '#10b981', accent: '#047857' },
    { name: 'Crimson Red', primary: '#ef4444', accent: '#b91c1c' },
  ];

  const handleApplyPreset = (primary: string, accent: string) => {
    setPrimaryColor(primary);
    setAccentColor(accent);
    toast({
      title: 'Preset selected',
      description: `Applied colors. Click "Save & Train AI" to persist and update your website.`,
    });
  };

  const handleSaveAndTrain = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        siteName: siteName,
        browserTitle: `${siteName} - Game Topup Cambodia`,
        primaryColor: primaryColor,
        accentColor: accentColor,
        bgType: bgType,
        backgroundColor: backgroundColor,
        bgImageUrl: bgImageUrl,
        bgVideoUrl: bgVideoUrl,
      };
      if (bgType === 'image' || bgType === 'video') {
        updates.bgTheme = bgTheme;
      }

      updateSettings(updates);
      toast({
        title: 'Settings saved!',
        description: `Brand renamed to "${siteName}" with new colors and background.`,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: 'Error saving settings',
        description: error.message || 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Introduction Card */}
      <Card className="border-gold/30 bg-gold/10 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gold">
            <Sparkles className="w-5 h-5 animate-pulse" />
            AI Customization & Training Center
          </CardTitle>
          <CardDescription className="text-gold/70">
            Configure your brand name, page background types, color codes, and automatically write instructions that train future AI developer agents to match your styling requirements.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Brand Renaming */}
        <Card className="border-border bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-gold" />
              Brand & Title Manager
            </CardTitle>
            <CardDescription>Rename your portal everywhere instantly</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-muted-foreground">Brand Name</label>
              <Input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Enter new brand name (e.g. Ahnajak Topup)"
                className="bg-background border-input focus:border-gold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-muted-foreground">Browser Page Title (Preview)</label>
              <Input
                value={`${siteName} - Game Topup Cambodia`}
                disabled
                className="bg-muted/50 border-border text-muted-foreground"
              />
            </div>
          </CardContent>
        </Card>

        {/* Theme Settings */}
        <Card className="border-border bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Paintbrush className="w-5 h-5 text-gold" />
              Accent Colors
            </CardTitle>
            <CardDescription>Set the colors and accents for your client pages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-muted-foreground">Primary Accent</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 border border-input rounded bg-transparent cursor-pointer"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="bg-background border-input text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-muted-foreground">Secondary Accent</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-10 h-10 border border-input rounded bg-transparent cursor-pointer"
                  />
                  <Input
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="bg-background border-input text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color Presets</label>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <Button
                    key={preset.name}
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplyPreset(preset.primary, preset.accent)}
                    className="border-border hover:border-primary hover:bg-accent text-xs text-foreground"
                  >
                    <span 
                      className="w-2.5 h-2.5 rounded-full mr-1.5" 
                      style={{ backgroundColor: preset.primary }}
                    />
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Background Settings Card */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-gold" />
            Global Website Background Manager (All Pages)
          </CardTitle>
          <CardDescription>Configure the background style that applies to every page on your client website</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Background Type Selection */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-muted-foreground">Background Mode</label>
            <div className="flex gap-2">
              {(['color', 'gradient', 'image', 'video'] as const).map((type) => (
                <Button
                  key={type}
                  variant={bgType === type ? 'default' : 'outline'}
                  onClick={() => setBgType(type)}
                  className={`flex-1 capitalize ${
                    bgType === type 
                      ? 'bg-gold text-black hover:bg-gold/80 font-bold' 
                      : 'border-border hover:bg-accent text-foreground'
                  }`}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Color & Gradient Settings */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-muted-foreground">
                  {bgType === 'gradient' ? 'Base Gradient Color' : 'Background Solid Color'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-10 h-10 border border-input rounded bg-transparent cursor-pointer"
                  />
                  <Input
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="bg-background border-input text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {bgType === 'gradient' 
                    ? 'Determines the starting color of the linear background gradient.' 
                    : 'The base color of the page. Acts as the backing layer behind image and video modes too.'}
                </p>
              </div>
            </div>

            {/* Media URLs */}
            <div className="space-y-4">
              {/* Background Image URL */}
              {bgType === 'image' && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Image className="w-4 h-4 text-gold" />
                    Background Image URL
                  </label>
                  <Input
                    value={bgImageUrl}
                    onChange={(e) => setBgImageUrl(e.target.value)}
                    placeholder="Enter image URL (e.g. https://example.com/bg.jpg)"
                    className="bg-background border-input focus:border-gold"
                  />
                  {/* Theme toggle for image mode */}
                  <div className="pt-2">
                    <label className="text-sm font-semibold text-muted-foreground block mb-2">Theme Overlay</label>
                    <div className="flex gap-2">
                      <Button
                        variant={bgTheme === 'dark' ? 'default' : 'outline'}
                        onClick={() => setBgTheme('dark')}
                        className={`flex-1 ${bgTheme === 'dark' ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'border-border text-foreground'}`}
                      >
                        Dark
                      </Button>
                      <Button
                        variant={bgTheme === 'light' ? 'default' : 'outline'}
                        onClick={() => setBgTheme('light')}
                        className={`flex-1 ${bgTheme === 'light' ? 'bg-white text-black hover:bg-gray-100 border border-border' : 'border-border text-foreground'}`}
                      >
                        Light
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {bgTheme === 'dark'
                        ? 'Dark overlay makes the image dim and text readable over it. Best for bright images.'
                        : 'Light overlay brightens the image. Best for dark images with light text.'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Provide a public image web address. The image will be centered, stretched, with overlay applied.
                  </p>
                </div>
              )}

              {/* Background Video URL */}
              {bgType === 'video' && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-gold" />
                    Background Video URL
                  </label>
                  <Input
                    value={bgVideoUrl}
                    onChange={(e) => setBgVideoUrl(e.target.value)}
                    placeholder="Enter video URL (e.g. https://example.com/bg.mp4)"
                    className="bg-background border-input focus:border-gold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide a direct link to an MP4 video. The video will autoplay, loop, and run muted in the background.
                  </p>
                </div>
              )}

              {/* Inactive Mode Message */}
              {(bgType === 'color' || bgType === 'gradient') && (
                <div className="h-full flex items-center justify-center border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                  No background media required. Using CSS {bgType} mode.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSaveAndTrain}
          disabled={saving}
          className="bg-gold hover:bg-gold/80 text-black font-bold px-6 py-5 rounded-xl shadow-lg shadow-gold/10 flex items-center gap-2"
        >
          {saving ? (
            <>
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default AiTab;
