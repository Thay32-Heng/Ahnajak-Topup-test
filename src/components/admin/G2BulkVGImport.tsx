import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, RefreshCw, Check, AlertTriangle, Gift, Search, Loader2, FolderOpen, PlusCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface G2Category {
  id: number;
  title: string;
  description: string | null;
  product_count: number;
  imported_count: number;
}

const G2BulkVGImport: React.FC = () => {
  const [categories, setCategories] = useState<G2Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [addCategory, setAddCategory] = useState<'voucher' | 'gift_card'>('voucher');
  const [importingId, setImportingId] = useState<number | null>(null);
  const [importingType, setImportingType] = useState<'voucher' | 'gift_card' | null>(null);
  const [result, setResult] = useState<{ type: string; count: number } | null>(null);

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

  // Load categories on mount + whenever the search box changes
  useEffect(() => {
    const t = setTimeout(loadCategories, 250);
    return () => clearTimeout(t);
  }, [searchQuery, loadCategories]);

  // Import every product inside a category
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
    } catch (err: any) {
      toast({ title: 'Import Failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setImportingId(null);
    }
  };

  // Bulk import of everything from G2Bulk
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

  return (
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
          <strong> game</strong> you can edit (icon, name, slug) in the <strong>Games</strong> tab.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category search */}
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

        {/* "Add as" selector */}
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

        {/* Category list (like the Games tab game list) */}
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
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
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
  );
};

export default G2BulkVGImport;
