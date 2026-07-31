import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Check, AlertTriangle, Gift } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';

const G2BulkVGImport: React.FC = () => {
  const [importingType, setImportingType] = useState<'voucher' | 'gift_card' | null>(null);
  const [result, setResult] = useState<{ type: string; count: number } | null>(null);

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
          Import voucher and gift card products from G2Bulk. These appear on /get-vg page.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
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
              <><Download className="w-4 h-4 mr-2" />Import Vouchers</>
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
              <><Download className="w-4 h-4 mr-2" />Import Gift Cards</>
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
