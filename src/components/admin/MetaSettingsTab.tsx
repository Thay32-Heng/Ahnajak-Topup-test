import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Share2, Image as ImageIcon, Link2, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useSite } from '@/contexts/SiteContext';
import ImageUpload from '@/components/ImageUpload';
import api from '@/lib/api';

const MetaSettingsTab: React.FC = () => {
  const { settings } = useSite();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(settings.meta_title || '');
    setDescription(settings.meta_description || '');
    setImage(settings.meta_image || '');
  }, [settings.meta_title, settings.meta_description, settings.meta_image]);

  const toAbsolute = (url: string) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await api.put('/settings', {
        meta_title: title.trim(),
        meta_description: description.trim(),
        meta_image: image.trim(),
      });
      if (error) throw new Error(error.message || String(error));
      toast({ title: 'Meta settings saved!' });
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const siteName = settings.siteName || 'Ahnajak Topup';
  const previewTitle = title.trim() || `${siteName} - Game Topup Cambodia`;
  const previewDesc = description.trim()
    || settings.siteDescription
    || 'Top up your favorite games instantly. Mobile Legends, Free Fire, PUBG, and more. Fast, secure, and affordable game topup in Cambodia.';

  return (
    <div className="space-y-6">
      <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Share2 className="w-5 h-5 text-blue-500" />
            <span>Meta & Sharing</span>
            <span className="text-xs font-normal text-muted-foreground ml-1">
              Controls how your links look when shared on Telegram, Facebook, WhatsApp...
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
              Share Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${siteName} - Game Topup Cambodia`}
              maxLength={120}
              className="border-blue-500/30"
            />
            <p className="text-[11px] text-muted-foreground mt-1">{title.length}/120 characters — shows as the share link headline</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Share Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your site: instant game topup, vouchers, gift cards..."
              rows={4}
              maxLength={300}
              className="border-blue-500/30 resize-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">{description.length}/300 characters — shows under the title when shared</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
              Share Image (1200×630 recommended)
            </label>
            <ImageUpload
              value={image}
              onChange={setImage}
              folder="meta"
              aspectRatio="wide"
              placeholder="Share image"
              allowUrl
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              The thumbnail shown next to your share link. If empty, the site logo is used.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSave} disabled={saving} className="bg-gold hover:bg-gold-dark text-primary-foreground">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Meta Settings
            </Button>
            <Button
              variant="outline"
              onClick={() => { setTitle(''); setDescription(''); setImage(''); }}
              title="Reset to defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card className="border-blue-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Share2 className="w-4 h-4 text-blue-500" />
            <span>Share Preview</span>
          </CardTitle>
          <CardDescription>How your link appears when shared</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md mx-auto rounded-2xl overflow-hidden border border-border bg-card shadow-lg">
            {image && (
              <div className="aspect-video bg-muted overflow-hidden">
                <img src={toAbsolute(image)} alt="Share preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}
            <div className="p-4 space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {window.location.hostname} · {siteName}
              </p>
              <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{previewTitle}</h3>
              <p className="text-xs text-muted-foreground line-clamp-3">{previewDesc}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 text-center">
            Tip: share caches are refreshed after a few minutes, or use <code className="bg-muted px-1 rounded">opengraph.xyz</code> to check what crawlers see.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MetaSettingsTab;
