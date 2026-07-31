import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Copy, Check, Timer, Smartphone, Shield, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/integrations/db/client";
import { useNotificationSound } from "@/hooks/useNotificationSound";

interface KHQRPaymentCardProps {
  qrCode: string;
  amount: number;
  currency?: string;
  orderId: string;
  description?: string;
  onComplete?: () => void;
  onCancel?: () => void;
  onRegenerate?: () => void;
  expiresIn?: number;
  paymentMethod?: string;
  md5?: string;
  isPreorder?: boolean;
}

const KHQRPaymentCard = ({
  qrCode,
  amount,
  currency = "USD",
  orderId,
  description,
  onComplete,
  onCancel,
  onRegenerate,
  expiresIn = 900,
  paymentMethod = "KHQR",
  md5,
  isPreorder = false,
}: KHQRPaymentCardProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { playCompletedSound } = useNotificationSound();

  const normalizeStatus = useCallback((s: unknown) => (typeof s === "string" ? s.toLowerCase() : ""), []);
  const isSuccessStatus = useCallback(
    (s: unknown) => {
      const status = normalizeStatus(s);
      return status === "paid" || status === "processing" || status === "completed";
    },
    [normalizeStatus],
  );

  const [timeLeft, setTimeLeft] = useState(expiresIn);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid">("pending");

  // Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Immediate redirect on payment detection - no waiting for completion
  const handlePaymentSuccess = useCallback(() => {
    if (paymentStatus === "paid") return; // Prevent duplicate calls

    setPaymentStatus("paid");
    playCompletedSound();
    toast({ title: "✅ ការបង់ប្រាក់បានទទួល!", description: "កំពុងបញ្ជូនទៅទំព័រវិក្កយបត្រ..." });

    // Quick redirect after showing success state
    setTimeout(() => {
      if (onComplete) {
        onComplete();
        return;
      }
      navigate(`/invoice/${orderId}`);
    }, 1000);
  }, [orderId, navigate, onComplete, playCompletedSound, toast, paymentStatus]);

  const checkPaymentStatus = useCallback(
    async (silent = false) => {
      if (!silent) setChecking(true);

      try {
        // Server-side check already queries both the gateway and the DB
        const { data: statusData, error: statusError } = await db.functions.invoke("ahnajak-khqr", {
          body: { action: "check-status", orderId, md5, is_preorder: isPreorder },
        });

        if (statusError) throw statusError;

        const status = normalizeStatus(statusData?.status);
        console.log(`[Poll] Backend status for ${orderId}:`, status);

        if (isSuccessStatus(status)) {
          console.log(`[Poll] Payment success detected! Status: ${status}`);
          handlePaymentSuccess();
          return;
        }

        if (!silent) {
          toast({
            title: "ការបង់ប្រាក់មិនទាន់ទទួល",
            description: "សូមបញ្ចប់ការទូទាត់នៅក្នុងកម្មវិធីធនាគាររបស់អ្នក",
          });
        }
      } catch (error: any) {
        console.error("Payment check error:", error);
        if (!silent) {
          toast({ title: "កំហុសពិនិត្យការទូទាត់", description: error.message, variant: "destructive" });
        }
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [orderId, md5, toast, handlePaymentSuccess, isSuccessStatus, normalizeStatus, isPreorder],
  );

  // db Realtime subscription for instant payment detection
  useEffect(() => {
    if (paymentStatus !== "pending") return;

    console.log(`[Payment] Setting up Realtime subscription for order: ${orderId}`);

    const channel = db
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: isPreorder ? "preorder_orders" : "topup_orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const newStatusRaw = (payload.new as any)?.status;
          const newStatus = normalizeStatus(newStatusRaw);
          console.log(`[Realtime] Order ${orderId} status changed to: ${newStatus}`);

          if (isSuccessStatus(newStatus)) {
            console.log(`[Realtime] Payment success detected! Status: ${newStatus}`);
            handlePaymentSuccess();
          }
        },
      )
      .subscribe((status) => {
        console.log(`[Realtime] Subscription status: ${status}`);
      });

    return () => {
      console.log(`[Payment] Cleaning up Realtime subscription for order: ${orderId}`);
      db.removeChannel(channel);
    };
  }, [paymentStatus, orderId, isSuccessStatus, normalizeStatus, handlePaymentSuccess, isPreorder]);

  const isExpired = timeLeft === 0;

  // Polling for payment status (fallback)
  useEffect(() => {
    if (paymentStatus !== "pending" || isExpired) return;

    const pollInterval = setInterval(async () => {
      await checkPaymentStatus(true);
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [paymentStatus, orderId, checkPaymentStatus, isExpired]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: `${label} បានចម្លង!` });
    setTimeout(() => setCopied(false), 2000);
  };

  if (paymentStatus === "paid") {
    return (
      <Card className="overflow-hidden border-0 shadow-2xl">
        <div className="bg-gradient-to-br from-green-500 via-green-600 to-green-700 p-8 text-white text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4 animate-bounce" />
          <h2 className="text-2xl font-bold mb-2">ការបង់ប្រាក់បានទទួល!</h2>
          <p className="text-white/80">កំពុងបញ្ជូនទៅទំព័រវិក្កយបត្រ...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-0 shadow-2xl">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-gold via-amber-600 to-amber-800 p-6 text-white overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">KHQR Payment</h2>
                <p className="text-white/80 text-sm">{paymentMethod}</p>
              </div>
            </div>
            <Badge className="bg-white/20 text-white border-0">
              <Shield className="w-3 h-3 mr-1" />
              Secure
            </Badge>
          </div>

          <div className="text-center py-4">
            <p className="text-white/70 text-sm mb-1">ចំនួនទឹកប្រាក់</p>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-bold">{currency === "USD" ? "$" : "៛"}</span>
              <span className="text-5xl font-bold">
                {currency === "KHR" ? amount.toLocaleString() : amount.toFixed(2)}
              </span>
              <span className="text-xl font-medium ml-1">{currency}</span>
            </div>
            {description && <p className="text-white/70 text-sm mt-2">{description}</p>}
          </div>
        </div>
      </div>

      <CardContent className="p-6 bg-gradient-to-b from-background to-muted/30">
        {/* QR Code */}
        <div className="relative mx-auto w-fit">
          <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-gold rounded-tl-lg" />
          <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-gold rounded-tr-lg" />
          <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-gold rounded-bl-lg" />
          <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-gold rounded-br-lg" />

          <div
            className={`p-4 bg-white rounded-2xl shadow-lg transition-all ${isExpired ? "opacity-50 grayscale" : ""}`}
          >
            <img src={qrCode} alt="KHQR Payment Code" className="w-64 h-64 object-contain" />
          </div>

          {isExpired && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
              <div className="text-center text-white">
                <Timer className="w-8 h-8 mx-auto mb-2" />
                <p className="font-semibold">QR ផុតកំណត់</p>
              </div>
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <Timer className={`w-4 h-4 ${timeLeft < 30 ? "text-destructive animate-pulse" : "text-muted-foreground"}`} />
          <span
            className={`font-mono text-lg ${timeLeft < 30 ? "text-destructive font-bold" : "text-muted-foreground"}`}
          >
            {formatTime(timeLeft)}
          </span>
          <span className="text-sm text-muted-foreground">នៅសល់</span>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-4 bg-muted/50 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-gold text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              1
            </div>
            <p className="text-sm">
              បើកកម្មវិធី <strong>Bakong</strong> ឬកម្មវិធីធនាគារ
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-gold text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              2
            </div>
            <p className="text-sm">
              ចុច <strong>Scan QR</strong> ហើយស្កេនកូដនេះ
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-gold text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              3
            </div>
            <p className="text-sm">បញ្ជាក់ការទូទាត់នៅក្នុងកម្មវិធី</p>
          </div>
        </div>

        {/* Order ID */}
        <div className="mt-4 flex items-center justify-between p-3 bg-muted rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Order ID</p>
            <p className="font-mono text-sm truncate max-w-[180px]">{orderId.slice(0, 8)}...</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => copyToClipboard(orderId, "Order ID")} className="h-8 w-8">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3">
          {isExpired && onRegenerate ? (
            <Button
              onClick={onRegenerate}
              className="w-full bg-gold hover:bg-gold/80 text-white gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              បង្កើត QR ថ្មី
            </Button>
          ) : (
            <Button
              onClick={() => checkPaymentStatus(false)}
              disabled={checking || isExpired}
              className="w-full bg-gold hover:bg-gold/80 text-white gap-2"
            >
              {checking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  កំពុងពិនិត្យ...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  ខ្ញុំបានបង់ប្រាក់រួចហើយ
                </>
              )}
            </Button>
          )}

          {onCancel && (
            <Button variant="outline" onClick={onCancel} className="w-full">
              បោះបង់ការបញ្ជាទិញ
            </Button>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-center text-muted-foreground mb-3">គាំទ្រដោយធនាគារ Bakong ទាំងអស់</p>
          <div className="flex items-center justify-center gap-4 opacity-60">
            <Smartphone className="w-5 h-5" />
            <span className="text-xs">ស្កេនជាមួយកម្មវិធីធនាគារណាមួយ</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default KHQRPaymentCard;

