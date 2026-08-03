import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { db } from "@/integrations/db/client";
import Header from "@/components/Header";
import HeaderSpacer from "@/components/HeaderSpacer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Receipt, 
  CheckCircle2,
  Clock,
  AlertCircle,
  Home,
  ShoppingBag,
  ExternalLink,
  FileText
} from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { useFavicon } from "@/hooks/useFavicon";
import { useAuth } from "@/contexts/AuthContext";

interface Order {
  id: string;
  game_name: string;
  package_name: string;
  player_id: string;
  amount: number;
  currency: string;
  status: string;
  card_codes?: Array<{ code: string; serial?: string; expire?: string }>;
  created_at: string;
}

const OrderHistoryPage = () => {
  const { settings } = useSite();
  const { user } = useAuth();
  
  useFavicon(settings.siteIcon);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeCardCodes = (raw: unknown): Array<{ code: string; serial?: string; expire?: string }> => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as Array<{ code: string; serial?: string; expire?: string }>;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch { /* ignore */ }
    }
    return [];
  };

  useEffect(() => {
    if (user) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await db
        .from("topup_orders")
        .select("id, game_name, package_name, player_id, amount, currency, status, card_codes, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders((data || []).map(o => ({ ...o, card_codes: normalizeCardCodes(o.card_codes) })));
    } catch (err: any) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("km-KH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-green-500 hover:bg-green-600 text-white gap-1">
            <CheckCircle2 className="w-3 h-3" />
            បង់រួច
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white gap-1">
            <Clock className="w-3 h-3" />
            រង់ចាំ
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="w-3 h-3" />
            បរាជ័យ
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Helmet>
          <title>ប្រវត្តិការបញ្ជាទិញ - {settings.siteName}</title>
        </Helmet>
        <div className="min-h-screen pb-8">
          <Header />
          <HeaderSpacer />
          <div className="container mx-auto px-4 py-12 max-w-lg">
            <Card className="text-center">
              <CardContent className="py-8">
                <ShoppingBag className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h1 className="text-2xl font-bold mb-2">សូមចូលគណនី</h1>
                <p className="text-muted-foreground mb-4">
                  អ្នកត្រូវចូលគណនីដើម្បីមើលប្រវត្តិការបញ្ជាទិញ។
                </p>
                <Link to="/auth">
                  <Button className="bg-gold hover:bg-gold/90 text-white">
                    ចូលគណនី
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>ប្រវត្តិការបញ្ជាទិញ - {settings.siteName}</title>
      </Helmet>

      <div 
        className="min-h-screen pb-8 relative"
        style={{
          backgroundColor: settings.topupBackgroundColor || undefined,
        }}
      >
        {settings.topupBackgroundImage && (
          <div 
            className="fixed inset-0 -z-20 pointer-events-none"
            style={{
              backgroundImage: `url(${settings.topupBackgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        <Header />
        <HeaderSpacer />
        
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="w-6 h-6 text-gold" />
              ប្រវត្តិការបញ្ជាទិញ
            </h1>
            <Link to="/">
              <Button variant="outline" size="sm">
                <Home className="w-4 h-4 mr-2" />
                ទំព័រដើម
              </Button>
            </Link>
          </div>

          {orders.length === 0 ? (
            <Card className="text-center">
              <CardContent className="py-12">
                <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">មិនមានការបញ្ជាទិញ</h2>
                <p className="text-muted-foreground mb-4">
                  អ្នកមិនទាន់មានការបញ្ជាទិញណាមួយទេ។
                </p>
                <Link to="/">
                  <Button className="bg-gold hover:bg-gold/90 text-white">
                    <ShoppingBag className="w-4 h-4 mr-2" />
                    ចាប់ផ្តើមទិញ
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} className="hover:border-gold/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{order.game_name}</h3>
                          {getStatusBadge(order.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {order.package_name}
                        </p>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>Player: {order.player_id}</span>
                          <span>{formatDate(order.created_at)}</span>
                        </div>

                        {Array.isArray(order.card_codes) && order.card_codes.length > 0 && (
                          <div className="mt-3 p-3 rounded-xl bg-gold/5 border border-gold/20">
                            <p className="text-xs font-semibold text-gold mb-2">
                              🎁 {order.game_name === 'Gift Card' ? 'Gift Card' : 'Voucher'} Codes
                            </p>
                            <div className="space-y-1.5">
                              {order.card_codes.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <code className="flex-1 font-mono text-xs bg-white/70 dark:bg-zinc-800/70 rounded-lg px-2 py-1 select-all break-all">
                                    {item.code}
                                  </code>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(item.code)}
                                    className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-md bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20 transition-colors"
                                  >
                                    Copy
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-lg font-bold text-gold">
                              ${Number(order.amount ?? 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.currency}
                          </p>
                        </div>
                        
                        <Link to={`/invoice/${order.id}`}>
                          <Button variant="outline" size="sm">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrderHistoryPage;