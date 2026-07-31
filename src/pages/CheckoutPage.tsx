import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { db } from "@/integrations/db/client";
import Header from "@/components/Header";
import HeaderSpacer from "@/components/HeaderSpacer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ArrowLeft, Loader2, CheckCircle, Package, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/CartContext";
import { useSite } from "@/contexts/SiteContext";
import { useFavicon } from "@/hooks/useFavicon";
import KHQRPaymentCard from "@/components/KHQRPaymentCard";

interface GeneratedQR {
  qrCodeData: string;
  md5?: string;
  orderId: string;
  amount: number;
}

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, getTotal, clearCart, itemCount } = useCart();
  const { settings, ikhodePayment } = useSite();

  // Check if this is a preorder checkout
  const isPreorder = new URLSearchParams(window.location.search).get('preorder') === 'true';

  useFavicon(settings.siteIcon);

  const [processing, setProcessing] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<GeneratedQR | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderComplete, setOrderComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFinalTotal = () => getTotal();

  useEffect(() => {
    if (items.length === 0 && !orderComplete && !generatedQR) {
      navigate("/");
    }
  }, [items.length, orderComplete, generatedQR, navigate]);

  // Generate dynamic KHQR when checkout loads - use ref to prevent double calls
  const qrGenerationRef = { current: false };
  const generationGuardRef = useState(() => ({ started: false }))[0];

  useEffect(() => {
    if (ikhodePayment?.isEnabled && items.length > 0 && !generatedQR && !generatingQR && !generationGuardRef.started) {
      generationGuardRef.started = true;
      generateKHQR();
    }
  }, [ikhodePayment?.isEnabled, items.length]);

  const generateKHQR = async () => {
    if (items.length === 0) return;

    setGeneratingQR(true);
    setError(null);

    try {
      // First create the order with G2Bulk product ID
      const firstItem = items[0];
      const { data: orderData, error: orderError } = await db.functions.invoke("process-topup", {
        body: {
          game_name: firstItem.gameName,
          package_name: firstItem.packageName,
          player_id: firstItem.playerId,
          server_id: firstItem.serverId || null,
          player_name: firstItem.playerName,
          amount: getFinalTotal(),
          currency: settings.packageCurrency || "USD",
          payment_method: "KHQR",
          g2bulk_product_id: firstItem.g2bulkProductId || null,
          is_preorder: isPreorder,
          scheduled_fulfill_at: firstItem.scheduledFulfillAt || null,
        },
      });

      if (orderError) throw orderError;

      const newOrderId = orderData?.order_id;
      if (!newOrderId) throw new Error("Failed to create order");

      setOrderId(newOrderId);

      // Generate KHQR via Ahnajak gateway (DB price is authoritative)
      const { data, error } = await db.functions.invoke("ahnajak-khqr", {
        body: {
          action: "generate-qr",
          orderId: newOrderId,
        },
      });

      if (error) throw error;

      if (data?.qrCodeData) {
        setGeneratedQR({
          qrCodeData: data.qrCodeData,
          md5: data.md5,
          orderId: newOrderId,
          amount: data.amount,
        });
      } else {
        throw new Error(data?.error || "Failed to generate QR code");
      }
    } catch (err: any) {
      console.error("KHQR generation error:", err);
      setError(err.message || "Failed to generate payment QR");
      toast({
        title: "QR កំហុស",
        description: err.message || "Failed to generate payment QR",
        variant: "destructive",
      });
    } finally {
      setGeneratingQR(false);
    }
  };

  const handlePaymentComplete = () => {
    clearCart();
    setOrderComplete(true);
    toast({
      title: "✓ បង់ប្រាក់បានជោគជ័យ!",
      description: "ការបញ្ជាទិញរបស់អ្នកកំពុងដំណើរការ",
    });
    // Navigate to homepage after successful payment
    navigate("/");
  };

  const handleCancelPayment = () => {
    navigate("/");
  };

  // Order Success Screen
  if (orderComplete) {
    return (
      <>
        <Helmet>
          <title>បញ្ជាទិញជោគជ័យ - {settings.siteName}</title>
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
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}
          <Header />
          <HeaderSpacer />

          <div className="container mx-auto px-4 py-12 max-w-lg">
            <Card className="text-center">
              <CardContent className="py-8">
                <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                <h1 className="text-2xl font-bold mb-2">បញ្ជាទិញជោគជ័យ!</h1>
                {orderId && <p className="text-muted-foreground mb-4">លេខបញ្ជាទិញ: #{orderId.slice(0, 8)}</p>}
                <p className="text-sm text-muted-foreground mb-6">
                  សូមអរគុណសម្រាប់ការបញ្ជាទិញ។ យើងនឹងដំណើរការការបញ្ជាទិញរបស់អ្នកក្នុងពេលឆាប់ៗ។
                </p>
                <Button onClick={() => navigate("/")}>ត្រឡប់ទៅទំព័រដើម</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  // Check if IKhode is configured
  const isIkhodeConfigured = ikhodePayment?.isEnabled;

  return (
    <>
      <Helmet>
        <title>បង់ប្រាក់ - {settings.siteName}</title>
        <meta name="description" content="Complete your purchase" />
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
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        <Header />
        <HeaderSpacer />

        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 sm:mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            ត្រលប់ទៅទំព័រដើម
          </Link>

          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 flex items-center gap-3">
            <CreditCard className="w-7 h-7 sm:w-8 sm:h-8 text-gold" />
            បង់ប្រាក់
            <span className="text-sm font-normal text-muted-foreground">({itemCount} កញ្ចប់)</span>
          </h1>

          <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Order Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-gold" />
                  សង្ខេបការបញ្ជាទិញ
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      {item.gameIcon?.startsWith("/") || item.gameIcon?.startsWith("http") ? (
                        <img src={item.gameIcon} alt={item.gameName} className="w-8 h-8 object-contain rounded" />
                      ) : (
                        <span className="text-xl">{item.gameIcon || "🎮"}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{item.gameName}</h3>
                      <p className="text-xs text-muted-foreground truncate">{item.packageName}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.playerId ? (
                          <>👤 {item.playerName} ({item.playerId}
                          {item.serverId ? ` - ${item.serverId}` : ""})</>
                        ) : (
                          <>🎁 {item.gameName === 'Gift Card' ? 'Gift Card' : 'Voucher'} — instant delivery</>
                        )}
                      </p>
                    </div>
                    <Badge variant="secondary" className="flex-shrink-0">
                      ${item.price.toFixed(2)}
                    </Badge>
                  </div>
                ))}

                <Separator />

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between items-center font-bold text-lg border-t border-border pt-2">
                    <span>សរុប</span>
                    <span className="text-gold">${getTotal().toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Method Info */}
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm font-medium">វិធីបង់ប្រាក់: KHQR</p>
                  <p className="text-xs text-muted-foreground">ស្កេន QR ជាមួយកម្មវិធី Bakong ឬធនាគារ</p>
                </div>
              </CardContent>
            </Card>

            {/* Payment QR */}
            <div className="space-y-4">
              {generatingQR ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Loader2 className="w-12 h-12 mx-auto text-gold animate-spin mb-4" />
                    <p className="text-muted-foreground">កំពុងបង្កើត QR Code...</p>
                  </CardContent>
                </Card>
              ) : error ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
                    <p className="text-destructive font-medium mb-2">កំហុស</p>
                    <p className="text-sm text-muted-foreground mb-4">{error}</p>
                    <Button onClick={generateKHQR} variant="outline">
                      ព្យាយាមម្តងទៀត
                    </Button>
                  </CardContent>
                </Card>
              ) : generatedQR ? (
                <KHQRPaymentCard
                  qrCode={generatedQR.qrCodeData}
                  amount={getFinalTotal()}
                  currency={settings.packageCurrency || "USD"}
                  orderId={generatedQR.orderId}
                  description={`${items.length} កញ្ចប់`}
                  onCancel={handleCancelPayment}
                  onComplete={handlePaymentComplete}
                  paymentMethod="KHQR"
                  md5={generatedQR.md5}
                  isPreorder={isPreorder}
                />
              ) : !isIkhodeConfigured ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <CreditCard className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">KHQR មិនទាន់បានកំណត់។ សូមទាក់ទងអ្នកគ្រប់គ្រង។</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Loader2 className="w-12 h-12 mx-auto text-gold animate-spin mb-4" />
                    <p className="text-muted-foreground">កំពុងផ្ទុក...</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CheckoutPage;
