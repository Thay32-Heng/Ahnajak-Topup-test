import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { db } from '@/integrations/db/client';
import { RefreshCw, Package, CheckCircle, XCircle, Clock, AlertTriangle, Search, BarChart3, Bell, BellOff, CreditCard, Copy, ChevronDown, Play } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import G2BulkStatsDashboard from './G2BulkStatsDashboard';
import RealtimeOrderStatusWidget from './RealtimeOrderStatusWidget';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface CardCode {
  code: string;
  serial?: string;
  expire?: string;
}

interface Order {
  id: string;
  game_name: string;
  package_name: string;
  player_id: string;
  server_id: string | null;
  player_name: string | null;
  amount: number;
  currency: string;
  payment_method: string | null;
  status: string;
  status_message: string | null;
  g2bulk_order_id: string | null;
  g2bulk_product_id: string | null;
  card_codes: CardCode[] | null;
  created_at: string;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock className="w-4 h-4" />, color: 'bg-yellow-500', label: 'Pending' },
  paid: { icon: <CreditCard className="w-4 h-4" />, color: 'bg-emerald-500', label: 'Paid' },
  processing: { icon: <RefreshCw className="w-4 h-4 animate-spin" />, color: 'bg-gold', label: 'Processing' },
  completed: { icon: <CheckCircle className="w-4 h-4" />, color: 'bg-green-500', label: 'Completed' },
  failed: { icon: <XCircle className="w-4 h-4" />, color: 'bg-red-500', label: 'Failed' },
  pending_manual: { icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-orange-500', label: 'Manual Review' },
};

const OrdersTab: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [checkingG2Bulk, setCheckingG2Bulk] = useState<Record<string, boolean>>({});
  const [showStats, setShowStats] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const ordersRef = useRef<Order[]>([]);
  const { playNewOrderSound, playCompletedSound, playFailedSound, playStatusChangeSound } = useNotificationSound();

  // Keep ref in sync with state
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Initial load
  useEffect(() => {
    loadOrders();
  }, []);

  // Realtime subscription
  useEffect(() => {
    console.log('[Realtime] Setting up subscription for topup_orders');
    
    const channel = db
      .channel('admin-orders-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'topup_orders'
        },
        (payload) => {
          console.log('[Realtime] New order received:', payload);
          const newOrder = payload.new as Order;
          
          // Add to orders list
          setOrders(prev => [newOrder, ...prev]);
          
          // Play sound and show toast
          if (soundEnabled) {
            playNewOrderSound();
          }
          
          toast({
            title: '🆕 New Order!',
            description: `${newOrder.game_name} - ${newOrder.package_name} ($${newOrder.amount})`,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'topup_orders'
        },
        (payload) => {
          console.log('[Realtime] Order updated:', payload);
          const updatedOrder = payload.new as Order;
          const oldOrder = payload.old as Order;
          
          // Update orders list
          setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
          
          // Play appropriate sound based on status change
          if (oldOrder.status !== updatedOrder.status && soundEnabled) {
            if (updatedOrder.status === 'completed') {
              playCompletedSound();
              toast({
                title: '✅ Order Completed',
                description: `${updatedOrder.game_name} - ${updatedOrder.package_name}`,
              });
            } else if (updatedOrder.status === 'failed') {
              playFailedSound();
              toast({
                title: '❌ Order Failed',
                description: `${updatedOrder.game_name} - ${updatedOrder.package_name}`,
                variant: 'destructive',
              });
            } else {
              playStatusChangeSound();
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      console.log('[Realtime] Cleaning up subscription');
      db.removeChannel(channel);
    };
  }, [soundEnabled, playNewOrderSound, playCompletedSound, playFailedSound, playStatusChangeSound]);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('topup_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      // Parse card_codes from JSON
      const ordersWithParsedCards = (data || []).map(order => ({
        ...order,
        card_codes: order.card_codes ? (order.card_codes as unknown as CardCode[]) : null
      })) as Order[];
      setOrders(ordersWithParsedCards);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({ title: 'Failed to load orders', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const { error } = await db
        .from('topup_orders')
        .update({ status, status_message: `Manually updated to ${status}` })
        .eq('id', orderId);

      if (error) throw error;
      
      toast({ title: 'Order status updated!' });
      loadOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      toast({ title: 'Failed to update order', variant: 'destructive' });
    }
  };

  const checkG2BulkStatus = async (order: Order) => {
    if (!order.g2bulk_order_id) {
      toast({ title: 'No G2Bulk order ID', description: 'This order has not been sent to G2Bulk yet.', variant: 'destructive' });
      return;
    }

    setCheckingG2Bulk(prev => ({ ...prev, [order.id]: true }));
    try {
      const { data, error } = await db.functions.invoke('process-topup', {
        body: { 
          action: 'check_status', 
          orderId: order.id
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ 
          title: 'G2Bulk Status', 
          description: `Order status: ${data.our_status || data.g2bulk_status || 'Unknown'}` 
        });
        loadOrders();
      } else {
        toast({ 
          title: 'G2Bulk check failed', 
          description: data?.error || 'Unable to fetch order status from G2Bulk', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      console.error('Error checking G2Bulk status:', error);
      toast({ title: 'Failed to check G2Bulk status', variant: 'destructive' });
    } finally {
      setCheckingG2Bulk(prev => ({ ...prev, [order.id]: false }));
    }
  };

  const retryG2BulkOrder = async (order: Order) => {
    if (!order.g2bulk_product_id) {
      toast({ title: 'No G2Bulk product linked', description: 'This order package is not linked to a G2Bulk product.', variant: 'destructive' });
      return;
    }

    setCheckingG2Bulk(prev => ({ ...prev, [order.id]: true }));
    try {
      const { data, error } = await db.functions.invoke('process-topup', {
        body: { action: 'fulfill', orderId: order.id, force: true },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: 'Order sent to G2Bulk!', description: 'The order has been resubmitted for processing.' });
      } else {
        toast({ title: 'Retry failed', description: data?.error || 'Failed to process order', variant: 'destructive' });
      }
      
      loadOrders();
    } catch (error) {
      console.error('Error retrying G2Bulk order:', error);
      const message = error instanceof Error ? error.message : undefined;
      toast({ title: 'Failed to retry order', description: message, variant: 'destructive' });
    } finally {
      setCheckingG2Bulk(prev => ({ ...prev, [order.id]: false }));
    }
  };

  const filteredOrders = filter === 'all' 
    ? orders 
    : orders.filter(o => o.status === filter);

  const orderStats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending' || o.status === 'pending_manual' || o.status === 'paid').length,
    processing: orders.filter(o => o.status === 'processing').length,
    completed: orders.filter(o => o.status === 'completed').length,
    failed: orders.filter(o => o.status === 'failed').length,
  };

  const allStatuses = ['pending', 'paid', 'processing', 'completed', 'failed', 'pending_manual'];

  if (isLoading) {
    return (
      <Card className="border-gold/30">
        <CardContent className="p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gold" />
          <p className="mt-4 text-muted-foreground">Loading orders...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Realtime Status & Sound Toggle */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isRealtimeConnected ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
            <div className={`w-2 h-2 rounded-full ${isRealtimeConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <span className="text-xs font-medium">
              {isRealtimeConnected ? 'Live' : 'Connecting...'}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {soundEnabled ? (
              <Bell className="w-4 h-4 text-gold" />
            ) : (
              <BellOff className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-sm hidden sm:inline">Sound</span>
            <Switch
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
            />
          </div>
        </div>

        {/* Analytics Toggle */}
        <Button
          variant={showStats ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowStats(!showStats)}
          className={showStats ? 'bg-gold hover:bg-gold/90' : ''}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          {showStats ? 'Hide Analytics' : 'Show Analytics'}
        </Button>
      </div>

      {/* G2Bulk Stats Dashboard */}
      {showStats && <G2BulkStatsDashboard />}

      {/* Real-time Order Status Widget */}
      <RealtimeOrderStatusWidget />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-gold/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{orderStats.total}</p>
            <p className="text-sm text-muted-foreground">Total Orders</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{orderStats.pending}</p>
            <p className="text-sm text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="border-gold/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gold">{orderStats.processing}</p>
            <p className="text-sm text-muted-foreground">Processing</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{orderStats.completed}</p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{orderStats.failed}</p>
            <p className="text-sm text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Refresh */}
      <Card className="border-gold/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-gold" />
              Recent Orders
            </CardTitle>
            <Button variant="outline" size="sm" onClick={loadOrders}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {['all', 'pending', 'paid', 'processing', 'completed', 'failed', 'pending_manual'].map((status) => (
              <Button
                key={status}
                variant={filter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(status)}
                className={filter === status ? 'bg-gold hover:bg-gold/90' : ''}
              >
                {status === 'all' ? 'All' : statusConfig[status]?.label || status}
              </Button>
            ))}
          </div>

          {/* Orders list */}
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders found
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const statusInfo = statusConfig[order.status] || statusConfig.pending;
                return (
                  <div 
                    key={order.id} 
                    className="p-4 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`${statusInfo.color} text-white`}>
                            {statusInfo.icon}
                            <span className="ml-1">{statusInfo.label}</span>
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Game:</span>{' '}
                            <span className="font-medium">{order.game_name}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Package:</span>{' '}
                            <span className="font-medium">{order.package_name}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Player:</span>{' '}
                            <span className="font-medium">{order.player_name || order.player_id}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Amount:</span>{' '}
                            <span className="font-bold text-gold">${Number(order.amount).toFixed(2)}</span>
                          </div>
                        </div>
                        {order.status_message && (
                          <p className="text-xs text-muted-foreground mt-2">{order.status_message}</p>
                        )}
                        {order.g2bulk_order_id && (
                          <p className="text-xs text-muted-foreground mt-1">G2Bulk: {order.g2bulk_order_id}</p>
                        )}
                        
                        {/* Card Codes Display */}
                        {order.card_codes && Array.isArray(order.card_codes) && order.card_codes.length > 0 && (
                          <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30">
                            <div className="flex items-center gap-2 mb-2">
                              <CreditCard className="w-4 h-4 text-purple-400" />
                              <span className="text-sm font-medium text-purple-300">Card/PIN Codes</span>
                            </div>
                            <div className="space-y-2">
                              {order.card_codes.map((card, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-background/50 rounded border border-border">
                                  <div className="flex-1 font-mono text-sm">
                                    <span className="text-muted-foreground">Code: </span>
                                    <span className="text-green-400 font-bold select-all">{card.code}</span>
                                  </div>
                                  {card.serial && (
                                    <div className="font-mono text-sm">
                                      <span className="text-muted-foreground">Serial: </span>
                                      <span className="text-gold select-all">{card.serial}</span>
                                    </div>
                                  )}
                                  {card.expire && (
                                    <div className="text-xs text-muted-foreground">
                                      Expires: {card.expire}
                                    </div>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`Code: ${card.code}${card.serial ? `, Serial: ${card.serial}` : ''}`);
                                      toast({ title: 'Copied to clipboard!' });
                                    }}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {/* Status Change Dropdown - Always visible for admin */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1">
                              Change Status
                              <ChevronDown className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {allStatuses.map((status) => {
                              const config = statusConfig[status];
                              const isCurrentStatus = order.status === status;
                              return (
                                <DropdownMenuItem
                                  key={status}
                                  onClick={() => !isCurrentStatus && updateOrderStatus(order.id, status)}
                                  disabled={isCurrentStatus}
                                  className={`gap-2 ${isCurrentStatus ? 'opacity-50' : ''}`}
                                >
                                  <span className={`w-2 h-2 rounded-full ${config?.color || 'bg-gray-500'}`} />
                                  {config?.label || status}
                                  {isCurrentStatus && <span className="text-xs text-muted-foreground">(current)</span>}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* G2Bulk Status Check */}
                        {order.g2bulk_order_id && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            disabled={checkingG2Bulk[order.id]}
                            onClick={() => checkG2BulkStatus(order)}
                          >
                            {checkingG2Bulk[order.id] ? (
                              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4 mr-1" />
                            )}
                            Check G2Bulk
                          </Button>
                        )}
                        
                        {/* Process Now - Primary action for paid orders */}
                        {order.status === 'paid' && order.g2bulk_product_id && (
                          <Button 
                            size="sm" 
                            className="bg-emerald-500 hover:bg-emerald-600 text-white"
                            disabled={checkingG2Bulk[order.id]}
                            onClick={() => retryG2BulkOrder(order)}
                          >
                            {checkingG2Bulk[order.id] ? (
                              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4 mr-1" />
                            )}
                            Process Now
                          </Button>
                        )}

                        {/* Retry G2Bulk (for failed or pending_manual orders) */}
                        {(order.status === 'pending_manual' || order.status === 'failed') && order.g2bulk_product_id && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-gold border-gold hover:bg-gold hover:text-white"
                            disabled={checkingG2Bulk[order.id]}
                            onClick={() => retryG2BulkOrder(order)}
                          >
                            {checkingG2Bulk[order.id] ? (
                              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-1" />
                            )}
                            Retry G2Bulk
                          </Button>
                        )}
                      </div>
                    </div>
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

export default OrdersTab;


