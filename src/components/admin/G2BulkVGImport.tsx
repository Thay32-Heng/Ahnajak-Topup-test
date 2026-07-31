import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, RefreshCw, Check, AlertTriangle, Gift, Search, Loader2, PlusCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface SearchResult {
  id: string;
  name: string;
  category: string | null;
  amount: number;
  stock: number | null;
  imported: boolean;
  importedCategory: 'voucher' | 'gift_card' | null;
}

const G2BulkVGImport: React.FC = () => {
  const [importingType, setImportingType] = useState<'voucher' | 'gift_card' | null>(null);
  const [result, setResult] = useState<{ type: string; count: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [addCategory, setAddCategory] = useState<'voucher' | 'gift_card'>('voucher');
  const [addingId, setAddingId] = useState<string | null>(null);

  const handleImport = async (productType: 'voucher' | 'gift_card') => {
    setImportingType(productType);
    setResult(null);
    try {
      const { data, error } = await api.post('/products/vg/import', { product_type: productType });
      if (error) throw new Error(error);
      const count = (data as any)?.imported || 0;
      setResult({ type: productType, count });
      toast({
        title: 'Import Complete!',
        description: `Imported ${count} ${productType === 'voucher' ? 'voucher' : 'gift card'} products from G2Bulk`,
      });
      handleSearch();
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

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSearching(true);
    try {
      const { data, error } = await api.get(`/products/vg/search?q=${encodeURIComponent(searchQuery)}`);
      if (error) throw new Error(error);
      setResults((data as any)?.products || []);
    } catch (err: any) {
      toast({ title: 'Search Failed', description: err.message || 'Unknown error', variant: 'destructive' });
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Load the full list on mount — type in the search box to filter
  useEffect(() => {
    handleSearch();
  }, []);

  const handleAdd = async (id: string) => {
    setAddingId(id);
    try {
      const { data, error } = await api.post('/products/vg/import', {
        product_type: addCategory,
        productIds: [id],
      });
      if (error) throw new Error(error);
      toast({
        title: 'Added!',
        description: `Imported as ${addCategory === 'voucher' ? 'Voucher' : 'Gift Card'} — manage visibility in Prices → VG tab`,
      });
      handleSearch();
    } catch (err: any) {
      toast({ title: 'Add Failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setAddingId(null);
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
          Import voucher and gift card products from G2Bulk. These appear on /get-vg page.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search & add specific products */}
        <form onSubmit={handleSearch} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search G2Bulk vouchers... (name, amount, id)"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline" disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
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
        </form>

        {results && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {results.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No products found</p>
            ) : (
              results.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      ${(p.amount || 0).toFixed(2)}
                      {p.category ? <span className="text-muted-foreground/60"> · {p.category}</span> : null}
                      {p.stock !== null && (
                        <span className={p.stock <= 0 ? "text-red-500" : "text-muted-foreground/60"}>
                          {" "}· stock: {p.stock}
                        </span>
                      )}
                    </p>
                  </div>
                  {p.imported ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/30 whitespace-nowrap">
                      <Check className="w-3 h-3 mr-1" />Imported
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleAdd(p.id)}
                      disabled={addingId === p.id}
                      className="bg-purple-500/20 text-purple-600 hover:bg-purple-500/30 whitespace-nowrap"
                    >
                      {addingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <PlusCircle className="w-3.5 h-3.5 mr-1" />
                      )}
                      Add
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">or bulk import</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => handleImport('voucher')}
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
            onClick={() => handleImport('gift_card')}
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
            Imports card/voucher products from G2Bulk. Existing items with the same ID will be updated.
            Go to <strong>Prices → Voucher & Gift Card</strong> tab to manage visibility.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default G2BulkVGImport;
