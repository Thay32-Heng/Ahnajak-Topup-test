import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Gift, RefreshCw, Eye, EyeOff, Search, DollarSign, Percent, Save, Loader2, Radio, TrendingUp } from 'lucide-react';

interface VGProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  g2bulk_product_id: string;
  product_type: string;
  is_active: number;
}

const VGProductCatalogTab: React.FC = () => {
  const [products, setProducts] = useState<VGProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [markup, setMarkup] = useState(0);
  const [markupSaving, setMarkupSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await api.get('/products/vg');
      if (error) throw new Error(error.message || String(error));
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: 'Failed to load products', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLivePrices = useCallback(async () => {
    try {
      const { data, error } = await api.get('/products/vg/live-prices');
      if (error) throw new Error(error.message || String(error));
      const d = data as any;
      setLivePrices(d?.prices || {});
      setLiveError(d?.error || null);
      if (d?.updated_at) setLastUpdated(new Date(d.updated_at));
    } catch (err: any) {
      setLiveError(err?.message || 'Live price error');
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Fetch markup % once on mount
  useEffect(() => {
    api.get('/products/vg/games').then(({ data }) => {
      if (typeof (data as any)?.markup === 'number') setMarkup((data as any).markup);
    }).catch(() => {});
  }, []);

  // Live prices — poll every 1s while this tab is visible
  useEffect(() => {
    fetchLivePrices();
    pollRef.current = setInterval(() => {
      if (!document.hidden) fetchLivePrices();
    }, 1000);
    const onVis = () => { if (!document.hidden) fetchLivePrices(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchLivePrices]);

  const toggleActive = async (product: VGProduct) => {
    try {
      const { error } = await api.put(`/admin/g2bulk-products/${product.id}/toggle-active`);
      if (error) throw new Error(error.message || String(error));
      toast({ title: `${product.name} ${product.is_active ? 'hidden' : 'shown'} on /get-vg page` });
      fetchProducts();
    } catch {
      toast({ title: 'Failed to update product', variant: 'destructive' });
    }
  };

  const updatePrice = async (productId: string) => {
    const val = editingPrice[productId];
    if (val === undefined) return;
    const price = parseFloat(val);
    if (isNaN(price) || price < 0) {
      toast({ title: 'Invalid price', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await api.put(`/admin/g2bulk-products/${productId}/price`, { price });
      if (error) throw new Error(error.message || String(error));
      toast({ title: 'Price updated' });
      setEditingPrice(prev => { const n = { ...prev }; delete n[productId]; return n; });
      fetchProducts();
    } catch {
      toast({ title: 'Failed to update price', variant: 'destructive' });
    }
  };

  const handleSaveMarkup = async () => {
    if (!Number.isFinite(markup) || markup < 0 || markup > 500) {
      toast({ title: 'Markup must be between 0 and 500', variant: 'destructive' });
      return;
    }
    setMarkupSaving(true);
    try {
      const { data, error } = await api.post('/products/vg/markup', { markup });
      if (error) throw new Error(error.message || String(error));
      toast({
        title: 'Markup Saved!',
        description: `${markup}% markup applied to ${(data as any)?.updated || 0} product(s)`,
      });
      fetchProducts();
    } catch (err: any) {
      toast({ title: 'Failed to save markup', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setMarkupSaving(false);
    }
  };

  const filtered = products.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.g2bulk_product_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card className="border-purple-500/30">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-500" />
            Voucher & Gift Card Products
          </CardTitle>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Radio className={`w-3.5 h-3.5 ${liveError ? 'text-red-500' : 'text-green-500 animate-pulse'}`} />
                Live · {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={fetchProducts} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 border-purple-500/30 h-9"
              />
            </div>
            {liveError && (
              <span className="text-xs text-red-500">Live prices unavailable: {liveError}</span>
            )}
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? 'No products match your search.' : 'No products. Import from G2Bulk in Games tab.'}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2 font-medium">Product</th>
                    <th className="text-right py-2 font-medium">Selling Price</th>
                    <th className="text-right py-2 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> G2Bulk Live
                      </span>
                    </th>
                    <th className="text-center py-2 font-medium">Status</th>
                    <th className="text-center py-2 font-medium w-24">Show/Hide</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const editVal = editingPrice[p.id] !== undefined ? editingPrice[p.id] : String(p.price);
                    const live = livePrices[p.g2bulk_product_id];
                    const diff = live !== undefined ? Math.round((p.price - live) * 100) / 100 : null;
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 font-medium">{p.name}</td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-muted-foreground">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={editVal}
                              onChange={e => setEditingPrice(prev => ({ ...prev, [p.id]: e.target.value }))}
                              className="w-24 text-right text-sm h-8"
                              onBlur={() => {
                                if (editingPrice[p.id] !== undefined) updatePrice(p.id);
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') updatePrice(p.id); }}
                            />
                          </div>
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {live !== undefined ? (
                            <>
                              <span className="font-mono font-semibold">${live.toFixed(2)}</span>
                              {diff !== null && diff !== 0 && (
                                <span className={`ml-2 text-xs font-semibold ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          <Badge className="text-xs" variant={p.is_active ? 'default' : 'secondary'}>
                            {p.is_active ? 'Active' : 'Hidden'}
                          </Badge>
                        </td>
                        <td className="py-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(p)}
                            className={p.is_active ? 'text-green-500' : 'text-muted-foreground'}
                          >
                            {p.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </Button>
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

      <Card className="border-purple-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="w-5 h-5 text-purple-500" />
            <span>Price Markup</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Selling price = G2Bulk live price + markup%. Applied to existing products and future imports.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="w-40">
              <label className="text-sm font-medium mb-2 block">Markup %</label>
              <Input
                type="number"
                min={0}
                max={500}
                value={markup}
                onChange={(e) => setMarkup(Number(e.target.value))}
                placeholder="e.g. 10"
                className="border-gold/50"
              />
            </div>
            <Button
              onClick={handleSaveMarkup}
              disabled={markupSaving}
              className="bg-gold hover:bg-gold-dark text-primary-foreground"
            >
              {markupSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save & Reprice
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VGProductCatalogTab;
