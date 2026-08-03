import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, RefreshCw, Check, AlertTriangle, Gift, Search, Loader2, FolderOpen, PlusCircle, Save, ExternalLink, Edit3, X, Trash2, Image as ImageIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import ImageUpload from '@/components/ImageUpload';
import { resolveIconUrl } from '@/lib/icon-url';

interface G2Category {
  id: number;
  title: string;
  description: string | null;
  product_count: number;
  imported_count: number;
}

interface VgGame {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  cover_image: string | null;
  description: string | null;
  g2bulk_category_id: string | null;
  tags?: string[];
}

interface VgGameDraft {
  id: string;
  name: string;
  slug: string;
  image: string;
  cover_image: string;
}

interface VgProductRow {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image?: string | null;
}

const G2BulkVGImport: React.FC = () => {
  const [categories, setCategories] = useState<G2Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [addCategory, setAddCategory] = useState<'voucher' | 'gift_card'>('voucher');
  const [importingId, setImportingId] = useState<number | null>(null);
  const [importingType, setImportingType] = useState<'voucher' | 'gift_card' | null>(null);
  const [result, setResult] = useState<{ type: string; count: number } | null>(null);

  const [vgGames, setVgGames] = useState<VgGame[]>([]);
  const [vgGamesLoading, setVgGamesLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, VgGameDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Record<string, VgProductRow[]>>({});
  const [productsLoadingId, setProductsLoadingId] = useState<string | null>(null);
  const [productImgDrafts, setProductImgDrafts] = useState<Record<string, string>>({});
  const [productSavingId, setProductSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load the product list of the category being edited (for icon editing)
  useEffect(() => {
    if (!editingId) return;
    const g = vgGames.find(x => x.id === editingId);
    if (!g) return;
    let cancelled = false;
    setProductsLoadingId(editingId);
    api.get(`/products/vg/${g.slug}`)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw new Error(error.message || String(error));
        const d = data as any;
        setCategoryProducts(prev => ({ ...prev, [g.id]: Array.isArray(d?.products) ? d.products as VgProductRow[] : [] }));
      })
      .catch((err: any) => {
        if (!cancelled) toast({ title: 'Failed to load products', description: err.message || 'Unknown error', variant: 'destructive' });
      })
      .finally(() => { if (!cancelled) setProductsLoadingId(null); });
    return () => { cancelled = true; };
  }, [editingId, vgGames]);

  const handleSaveProductImage = async (productId: string, image: string) => {
    setProductSavingId(productId);
    try {
      const { error } = await api.put(`/admin/g2bulk-products/${productId}/image`, { image: image.trim() || null });
      if (error) throw new Error(error.message || String(error));
      toast({ title: 'Product icon updated!' });
      setProductImgDrafts(prev => { const next = { ...prev }; delete next[productId]; return next; });
      // Refresh the loaded list so the thumbnail updates
      const g = vgGames.find(x => x.id === editingId);
      if (g) {
        const { data } = await api.get(`/products/vg/${g.slug}`);
        const d = data as any;
        if (Array.isArray(d?.products)) {
          setCategoryProducts(prev => ({ ...prev, [g.id]: d.products as VgProductRow[] }));
        }
      }
    } catch (err: any) {
      toast({ title: 'Failed to update icon', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setProductSavingId(null);
    }
  };

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const { data, error } = await api.get(`/products/vg/categories?q=${encodeURIComponent(searchQuery)}`);
      if (error) throw new Error(error.message || String(error));
      setCategories((data as any)?.categories || []);
    } catch (err: any) {
      toast({ title: 'Failed to load categories', description: err.message || 'Unknown error', variant: 'destructive' });
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, [searchQuery]);

  const loadVgGames = useCallback(async () => {
    setVgGamesLoading(true);
    try {
      const { data, error } = await api.get('/products/vg/games');
      if (error) throw new Error(error.message || String(error));
      const d = data as any;
      setVgGames((d?.games || []) as VgGame[]);
    } catch (err: any) {
      toast({ title: 'Failed to load imported categories', description: err.message || 'Unknown error', variant: 'destructive' });
      setVgGames([]);
    } finally {
      setVgGamesLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadCategories, 250);
    return () => clearTimeout(t);
  }, [searchQuery, loadCategories]);

  useEffect(() => {
    loadVgGames();
  }, [loadVgGames]);

  const handleImportCategory = async (cat: G2Category) => {
    setImportingId(cat.id);
    setResult(null);
    try {
      const { data, error } = await api.post('/products/vg/import', {
        product_type: addCategory,
        categoryId: cat.id,
      });
      if (error) throw new Error(error.message || String(error));
      const count = (data as any)?.imported || 0;
      setResult({ type: addCategory, count });
      toast({
        title: 'Category Imported!',
        description: (data as any)?.message || `Imported ${count} products from "${cat.title}" as ${addCategory === 'voucher' ? 'Vouchers' : 'Gift Cards'}`,
      });
      loadCategories();
      loadVgGames();
    } catch (err: any) {
      toast({ title: 'Import Failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setImportingId(null);
    }
  };

  const handleImportAll = async (productType: 'voucher' | 'gift_card') => {
    setImportingType(productType);
    setResult(null);
    try {
      const { data, error } = await api.post('/products/vg/import', { product_type: productType });
      if (error) throw new Error(error.message || String(error));
      const count = (data as any)?.imported || 0;
      setResult({ type: productType, count });
      toast({
        title: 'Import Complete!',
        description: (data as any)?.message || `Imported ${count} ${productType === 'voucher' ? 'voucher' : 'gift card'} products from G2Bulk`,
      });
      loadCategories();
      loadVgGames();
    } catch (err: any) {
      toast({
        title: 'Import Failed',
        description: err.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setImportingType(null);
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
      loadVgGames();
    } catch (err: any) {
      toast({ title: 'Failed to save markup', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setMarkupSaving(false);
    }
  };

  const draftOf = (g: VgGame): VgGameDraft => {
    return edits[g.id] || { id: g.id, name: g.name, slug: g.slug, image: g.image || '', cover_image: g.cover_image || '' };
  };

  const startEdit = (g: VgGame) => {
    setEdits((prev) => ({ ...prev, [g.id]: { id: g.id, name: g.name, slug: g.slug, image: g.image || '', cover_image: g.cover_image || '' } }));
    setEditingId(g.id);
  };

  const cancelEdit = (g: VgGame) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[g.id];
      return next;
    });
    setEditingId(null);
  };

  const handleSaveGame = async (g: VgGame) => {
    const draft = draftOf(g);
    if (!draft.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSavingId(g.id);
    try {
      const { data, error } = await api.put(`/games/${g.id}`, {
        name: draft.name.trim(),
        slug: draft.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || undefined,
        image: draft.image || null,
        cover_image: draft.cover_image || null,
      });
      if (error) throw new Error(error.message || String(error));
      toast({ title: 'Category updated!' });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[g.id];
        return next;
      });
      setEditingId(null);
      loadVgGames();
    } catch (err: any) {
      toast({ title: 'Failed to update category', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteCategory = async (g: VgGame) => {
    const ok = window.confirm(
      `Delete category "${g.name}"?\n\nThis removes the category from your shop AND deletes every imported product inside it (products can be re-imported from G2Bulk anytime).`
    );
    if (!ok) return;
    setDeletingId(g.id);
    try {
      const { data, error } = await api.del(`/products/vg/categories/${g.id}`);
      if (error) throw new Error(error.message || String(error));
      const d = data as any;
      toast({
        title: 'Category deleted!',
        description: d?.products_deleted
          ? `${d.products_deleted} product${d.products_deleted !== 1 ? 's' : ''} removed with it.`
          : undefined,
      });
      setEditingId((prev) => (prev === g.id ? null : prev));
      loadVgGames();
    } catch (err: any) {
      toast({ title: 'Failed to delete category', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="w-5 h-5 text-purple-500" />
            <span>Voucher & Gift Card Import</span>
            <Badge variant="outline" className="ml-2 bg-purple-500/10 text-purple-500 border-purple-500/30">
              G2Bulk
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Pick a category and click Import — every product inside it is added, and the category becomes a
            <strong> game</strong> you can edit (icon, name, slug) in the Games tab.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Add as:</span>
            <Select value={addCategory} onValueChange={(v) => setAddCategory(v as 'voucher' | 'gift_card')}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="voucher">Voucher</SelectItem>
                <SelectItem value="gift_card">Gift Card</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <FolderOpen className="w-3 h-3" /> Categories
            </p>
            {categoriesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading categories...
              </div>
            ) : categories.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {searchQuery ? `No categories match "${searchQuery}"` : 'No categories from G2Bulk'}
              </p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {categories.map((c) => {
                  const done = c.imported_count >= c.product_count;
                  const remaining = Math.max(0, c.product_count - c.imported_count);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.product_count} product{c.product_count !== 1 ? 's' : ''}
                          {c.imported_count > 0 && (
                            <span className="text-green-600"> · {c.imported_count} added</span>
                          )}
                          {c.description && (
                            <span className="text-muted-foreground/60 truncate block max-w-[320px]">{c.description}</span>
                          )}
                        </p>
                      </div>
                      {done ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/30 whitespace-nowrap">
                          <Check className="w-3 h-3 mr-1" />Imported
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleImportCategory(c)}
                          disabled={importingId === c.id}
                          className="bg-purple-500/20 text-purple-600 hover:bg-purple-500/30 whitespace-nowrap"
                        >
                          {importingId === c.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          ) : (
                            <PlusCircle className="w-3.5 h-3.5 mr-1" />
                          )}
                          Import{remaining > 0 ? ` (${remaining})` : ''}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">or bulk import</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => handleImportAll('voucher')}
              disabled={importingType !== null}
              variant="outline"
              className="flex-1 min-w-[160px] border-purple-500/50 hover:bg-purple-500/10"
            >
              {importingType === 'voucher' ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Importing...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Import All Vouchers</>
              )}
            </Button>
            <Button
              onClick={() => handleImportAll('gift_card')}
              disabled={importingType !== null}
              variant="outline"
              className="flex-1 min-w-[160px] border-pink-500/50 hover:bg-pink-500/10"
            >
              {importingType === 'gift_card' ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Importing...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Import All Gift Cards</>
              )}
            </Button>
          </div>

          {result && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span className="font-medium text-green-600">
                  Imported {result.count} {result.type === 'voucher' ? 'voucher' : 'gift card'} product{result.count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Existing items with the same ID will be updated.
              Go to <strong>Prices → Voucher & Gift Card</strong> tab to manage visibility.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-purple-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="w-5 h-5 text-purple-500" />
            <span>Your Categories</span>
            <Badge variant="outline" className="ml-2 bg-purple-500/10 text-purple-500 border-purple-500/30">
              {vgGames.length} imported
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Edit the icon, name and URL slug of each imported category, and the icon of each product inside it.
            Shown on the homepage — click opens its shop page.
          </p>
        </CardHeader>
        <CardContent>
          {vgGamesLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading categories...
            </div>
          ) : vgGames.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No imported categories yet. Import a category above to create one.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {vgGames.map((g) => {
                const draft = draftOf(g);
                const editing = editingId === g.id;
                const dirty = !!edits[g.id];
                const img = draft.image || g.image;
                return (
                  <div
                    key={g.id}
                    className="relative rounded-xl overflow-hidden border border-border bg-card shadow-sm transition-all hover:shadow-md"
                  >
                    {editing ? (
                      <div className="p-3 space-y-3">
                        <div>
                          <label className="text-[11px] text-muted-foreground mb-1 block">Cover Image (wide banner)</label>
                          <ImageUpload
                            value={draft.cover_image}
                            onChange={(url) => setEdits((prev) => ({ ...prev, [g.id]: { ...draft, cover_image: url } }))}
                            folder="games"
                            aspectRatio="wide"
                            placeholder="Cover"
                          />
                        </div>
                        <ImageUpload
                          value={draft.image}
                          onChange={(url) => setEdits((prev) => ({ ...prev, [g.id]: { ...draft, image: url } }))}
                          folder="games"
                          aspectRatio="square"
                          placeholder="Icon"
                        />
                        <div>
                          <label className="text-[11px] text-muted-foreground mb-1 block">Name</label>
                          <Input
                            value={draft.name}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [g.id]: { ...draft, name: e.target.value } }))}
                            className="h-8 text-sm border-gold/30"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground mb-1 block">URL Slug</label>
                          <Input
                            value={draft.slug}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [g.id]: { ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') } }))}
                            className="h-8 text-sm border-gold/30"
                          />
                        </div>

                        {/* Products in this category — edit each product icon */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] text-muted-foreground font-medium">
                              Products in this category
                            </label>
                            {productsLoadingId === g.id && (
                              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                            )}
                          </div>
                          {productsLoadingId === g.id ? null : (categoryProducts[g.id] || []).length === 0 ? (
                            <p className="text-[11px] text-muted-foreground text-center py-2 rounded-lg bg-muted/40">
                              No products in this category yet
                            </p>
                          ) : (
                            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                              {(categoryProducts[g.id] || []).map((p) => {
                                const draftImg = productImgDrafts[p.id];
                                const editingImg = productImgDrafts[p.id] !== undefined;
                                const pImg = editingImg ? draftImg : (p.image || '');
                                return (
                                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border">
                                    <img
                                      src={resolveIconUrl(pImg) || '/placeholder.svg'}
                                      alt={p.name}
                                      className="w-8 h-8 rounded object-contain bg-card shrink-0 border border-border"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{p.name}</p>
                                      <p className="text-[10px] text-muted-foreground">${Number(p.price).toFixed(2)}</p>
                                    </div>
                                    {editingImg ? (
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-14">
                                          <ImageUpload
                                            value={pImg}
                                            onChange={(url) => setProductImgDrafts(prev => ({ ...prev, [p.id]: url }))}
                                            folder="games"
                                            aspectRatio="square"
                                            placeholder="Icon"
                                          />
                                        </div>
                                        <Button
                                          size="sm"
                                          className="h-7 px-2 text-xs bg-gold hover:bg-gold-dark text-primary-foreground"
                                          onClick={() => handleSaveProductImage(p.id, pImg)}
                                          disabled={productSavingId === p.id}
                                        >
                                          {productSavingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2"
                                          onClick={() => setProductImgDrafts(prev => { const next = { ...prev }; delete next[p.id]; return next; })}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs shrink-0"
                                        onClick={() => setProductImgDrafts(prev => ({ ...prev, [p.id]: p.image || '' }))}
                                      >
                                        <Edit3 className="w-3 h-3 mr-1" /> Icon
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-gold hover:bg-gold-dark text-primary-foreground"
                            onClick={() => handleSaveGame(g)}
                            disabled={savingId === g.id || !dirty}
                          >
                            {savingId === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => cancelEdit(g)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="relative aspect-[3/4] bg-muted/40">
                          {img ? (
                            <img src={resolveIconUrl(img)} alt={g.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                              <ImageIcon className="w-8 h-8" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          <p className="absolute bottom-1.5 left-2 right-2 text-white text-xs font-semibold truncate drop-shadow">
                            {g.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 p-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 h-7 text-xs"
                            onClick={() => window.open(`/get-vg/${g.slug}`, '_blank')}
                            title="Open shop page"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 h-7 text-xs text-gold hover:text-gold-dark"
                            onClick={() => startEdit(g)}
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 px-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            title="Delete category (and its products)"
                            disabled={deletingId === g.id}
                            onClick={() => handleDeleteCategory(g)}
                          >
                            {deletingId === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default G2BulkVGImport;
