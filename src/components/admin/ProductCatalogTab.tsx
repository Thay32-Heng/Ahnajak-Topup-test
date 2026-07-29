import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Search, RefreshCw, Database } from 'lucide-react';

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

const ProductCatalogTab: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/g2bulk-products');
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({ title: 'Failed to load product catalog', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const filtered = products.filter(p =>
    !search ||
    p.game_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.g2bulk_product_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card className="border-gold/30">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-gold" />
            Product Catalog
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchProducts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 border-gold/30"
            />
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? 'No products match your search.' : 'No products in catalog. Sync G2Bulk products first in the API Settings tab.'}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2 font-medium">Game</th>
                    <th className="text-left py-2 font-medium">Product</th>
                    <th className="text-right py-2 font-medium">Price</th>
                    <th className="text-center py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 font-medium">{p.game_name}</td>
                      <td className="py-2">{p.product_name}</td>
                      <td className="py-2 text-right font-mono">
                        {p.currency || 'USD'} {Number(p.price).toFixed(2)}
                      </td>
                      <td className="py-2 text-center">
                        <Badge variant={p.is_active ? 'default' : 'secondary'} className="text-xs">
                          {p.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground font-mono">{p.g2bulk_product_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductCatalogTab;
