import React, { useState, useEffect } from 'react';
import { Save, Server, Key, Loader2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { db } from '@/integrations/db/client';
import { toast } from '@/hooks/use-toast';

interface KHQRccConfig {
  profile_id: string;
  secret_key: string;
  checkout_url: string;
  success_url: string;
}

interface GatewayData {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  config: KHQRccConfig;
}

const defaultConfig: KHQRccConfig = {
  profile_id: '',
  secret_key: '',
  checkout_url: 'https://khqr.cc/api/payment/requestv2',
  success_url: ''
};

const KHQRccSettingsTab: React.FC = () => {
  const [gateway, setGateway] = useState<GatewayData | null>(null);
  const [config, setConfig] = useState<KHQRccConfig>(defaultConfig);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await db
        .from('payment_gateways')
        .select('*')
        .eq('slug', 'khqrcc')
        .maybeSingle();
      
      if (error) throw error;

      if (data) {
        const raw = typeof data.config === 'string' ? JSON.parse(data.config) : data.config || {};
        const configData = { ...defaultConfig, ...raw };
        setGateway({
          id: data.id,
          slug: data.slug,
          name: data.name,
          enabled: data.enabled || false,
          config: configData
        });
        setConfig(configData);
        setEnabled(data.enabled || false);
      }
    } catch (error) {
      console.error('Error fetching KHQRcc settings:', error);
      toast({ title: 'Error loading settings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!gateway) return;
    
    setSaving(true);
    try {
      const configJson = JSON.parse(JSON.stringify(config));
      const { error } = await db
        .from('payment_gateways')
        .update({
          enabled,
          config: configJson,
          updated_at: new Date().toISOString()
        })
        .eq('id', gateway.id);

      if (error) throw error;
      
      toast({ title: '✓ រក្សាទុកបានជោគជ័យ!' });
    } catch (error) {
      console.error('Error saving KHQRcc settings:', error);
      toast({ title: 'រក្សាទុកបរាជ័យ', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-gold/30">
        <CardContent className="py-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!gateway) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="py-8 text-center">
          <p className="text-red-500">KHQRcc gateway not found in database. Please run the SQL migration.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gold/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-gold" />
          KHQRcc (ABA Pay) Settings
        </CardTitle>
        <CardDescription>
          Configure your KHQRcc Managed Checkout (Redirect Flow)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-gold/20">
          <div>
            <Label className="text-base font-semibold">Enable ABA Pay (KHQRcc)</Label>
            <p className="text-sm text-muted-foreground">Turn on/off KHQRcc redirect payments</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Profile ID */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Server className="w-4 h-4" />
            Profile ID
          </Label>
          <Input
            value={config.profile_id}
            onChange={(e) => setConfig({ ...config, profile_id: e.target.value })}
            placeholder="e.g., IZn3r0Mgn6PsfX6UtEYbgjQ9SJkCe0nd"
            className="border-gold/50"
          />
        </div>

        {/* Secret Key */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            Secret Key
          </Label>
          <Input
            type="password"
            value={config.secret_key}
            onChange={(e) => setConfig({ ...config, secret_key: e.target.value })}
            placeholder="your-khqrcc-secret-key"
            className="border-gold/50"
          />
        </div>

        {/* Checkout URL */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Gateway Checkout URL
          </Label>
          <Input
            value={config.checkout_url}
            onChange={(e) => setConfig({ ...config, checkout_url: e.target.value })}
            placeholder="https://khqr.cc/api/payment/requestv2"
            className="border-gold/50"
          />
        </div>

        {/* Success URL */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Success URL (after payment)
          </Label>
          <Input
            value={config.success_url}
            onChange={(e) => setConfig({ ...config, success_url: e.target.value })}
            placeholder={`${window.location.origin}/api/khqrcc-webhook?transaction_id=ORDER_ID`}
            className="border-gold/50"
          />
          <p className="text-xs text-muted-foreground">
            Where the customer is redirected after paying. Leave empty to use this website&apos;s webhook URL automatically.
          </p>
        </div>

        {/* Save Button */}
        <Button 
          onClick={handleSave} 
          disabled={saving}
          className="w-full bg-gold hover:bg-gold/90 text-primary-foreground"
          size="lg"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save KHQRcc Settings
            </>
          )}
        </Button>

        {/* Webhook Info */}
        <div className="bg-gold/10 border border-gold/30 rounded-lg p-4">
          <h4 className="font-semibold text-gold dark:text-gold mb-2">🔗 Your Webhook URL</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Configure this URL in your KHQRcc dashboard as the Global Webhook URL:
          </p>
          <code className="text-xs bg-secondary p-2 rounded block break-all">
            {`${window.location.origin}/api/khqrcc-webhook`}
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Note: We will handle verification using your Secret Key.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default KHQRccSettingsTab;

