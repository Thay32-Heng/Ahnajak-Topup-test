import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Gift, RefreshCw, Eye, EyeOff, Search, DollarSign } from 'lucide-react';

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

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/products/vg');
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: 'Failed to load products', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const toggleActive = async (product: VGProduct) => {
    try {
      await api.put(`/admin/g2bulk-products/${product.id}/toggle-active`);
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
      await api.put(`/admin/g2bulk-products/${productId}/price`, { price });
      toast({ title: 'Price updated' });
      setEditingPrice(prev => { const n = { ...prev }; delete n[productId]; return n; });
      fetchProducts();
    } catch {
      toast({ title: 'Failed to update price', variant: 'destructive' });
    }
  };

  const filtered = products.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.g2bulk_product_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="border-purple-500/30">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-purple-500" />
          Voucher & Gift Card Products
        </CardTitle>
        <Button variant="outline" size="sm" onClick={fetchProducts} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 border-purple-500/30 h-9"
          />
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
                  <th className="text-right py-2 font-medium">Price</th>
                  <th className="text-center py-2 font-medium">Status</th>
                  <th className="text-center py-2 font-medium w-24">Show/Hide</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const editVal = editingPrice[p.id] !== undefined ? editingPrice[p.id] : String(p.price);
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
  );
};

export default VGProductCatalogTab;
