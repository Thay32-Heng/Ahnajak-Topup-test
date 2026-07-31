import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { db } from "@/integrations/db/client";
import Header from "@/components/Header";
import HeaderSpacer from "@/components/HeaderSpacer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  ArrowLeft, 
  Loader2, 
  Receipt, 
  Download,
  Home,
  Clock,
  AlertCircle,
  User,
  Gamepad2,
  Package,
  CreditCard
} from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { useFavicon } from "@/hooks/useFavicon";
import { toast } from "@/hooks/use-toast";

interface OrderData {
  id: string;
  game_name: string;
  package_name: string;
  player_id: string;
  server_id?: string;
  player_name?: string;
  amount: number;
  currency: string;
  status: string;
  status_message?: string;
  payment_method?: string;
  card_codes?: Array<{ code: string; serial?: string; expire?: string }>;
  created_at: string;
  updated_at: string;
}

const InvoicePage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { settings } = useSite();
  
  useFavicon(settings.siteIcon);

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orderId) {
      fetchOrder();
      
      // Set up realtime subscription for order updates
      const channel = db
        .channel(`order-${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'topup_orders',
            filter: `id=eq.${orderId}`
          },
          (payload) => {
            console.log('[Invoice] Order updated:', payload);
            setOrder(payload.new as OrderData);
          }
        )
        .subscribe();

      return () => {
        db.removeChannel(channel);
      };
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const { data, error } = await db
        .from("topup_orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Order not found");

      setOrder(data);
    } catch (err: any) {
      console.error("Error fetching order:", err);
      setError(err.message || "Failed to load order");
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
      case "completed":
        return (
          <Badge className="bg-green-500 hover:bg-green-600 text-white gap-1">
            <CheckCircle2 className="w-3 h-3" />
            បានបញ្ចប់
          </Badge>
        );
      case "processing":
        return (
          <Badge className="bg-gold hover:bg-gold/80 text-white gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            កំពុងដំណើរការ
          </Badge>
        );
      case "paid":
        return (
          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1">
            <CheckCircle2 className="w-3 h-3" />
            បង់ប្រាក់រួច
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white gap-1">
            <Clock className="w-3 h-3" />
            រង់ចាំបង់ប្រាក់
          </Badge>
        );
      case "pending_manual":
        return (
          <Badge className="bg-orange-500 hover:bg-orange-600 text-white gap-1">
            <AlertCircle className="w-3 h-3" />
            រង់ចាំផ្ទៀងផ្ទាត់
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

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <>
        <Helmet>
          <title>វិក្កយបត្រមិនមាន - {settings.siteName}</title>
        </Helmet>
        <div className="min-h-screen pb-8">
          <Header />
          <HeaderSpacer />
          <div className="container mx-auto px-4 py-12 max-w-lg">
            <Card className="text-center">
              <CardContent className="py-8">
                <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
                <h1 className="text-2xl font-bold mb-2">រកមិនឃើញ</h1>
                <p className="text-muted-foreground mb-4">
                  {error || "ការបញ្ជាទិញនេះមិនមានទេ។"}
                </p>
                <Button onClick={() => navigate("/")}>
                  <Home className="w-4 h-4 mr-2" />
                  ទៅទំព័រដើម
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  const isCompleted = order.status === "completed";
  const isProcessing = order.status === "processing";
  const isPaid = order.status === "paid";

  return (
    <>
      <Helmet>
        <title>វិក្កយបត្រ #{order.id.slice(0, 8)} - {settings.siteName}</title>
      </Helmet>

      <div 
        className="min-h-screen pb-8 print:bg-white relative"
        style={{
          backgroundColor: settings.topupBackgroundColor || undefined,
        }}
      >
        {settings.topupBackgroundImage && (
          <div 
            className="fixed inset-0 -z-20 pointer-events-none print:hidden"
            style={{
              backgroundImage: `url(${settings.topupBackgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        <div className="print:hidden">
          <Header />
          <HeaderSpacer />
        </div>
        
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
            ត្រលប់ទៅទំព័រដើម
          </Link>

          <Card className="overflow-hidden print:shadow-none print:border-2">
            {/* Header with Success Banner */}
            {isCompleted && (
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-white text-center">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-3" />
                <h1 className="text-2xl font-bold mb-1">បានបញ្ចប់ដោយជោគជ័យ!</h1>
                <p className="text-green-100">ការបញ្ជាទិញរបស់អ្នកត្រូវបានបំពេញ</p>
              </div>
            )}
            
            {isProcessing && (
              <div className="bg-gradient-to-r from-gold to-amber-600 p-6 text-white text-center">
                <Loader2 className="w-16 h-16 mx-auto mb-3 animate-spin" />
                <h1 className="text-2xl font-bold mb-1">កំពុងដំណើរការ...</h1>
                <p className="text-white/80">សូមរង់ចាំ យើងកំពុងបំពេញការបញ្ជាទិញ</p>
              </div>
            )}
            
            {isPaid && (
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white text-center">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-3" />
                <h1 className="text-2xl font-bold mb-1">បង់ប្រាក់បានជោគជ័យ!</h1>
                <p className="text-emerald-100">សូមអរគុណ កំពុងរៀបចំដំណើរការ</p>
              </div>
            )}

            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-gold" />
                  វិក្កយបត្រ
                </CardTitle>
                {getStatusBadge(order.status)}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Order Info */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">លេខបញ្ជាទិញ:</span>
                  <span className="font-mono font-semibold">#{order.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">កាលបរិច្ឆេទ:</span>
                  <span>{formatDate(order.created_at)}</span>
                </div>
                {order.payment_method && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">វិធីបង់ប្រាក់:</span>
                    <span className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      {order.payment_method}
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Game & Package Details */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4 text-gold" />
                  ព័ត៌មានកញ្ចប់
                </h3>
                
                <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center">
                    <Gamepad2 className="w-6 h-6 text-gold" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{order.game_name}</h4>
                    <p className="text-sm text-muted-foreground">{order.package_name}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Player Info */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <User className="w-4 h-4 text-gold" />
                  ព័ត៌មានអ្នកលេង
                </h3>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-muted-foreground text-xs mb-1">Player ID</p>
                    <p className="font-mono font-semibold">{order.player_id}</p>
                  </div>
                  {order.server_id && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-muted-foreground text-xs mb-1">Server ID</p>
                      <p className="font-mono font-semibold">{order.server_id}</p>
                    </div>
                  )}
                  {order.player_name && (
                    <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                      <p className="text-muted-foreground text-xs mb-1">Username</p>
                      <p className="font-semibold font-emoji" style={{ fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif' }}>
                        {order.player_name}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Total Amount */}
              <div className="bg-gradient-to-r from-gold/10 to-gold/5 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">ចំនួនសរុប</span>
                  <span className="text-2xl font-bold text-gold">
                    ${Number(order.amount ?? 0).toFixed(2)} {order.currency}
                  </span>
                </div>
              </div>

              {/* Status Message */}
              {order.status_message && (
                <div className="text-sm text-muted-foreground text-center p-3 bg-muted/30 rounded-lg">
                  {order.status_message}
                </div>
              )}

              {/* Delivered Voucher/Gift Card Codes */}
              {Array.isArray(order.card_codes) && order.card_codes.length > 0 && (
                <div className="border-2 border-dashed border-gold/40 rounded-2xl p-4 bg-gradient-to-br from-gold/10 to-transparent animate-fade-in-up">
                  <h3 className="text-center font-bold text-gold mb-1">
                    🎁 {order.game_name === 'Gift Card' ? 'Gift Card' : 'Voucher'} Codes Delivered
                  </h3>
                  <p className="text-center text-xs text-muted-foreground mb-3">
                    Copy your codes below. They will be available here and in your order history.
                  </p>
                  <div className="space-y-2">
                    {order.card_codes.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-3 rounded-xl bg-white/90 border border-gold/20 shadow-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-bold text-sm sm:text-base tracking-wide break-all select-all">
                            {item.code}
                          </p>
                          {(item.serial || item.expire) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {item.serial && `Serial: ${item.serial} `}
                              {item.expire && `Expires: ${item.expire}`}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(item.code).then(() => {
                              toast({ title: "Code copied to clipboard" });
                            });
                          }}
                          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-4 print:hidden">
                <Button 
                  size="lg"
                  className="w-full bg-gold hover:bg-gold/90 text-white"
                  onClick={() => navigate("/")}
                >
                  <Home className="w-4 h-4 mr-2" />
                  បន្តទិញទំនិញ
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handlePrint}
                >
                  <Download className="w-4 h-4 mr-2" />
                  រក្សាទុក/បោះពុម្ព
                </Button>
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-muted-foreground pt-4 border-t">
                <p>សូមអរគុណសម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង!</p>
                <p className="mt-1">{settings.siteName}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default InvoicePage;
