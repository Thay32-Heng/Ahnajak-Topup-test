import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Loader2, ShoppingCart, Tag } from "lucide-react";
import Header from "@/components/Header";
import HeaderSpacer from "@/components/HeaderSpacer";
import KhmerFrame from "@/components/KhmerFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useFavicon } from "@/hooks/useFavicon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { db } from "@/integrations/db/client";
import { resolveIconUrl } from "@/lib/icon-url";
import api from "@/lib/api";

interface VgProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  currency: string;
  image?: string;
  product_type: 'voucher' | 'gift_card';
  g2bulk_product_id?: string;
  g2bulk_type_id?: string;
  fields?: Record<string, string>;
}

const GetVgPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { paymentMethods, settings, isLoading } = useSite();
  const { addToCart } = useCart();
  const isKesor = settings.siteName?.toLowerCase().includes('kesor');
  const primaryColor = settings.primaryColor || (isKesor ? '#D4A84B' : '#E53E3E');

  useFavicon(settings.siteIcon);

  const [products, setProducts] = useState<VgProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'voucher' | 'gift_card'>('voucher');

  useEffect(() => {
    if (paymentMethods.length === 1 && paymentMethods[0].id) {
      setSelectedPayment(paymentMethods[0].id);
    }
  }, [paymentMethods]);

  useEffect(() => {
    const fetchProducts = async () => {
      setProductsLoading(true);
      try {
        const { data } = await api.get('/products/vg');
        const all = (Array.isArray(data) ? data : []) as VgProduct[];
        setProducts(all);
      } catch (err) {
        console.error('Failed to load VG products:', err);
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.product_type === activeTab && p.price > 0);
  }, [products, activeTab]);

  const selectedProductData = useMemo(() => {
    return products.find(p => p.id === selectedProduct) || null;
  }, [products, selectedProduct]);

  const handleSubmit = async () => {
    if (!selectedProduct) {
      toast({ title: "Please select a product", variant: "destructive" });
      return;
    }
    if (!selectedPayment) {
      toast({ title: "Please select a payment method", variant: "destructive" });
      return;
    }
    if (!agreedToTerms) {
      toast({ title: "Please agree to the terms", variant: "destructive" });
      return;
    }

    const pkg = selectedProductData;
    if (!pkg) return;

    const paymentMethod = paymentMethods.find((p) => p.id === selectedPayment);
    const isKhqrcc = selectedPayment === 'khqrcc';

    if (isKhqrcc) {
      try {
        setIsSubmitting(true);
        const orderId = `VG_ABA_${Date.now()}`;
        const remark = `Order ${pkg.name} - ${pkg.product_type}`;

        const { data: newOrder, error: orderError } = await db.from("topup_orders").insert({
          user_id: authUser?.id || null,
          game_name: pkg.product_type === 'gift_card' ? 'Gift Card' : 'Voucher',
          package_name: pkg.name,
          player_id: '',
          server_id: null,
          player_name: null,
          amount: pkg.price,
          status: "pending",
          payment_method: "khqrcc",
          g2bulk_product_id: pkg.g2bulk_product_id || null
        }).select('id').single();

        if (orderError) throw orderError;
        const dbOrderId = newOrder.id;

        const { data, error } = await db.functions.invoke("khqrcc-payment", {
          body: {
            orderId: dbOrderId,
            amount: pkg.price,
            remark,
            returnUrl: `${window.location.origin}/invoice/${dbOrderId}`
          },
        });

        if (error) throw error;
        window.location.href = data.url;
        return;
      } catch (err: any) {
        console.error("KHQRcc payment error:", err);
        toast({ title: "Payment error", description: err.message, variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
    }

    addToCart({
      id: `${pkg.id}-${Date.now()}`,
      packageId: pkg.id,
      gameId: 'vg',
      gameName: pkg.product_type === 'gift_card' ? 'Gift Card' : 'Voucher',
      gameIcon: pkg.image || '',
      packageName: pkg.name,
      amount: pkg.name,
      price: pkg.price,
      playerId: '',
      serverId: undefined,
      playerName: null,
      paymentMethodId: selectedPayment,
      paymentMethodName: paymentMethod?.name || "Unknown",
      g2bulkProductId: pkg.g2bulk_product_id,
      g2bulkTypeId: pkg.g2bulk_type_id,
    });

    navigate("/checkout");
  };

  return (
    <>
      <Helmet>
        <title>Voucher & Gift Card - {settings.siteName}</title>
        <meta name="description" content={`Buy vouchers and gift cards instantly - ${settings.siteName}`} />
      </Helmet>

      <div
        className="min-h-screen pb-24 md:pb-8 theme-accented-page relative"
        style={{
          backgroundColor: settings.topupBackgroundColor || undefined,
          '--primary-color': primaryColor
        } as React.CSSProperties}
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

        {isLoading || productsLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }} />
          </div>
        ) : (
          <div className="container mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 max-w-[1600px]">
            <Link
              to="/"
              className="group inline-flex items-center gap-2 text-sm sm:text-base text-muted-foreground hover:text-foreground mb-4 sm:mb-6 transition-colors animate-fade-in-up"
            >
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-sm flex items-center justify-center group-hover:bg-white group-hover:-translate-x-0.5 transition-all">
                <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </span>
              <span>ត្រលប់ក្រោយ</span>
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-6">
                <div className="space-y-4 animate-fade-in-up">
                  <div className="relative h-44 sm:h-56 w-full overflow-hidden rounded-[28px] shadow-lg ring-1 ring-white/40 border border-white/60 bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                        {activeTab === 'voucher' ? 'Vouchers' : 'Gift Cards'}
                      </h2>
                      <p className="text-white/80 text-sm mt-1">Instant delivery</p>
                    </div>
                    <div
                      className="pointer-events-none absolute -inset-[1px] rounded-[28px] bg-[length:200%_100%] animate-gradient-shift opacity-60"
                      style={{ backgroundImage: `linear-gradient(120deg, ${primaryColor}40, transparent 30%, transparent 70%, ${primaryColor}40)` }}
                    />
                  </div>

                  <div className="relative p-4 sm:p-5 rounded-[28px] shadow-lg ring-1 ring-white/40 border border-white/60 bg-white/75 backdrop-blur-2xl overflow-hidden">
                    <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl animate-float-slow" style={{ backgroundColor: `${primaryColor}25` }} />
                    <div className="relative z-10 flex items-center gap-3 sm:gap-4">
                      <div className="relative shrink-0 animate-float-slow">
                        <div className="absolute -inset-1.5 rounded-2xl blur-md opacity-80 animate-pulse-gold" style={{ background: `linear-gradient(135deg, ${primaryColor}, color-mix(in srgb, ${primaryColor} 60%, white), color-mix(in srgb, ${primaryColor} 80%, black))` }} />
                        <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center border-2 shadow-xl" style={{ borderColor: primaryColor }}>
                          <Tag className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg sm:text-xl font-bold text-foreground truncate">
                          {activeTab === 'voucher' ? 'Digital Vouchers' : 'Gift Cards'}
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          {activeTab === 'voucher' 
                            ? 'Redeem codes delivered instantly' 
                            : 'Perfect gifting solution'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 space-y-6">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setActiveTab('voucher')}
                    className={cn(
                      "px-5 py-2.5 rounded-full text-sm font-semibold transition-all border",
                      activeTab === 'voucher'
                        ? "text-white shadow-lg"
                        : "bg-white/70 text-muted-foreground border-muted hover:bg-white"
                    )}
                    style={activeTab === 'voucher' ? { background: primaryColor, borderColor: primaryColor } : {}}
                  >
                    Vouchers
                  </button>
                  <button
                    onClick={() => { setActiveTab('gift_card'); setSelectedProduct(null); }}
                    className={cn(
                      "px-5 py-2.5 rounded-full text-sm font-semibold transition-all border",
                      activeTab === 'gift_card'
                        ? "text-white shadow-lg"
                        : "bg-white/70 text-muted-foreground border-muted hover:bg-white"
                    )}
                    style={activeTab === 'gift_card' ? { background: primaryColor, borderColor: primaryColor } : {}}
                  >
                    Gift Cards
                  </button>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="text-center py-16">
                    <Tag className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground mb-2">No products available</h3>
                    <p className="text-sm text-muted-foreground/60">Check back later for new {activeTab === 'voucher' ? 'vouchers' : 'gift cards'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 animate-fade-in-up">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => setSelectedProduct(product.id)}
                        className={cn(
                          "relative group p-4 rounded-2xl border-2 transition-all duration-200 text-left",
                          selectedProduct === product.id
                            ? "border-current shadow-lg scale-[1.02]"
                            : "border-transparent bg-white/70 hover:bg-white hover:shadow-md hover:border-muted-foreground/20"
                        )}
                        style={selectedProduct === product.id ? { borderColor: primaryColor } : {}}
                      >
                        {product.image && (
                          <img src={product.image} alt={product.name} className="w-12 h-12 object-contain mb-3 rounded-lg" />
                        )}
                        <h4 className="font-semibold text-sm text-foreground mb-1 leading-tight">{product.name}</h4>
                        {product.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{product.description}</p>
                        )}
                        <div className="flex items-baseline gap-1.5 mt-auto">
                          <span className="text-lg font-extrabold" style={{ color: primaryColor }}>
                            ${product.price.toFixed(2)}
                          </span>
                          {product.original_price && product.original_price > product.price && (
                            <span className="text-xs text-muted-foreground line-through">
                              ${product.original_price.toFixed(2)}
                            </span>
                          )}
                        </div>
                        {selectedProduct === product.id && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md" style={{ background: primaryColor }}>
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedProduct && selectedProductData && (
                  <div className="bg-white/80 backdrop-blur-xl rounded-[28px] p-5 sm:p-6 shadow-lg ring-1 ring-white/40 border border-white/60 animate-fade-in-up">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">Selected: {selectedProductData.name}</h3>
                      <span className="text-2xl font-extrabold" style={{ color: primaryColor }}>
                        ${selectedProductData.price.toFixed(2)}
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Payment Method</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {paymentMethods.map((method) => (
                            <button
                              key={method.id}
                              onClick={() => setSelectedPayment(method.id)}
                              className={cn(
                                "p-3 rounded-2xl border-2 transition-all text-center",
                                selectedPayment === method.id
                                  ? "border-current shadow-md"
                                  : "border-transparent bg-white/50 hover:bg-white hover:border-muted-foreground/20"
                              )}
                              style={selectedPayment === method.id ? { borderColor: primaryColor } : {}}
                            >
                              {method.icon && (
                                <img src={method.icon} alt={method.name} className="w-8 h-8 mx-auto mb-1 object-contain" />
                              )}
                              <span className="text-xs font-medium">{method.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center gap-3 cursor-pointer group">
                        <button
                          onClick={() => setAgreedToTerms(!agreedToTerms)}
                          className={cn(
                            "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                            agreedToTerms ? "scale-110 shadow-md border-transparent text-white" : "border-muted-foreground"
                          )}
                          style={agreedToTerms ? { background: primaryColor } : {}}
                        >
                          {agreedToTerms && <span className="text-[10px] font-bold">✓</span>}
                        </button>
                        <span className="font-khmer text-sm">
                          យកព្រមទទួល
                          <Link to="/terms" target="_blank" className="font-bold underline underline-offset-4 mx-1" style={{ color: primaryColor }}>
                            លក្ខខណ្ឌ
                          </Link>
                        </span>
                      </label>

                      <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !selectedPayment || !agreedToTerms}
                        className="group relative w-full py-5 sm:py-7 text-base sm:text-lg font-bold rounded-2xl bg-gradient-to-r from-gold via-amber-400 to-gold-dark bg-[length:200%_100%] hover:bg-[position:100%_0] text-primary-foreground shadow-gold hover:shadow-2xl transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                      >
                        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        {isSubmitting ? (
                          <span className="flex items-center justify-center gap-2 relative z-10">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            កំពុងដំណើរការ...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2 relative z-10">
                            <ShoppingCart className="w-5 h-5" />
                            ទិញឥឡូវ
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default GetVgPage;
