import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useSite } from '@/contexts/SiteContext';
import api from '@/lib/api';
import {
  RefreshCw, Save, Clock, DollarSign, Check, Search, ChevronDown, ChevronUp,
} from 'lucide-react';

interface PackageMarkup {
  id: string;
  name: string;
  price: number;
  g2bulk_product_id: string | null;
  price_markup_percent: number | null;
  cost_price: number | null;
  game_id: string;
  game_name: string;
  table: string;
}

interface GameGroup {
  id: string;
  name: string;
  packages: PackageMarkup[];
}

const PriceUpdateTab: React.FC = () => {
  const { games: allGames } = useSite();
  const [gameGroups, setGameGroups] = useState<GameGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedMarkups, setEditedMarkups] = useState<Record<string, string>>({});
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [collapsedGames, setCollapsedGames] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [globalMarkup, setGlobalMarkup] = useState('');
  const [updateResult, setUpdateResult] = useState<{
    g2bulk_prices_synced: number;
    packages_updated: number;
    details: Array<{ name: string; old_price: number; new_price: number; cost: number; markup: number }>;
  } | null>(null);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/g2bulk-products');
      const products = Array.isArray(data) ? data : [];
      const costMap = new Map<string, number>();
      for (const p of products) costMap.set(p.g2bulk_product_id, Number(p.price) || 0);

      const allPkgs: PackageMarkup[] = [];

      for (const game of allGames) {
        if (!game.id) continue;
        const pkgData = (game.packages || []).filter((p: any) => p.g2bulk_product_id);
        const spData = (game.specialPackages || []).filter((p: any) => p.g2bulk_product_id);

        for (const pkg of pkgData) {
          allPkgs.push({
            id: pkg.id,
            name: pkg.name,
            price: Number(pkg.price) || 0,
            g2bulk_product_id: pkg.g2bulk_product_id,
            price_markup_percent: pkg.price_markup_percent != null ? Number(pkg.price_markup_percent) : null,
            cost_price: costMap.get(pkg.g2bulk_product_id) ?? null,
            game_id: game.id,
            game_name: game.name,
            table: 'packages',
          });
        }
        for (const pkg of spData) {
          allPkgs.push({
            id: pkg.id,
            name: pkg.name,
            price: Number(pkg.price) || 0,
            g2bulk_product_id: pkg.g2bulk_product_id,
            price_markup_percent: pkg.price_markup_percent != null ? Number(pkg.price_markup_percent) : null,
            cost_price: costMap.get(pkg.g2bulk_product_id) ?? null,
            game_id: game.id,
            game_name: game.name,
            table: 'special_packages',
          });
        }
      }

      const grouped: GameGroup[] = [];
      const seen = new Set<string>();
      for (const pkg of allPkgs) {
        if (!seen.has(pkg.game_id)) {
          seen.add(pkg.game_id);
          grouped.push({ id: pkg.game_id, name: pkg.game_name, packages: [] });
        }
        const g = grouped.find(gr => gr.id === pkg.game_id);
        if (g) g.packages.push(pkg);
      }

      setGameGroups(grouped);
      setSelectedGames(new Set(grouped.map(g => g.id)));
    } catch (err) {
      console.error('Error loading packages:', err);
      toast({ title: 'Failed to load packages', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [allGames]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const toggleGame = (gameId: string) => {
    setSelectedGames(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId); else next.add(gameId);
      return next;
    });
  };

  const selectAllGames = () => setSelectedGames(new Set(gameGroups.map(g => g.id)));
  const clearAllGames = () => setSelectedGames(new Set());

  const toggleCollapse = (gameId: string) => {
    setCollapsedGames(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId); else next.add(gameId);
      return next;
    });
  };

  const handleMarkupChange = (pkgId: string, value: string) => {
    setEditedMarkups(prev => ({ ...prev, [pkgId]: value }));
  };

  const handleSaveMarkups = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(editedMarkups);
      if (!entries.length) { toast({ title: 'No changes to save' }); setSaving(false); return; }

      for (const [pkgId, val] of entries) {
        const markupVal = val === '' ? null : parseFloat(val);
        for (const group of gameGroups) {
          for (const pkg of group.packages) {
            if (pkg.id === pkgId) {
              await api.put(`/admin/packages/${pkgId}/markup`, { price_markup_percent: markupVal });
            }
          }
        }
      }

      toast({ title: `Saved markup for ${entries.length} packages` });
      setEditedMarkups({});
      fetchPackages();
    } catch (err) {
      toast({ title: 'Failed to save markups', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateNow = async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      toast({ title: 'Updating prices...', description: 'Fetching G2Bulk prices and applying markups.' });
      const globalVal = globalMarkup === '' ? null : parseFloat(globalMarkup);
      const { data } = await api.post('/update-prices', {
        selectedGameIds: Array.from(selectedGames),
        globalMarkup: globalVal,
      });
      if ((data as any)?.success) {
        setUpdateResult(data as any);
        toast({
          title: 'Prices updated!',
          description: `${(data as any).packages_updated} packages updated`,
        });
        fetchPackages();
      } else {
        toast({ title: 'Update failed', description: (data as any)?.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed';
      toast({ title: 'Price update failed', description: msg, variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  const getMarkupValue = (pkg: PackageMarkup): string => {
    if (editedMarkups[pkg.id] !== undefined) return editedMarkups[pkg.id];
    return pkg.price_markup_percent != null ? String(pkg.price_markup_percent) : '';
  };

  const filteredGroups = gameGroups.filter(g =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <Card className="border-gold/30">
        <CardContent className="p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gold" />
          <p className="mt-4 text-muted-foreground">Loading packages...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-gold/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-gold" />
            Auto Price Update
          </CardTitle>
          <CardDescription>
            Select games to update, set markup %, then click Update Prices. Prices are calculated as G2Bulk cost + markup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              onClick={handleUpdateNow}
              disabled={updating || selectedGames.size === 0}
              className="bg-gold hover:bg-gold/90 text-primary-foreground"
            >
              {updating ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Updating...</> : <><RefreshCw className="w-4 h-4 mr-2" />Update Prices</>}
            </Button>
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {selectedGames.size} / {gameGroups.length} games selected
            </div>
            <Button variant="outline" size="sm" onClick={selectAllGames}>Select All</Button>
            <Button variant="outline" size="sm" onClick={clearAllGames}>Clear</Button>
          </div>

          {updateResult && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-green-600 font-semibold">
                <Check className="w-5 h-5" />
                Updated {updateResult.packages_updated} packages
              </div>
              {updateResult.details.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1 text-sm">
                  {updateResult.details.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="font-medium">{d.name}</span>:
                      <span className="text-muted-foreground">${d.old_price.toFixed(2)}</span>
                      <span>→</span>
                      <span className="text-green-600 font-medium">${d.new_price.toFixed(2)}</span>
                      <span className="text-muted-foreground text-xs">(cost: ${d.cost.toFixed(2)}, +{d.markup}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global Markup + Search */}
      <Card className="border-gold/30">
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Global Markup:</label>
            <div className="relative w-24">
              <Input
                type="number"
                step="0.1"
                placeholder="%"
                value={globalMarkup}
                onChange={e => setGlobalMarkup(e.target.value)}
                className="text-center pr-7 border-gold/30"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {globalMarkup ? `Will apply +${globalMarkup}% to all selected games on Update` : ''}
            </span>
          </div>
          <div className="flex-1" />
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search games..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 border-gold/30"
            />
          </div>
        </CardContent>
      </Card>

      {/* Markup per game */}
      <div className="space-y-3">
        {filteredGroups.map(group => (
          <Card key={group.id} className="border-gold/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Checkbox
                  checked={selectedGames.has(group.id)}
                  onCheckedChange={() => toggleGame(group.id)}
                />
                <button
                  onClick={() => toggleCollapse(group.id)}
                  className="flex-1 flex items-center justify-between text-left"
                >
                  <span className="font-bold text-sm">{group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {group.packages.length} packages
                    {collapsedGames.has(group.id) ? <ChevronDown className="w-4 h-4 ml-1 inline" /> : <ChevronUp className="w-4 h-4 ml-1 inline" />}
                  </span>
                </button>
              </div>

              {!collapsedGames.has(group.id) && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left py-2 font-medium">Package</th>
                        <th className="text-right py-2 font-medium">Cost</th>
                        <th className="text-right py-2 font-medium">Price</th>
                        <th className="text-center py-2 font-medium w-24">Markup %</th>
                        <th className="text-right py-2 font-medium">Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.packages.map(pkg => {
                        const raw = getMarkupValue(pkg);
                        const preview = raw && pkg.cost_price != null
                          ? Math.round(pkg.cost_price * (1 + parseFloat(raw) / 100) * 100) / 100
                          : null;
                        const isEdited = editedMarkups[pkg.id] !== undefined;
                        return (
                          <tr key={`${pkg.table}_${pkg.id}`} className="border-b border-border/50">
                            <td className="py-2 text-sm">{pkg.name}</td>
                            <td className="py-2 text-right text-muted-foreground">
                              {pkg.cost_price != null ? `$${pkg.cost_price.toFixed(2)}` : '\u2014'}
                            </td>
                            <td className="py-2 text-right font-medium">${pkg.price.toFixed(2)}</td>
                            <td className="py-2 text-center">
                              <Input
                                type="number"
                                step="0.1"
                                placeholder="%"
                                value={raw}
                                onChange={e => handleMarkupChange(pkg.id, e.target.value)}
                                className={`w-20 text-center text-sm mx-auto ${isEdited ? 'border-gold' : ''}`}
                              />
                            </td>
                            <td className="py-2 text-right">
                              {preview != null ? (
                                <span className={preview !== pkg.price ? 'text-gold font-semibold' : 'text-muted-foreground'}>
                                  ${preview.toFixed(2)}
                                </span>
                              ) : '\u2014'}
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
        ))}
      </div>

      {filteredGroups.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          {search ? 'No games match your search.' : 'No packages linked to G2Bulk. Link packages first in the Games tab.'}
        </p>
      )}

      {Object.keys(editedMarkups).length > 0 && (
        <div className="sticky bottom-0 bg-background border-t border-border p-4 flex justify-end">
          <Button onClick={handleSaveMarkups} disabled={saving} className="bg-gold hover:bg-gold/90 text-primary-foreground">
            {saving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Markups ({Object.keys(editedMarkups).length})</>}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PriceUpdateTab;
