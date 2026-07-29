import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Search, RefreshCw, Database, Save, DollarSign, Globe } from 'lucide-react';

interface Product {
  id: string;
  g2bulk_product_id: string;
  game_name: string;
  product_name: string;
  denomination: string;
  price: number;
  currency: string;
  is_active: number;
  product_type: string;
}

interface LinkedPackage {
  id: string;
  game_id: string;
  game_name: string;
  name: string;
  price: number;
  g2bulk_product_id: string;
  price_markup_percent: number | null;
  table: string;
}

interface MergedProduct extends Product {
  linkedPackage: LinkedPackage | null;
  markupPercent: number | null;
}

const ProductCatalogTab: React.FC = () => {
  const [products, setProducts] = useState<MergedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [globalMarkup, setGlobalMarkup] = useState('');
  const [editedMarkups, setEditedMarkups] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, pkgRes] = await Promise.all([
        api.get('/admin/g2bulk-products'),
        api.get('/admin/packages/linked-to-g2bulk'),
      ]);

      const productsData: Product[] = Array.isArray(prodRes.data) ? prodRes.data : [];
      const packagesData: LinkedPackage[] = Array.isArray(pkgRes.data) ? pkgRes.data : [];

      const pkgMap = new Map<string, LinkedPackage>();
      for (const p of packagesData) {
        pkgMap.set(p.g2bulk_product_id, p);
      }

      const merged: MergedProduct[] = productsData.map(p => {
        const linked = pkgMap.get(p.g2bulk_product_id) || null;
        return {
          ...p,
          linkedPackage: linked,
          markupPercent: linked?.price_markup_percent ?? null,
        };
      });

      setProducts(merged);
    } catch (err) {
      console.error('Error loading catalog:', err);
      toast({ title: 'Failed to load product catalog', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSyncPrices = async () => {
    setSyncing(true);
    try {
      const { data, error } = await api.post('/g2bulk-api', {
        action: 'sync_products',
      });
      if (error) throw new Error(error.message);
      toast({ title: 'Prices synced!', description: `${(data as any)?.synced || 0} products updated.` });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkupChange = (g2bulkProductId: string, value: string) => {
    setEditedMarkups(prev => ({ ...prev, [g2bulkProductId]: value }));
  };

  const getMarkupValue = (p: MergedProduct): string => {
    if (editedMarkups[p.g2bulk_product_id] !== undefined) return editedMarkups[p.g2bulk_product_id];
    return p.markupPercent != null ? String(p.markupPercent) : '';
  };

  const calcSellPrice = (cost: number, markupStr: string): number | null => {
    if (markupStr === '') return null;
    const m = parseFloat(markupStr);
    if (isNaN(m)) return null;
    return Math.round(cost * (1 + m / 100) * 100) / 100;
  };

  const applyGlobalMarkup = () => {
    if (globalMarkup === '') return;
    const val = globalMarkup;
    const updated: Record<string, string> = {};
    for (const p of products) {
      if (p.linkedPackage) {
        updated[p.g2bulk_product_id] = val;
      }
    }
    setEditedMarkups(prev => ({ ...prev, ...updated }));
  };

  const handleSaveMarkups = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(editedMarkups);
      if (!entries.length) { toast({ title: 'No changes to save' }); setSaving(false); return; }

      let saved = 0;
      for (const [g2Id, val] of entries) {
        const p = products.find(x => x.g2bulk_product_id === g2Id);
        if (!p?.linkedPackage) continue;
        const markupVal = val === '' ? null : parseFloat(val);
        await api.put(`/admin/packages/${p.linkedPackage.id}/markup`, { price_markup_percent: markupVal });
        saved++;
      }

      toast({ title: `Saved markup for ${saved} packages` });
      setEditedMarkups({});
      fetchData();
    } catch (err) {
      toast({ title: 'Failed to save markups', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = products.filter(p =>
    !search ||
    p.game_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.g2bulk_product_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card className="border-gold/30">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-gold" />
            Product Catalog
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleSyncPrices} disabled={syncing}>
              <Globe className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Prices'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Global Markup + Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Global Markup:</label>
              <div className="relative w-24">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="%"
                  value={globalMarkup}
                  onChange={e => setGlobalMarkup(e.target.value)}
                  className="text-center pr-7 border-gold/30 h-9"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
              </div>
              <Button variant="outline" size="sm" onClick={applyGlobalMarkup} className="h-9">
                Apply to All Linked
              </Button>
            </div>
            <div className="flex-1" />
            <div className="relative w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 border-gold/30 h-9"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? 'No products match your search.' : 'No products in catalog. Click Sync Prices to fetch from G2Bulk.'}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2 font-medium">Game</th>
                    <th className="text-left py-2 font-medium">Product</th>
                    <th className="text-right py-2 font-medium">G2Bulk Cost</th>
                    <th className="text-center py-2 font-medium w-20">Markup %</th>
                    <th className="text-right py-2 font-medium">Sell Price</th>
                    <th className="text-center py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const raw = getMarkupValue(p);
                    const preview = calcSellPrice(Number(p.price), raw);
                    const isEdited = editedMarkups[p.g2bulk_product_id] !== undefined;
                    const linked = !!p.linkedPackage;
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 font-medium">{p.game_name}</td>
                        <td className="py-2">{p.product_name}</td>
                        <td className="py-2 text-right font-mono text-muted-foreground">
                          ${Number(p.price).toFixed(2)}
                        </td>
                        <td className="py-2 text-center">
                          {linked ? (
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="%"
                              value={raw}
                              onChange={e => handleMarkupChange(p.g2bulk_product_id, e.target.value)}
                              className={`w-20 text-center text-sm mx-auto h-8 ${isEdited ? 'border-gold' : ''}`}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {preview != null ? (
                            <span className={isEdited || preview !== (p.linkedPackage?.price ?? 0) ? 'text-gold font-semibold' : 'text-muted-foreground'}>
                              ${preview.toFixed(2)}
                            </span>
                          ) : linked ? (
                            <span className="text-muted-foreground">
                              ${(p.linkedPackage?.price ?? 0).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {linked ? (
                            <Badge variant="default" className="text-xs bg-green-500/20 text-green-600 border-green-500/30">
                              Linked
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Unlinked
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {Object.keys(editedMarkups).length > 0 && (
        <div className="sticky bottom-0 bg-background border-t border-border p-4 flex justify-end">
          <Button onClick={handleSaveMarkups} disabled={saving} className="bg-gold hover:bg-gold/90 text-primary-foreground">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : `Save Markups (${Object.keys(editedMarkups).length})`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProductCatalogTab;
