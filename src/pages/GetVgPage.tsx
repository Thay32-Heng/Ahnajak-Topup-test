import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Loader2, ShoppingCart, Tag, Minus, Plus, LogIn, Check } from "lucide-react";
import Header from "@/components/Header";
import HeaderSpacer from "@/components/HeaderSpacer";
import { Button } from "@/components/ui/button";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useFavicon } from "@/hooks/useFavicon";
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

interface VgGame {
  id: string;
  name: string;
  slug: string;
  image?: string;
  description?: string;
  cover_image?: string;
  tags?: string[];
}

const MAX_QTY = 20;
const LIVE_POLL_MS = 5000;

function stockBadge(s: number | null | undefined): { label: string; cls: string; dot: string; out: boolean } {
  if (s === 0) return { label: 'Out of Stock', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/40', dot: 'bg-red-500', out: true };
  if (typeof s === 'number' && s > 0) return { label: `In Stock · ${s} left`, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-500', out: false };
  return { label: 'In Stock', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-500', out: false };
}

const GetVgPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { user: authUser } = useAuth();
  const { paymentMethods, settings, isLoading } = useSite();
  const { addToCart } = useCart();
  const isKesor = settings.siteName?.toLowerCase().includes('kesor');
  const primaryColor = settings.primaryColor || (isKesor ? '#D4A84B' : '#E53E3E');
  const isCategoryMode = !!slug;

  useFavicon(settings.siteIcon);

  const [products, setProducts] = useState<VgProduct[]>([]);
  const [categoryGame, setCategoryGame] = useState<VgGame | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'voucher' | 'gift_card'>('voucher');

  // Live G2Bulk stock + raw prices (slug mode only, 5s poll)
  const [liveStock, setLiveStock] = useState<Record<string, number | null>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [liveError, setLiveError] = useState(false);

  useEffect(() => {
    if (paymentMethods.length === 1 && paymentMethods[0].id) {
      setSelectedPayment(paymentMethods[0].id);
    }
  }, [paymentMethods]);

  // Reset quantity when switching products
  useEffect(() => {
    setQuantity(1);
  }, [selectedProduct]);

  useEffect(() => {
    const fetchProducts = async () => {
      setProductsLoading(true);
      try {
        if (isCategoryMode && slug) {
          const { data, error } = await api.get(`/products/vg/${slug}`);
          if (error) throw new Error(error.message || String(error));
          const d = data as any;
          setCategoryGame(d?.game || null);
          setProducts(Array.isArray(d?.products) ? d.products as VgProduct[] : []);
        } else {
          const { data, error } = await api.get('/products/vg');
          if (error) throw new Error(error.message || String(error));
          setProducts((Array.isArray(data) ? data : []) as VgProduct[]);
        }
      } catch (err) {
        console.error('Failed to load VG products:', err);
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    };
    fetchProducts();
  }, [slug, isCategoryMode]);

  // Poll live G2Bulk stock/prices for this category every 5s
  useEffect(() => {
    if (!isCategoryMode || !slug) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const { data, error } = await api.get(`/products/vg/${slug}/live`);
        if (cancelled || error || !data) {
          if (error) setLiveError(true);
          return;
        }
        const d = data as any;
        setLiveStock(d?.stock || {});
        setLivePrices(d?.prices || {});
        if (d?.updated_at) setLiveUpdatedAt(d.updated_at);
        setLiveError(false);
      } catch (err) {
        if (!cancelled) setLiveError(true);
      }
    };
    poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [slug, isCategoryMode]);

  const filteredProducts = useMemo(() => {
    if (isCategoryMode) return products.filter(p => p.price > 0);
    return products.filter(p => p.product_type === activeTab && p.price > 0);
  }, [products, activeTab, isCategoryMode]);

  // Auto-select the first in-stock product on category pages
  useEffect(() => {
    if (isCategoryMode && !selectedProduct && filteredProducts.length > 0) {
      const first = filteredProducts.find(p => liveStock[p.id] !== 0) || filteredProducts[0];
      setSelectedProduct(first.id);
    }
  }, [isCategoryMode, filteredProducts.length, liveStock, selectedProduct]);

  const selectedProductData = useMemo(() => {
    return products.find(p => p.id === selectedProduct) || null;
  }, [products, selectedProduct]);

  const unitPrice = selectedProductData?.price || 0;
  const totalPrice = Math.round(unitPrice * quantity * 100) / 100;

  // Voucher/Gift Card orders require login (also enforced on the server)
  const requireLogin = useCallback((): boolean => {
    if (authUser) return true;
    toast({ title: 'Login required', description: 'Please log in to order vouchers or gift cards', variant: 'destructive' });
    navigate(`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`);
    return false;
  }, [authUser, navigate, location.pathname, location.search]);

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
    if (!requireLogin()) return;

    const pkg = selectedProductData;
    if (!pkg) return;

    const paymentMethod = paymentMethods.find((p) => p.id === selectedPayment);
    const isKhqrcc = selectedPayment === 'khqrcc';
    const gameName = categoryGame?.name || (pkg.product_type === 'gift_card' ? 'Gift Card' : 'Voucher');

    if (isKhqrcc) {
      try {
        setIsSubmitting(true);
        const { data: newOrder, error: orderError } = await api.post('/orders', {
          game_name: gameName,
          package_name: pkg.name,
          player_id: '',
          server_id: null,
          player_name: null,
          amount: totalPrice,
          currency: pkg.currency || 'USD',
          payment_method: 'khqrcc',
          g2bulk_product_id: pkg.g2bulk_product_id || null,
          quantity,
        });

        if (orderError) throw new Error(orderError.message || String(orderError));
        const orderId = (newOrder as any)?.id;
        if (!orderId) throw new Error('Failed to create order');

        const remark = `Order ${pkg.name} ×${quantity}`;
        const { data, error } = await db.functions.invoke("khqrcc-payment", {
          body: {
            orderId,
            amount: totalPrice,
            remark,
            returnUrl: `${window.location.origin}/invoice/${orderId}`,
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
      gameId: categoryGame?.id || 'vg',
      gameName,
      gameIcon: categoryGame?.image || pkg.image || '',
      packageName: pkg.name,
      amount: pkg.name,
      price: pkg.price,
      quantity,
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

  const pageTitle = isCategoryMode && categoryGame ? categoryGame.name : 'Voucher & Gift Card';
  const pageDesc = isCategoryMode && categoryGame
    ? `Buy ${categoryGame.name} vouchers and gift cards instantly - ${settings.siteName}`
    : `Buy vouchers and gift cards instantly - ${settings.siteName}`;

  // ── Category (slug) mode: modern always-visible steps ─────────────────────
  const renderCategoryMode = () => {
    const steps = [
      { n: 1, kh: 'ជ្រើសរើសផលិតផល', en: 'Select Product', done: !!selectedProduct },
      { n: 2, kh: 'ចំនួន & ការទូទាត់', en: 'Quantity & Payment', done: !!selectedProduct && !!selectedPayment },
      { n: 3, kh: 'បញ្ជាក់ការបញ្ជាទិញ', en: 'Confirm Order', done: false },
    ];
    const gameName = categoryGame?.name || 'Vouchers & Gift Cards';
    const cover = categoryGame?.cover_image;

    return (
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

        {/* Hero */}
        <div className="relative overflow-hidden rounded-[32px] shadow-xl ring-1 ring-white/40 border border-white/60 animate-fade-in-up">
          <div className="relative h-52 sm:h-72 md:h-80 w-full">
            {cover ? (
              <img src={resolveIconUrl(cover)} alt={gameName} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div
                className="absolute inset-0 w-full h-full bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600"
                style={{ backgroundImage: `linear-gradient(120deg, ${primaryColor}, color-mix(in srgb, ${primaryColor} 55%, #7c3aed))` }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10" />
            <div className="pointer-events-none absolute -inset-[1px] rounded-[32px] bg-[length:200%_100%] animate-gradient-shift opacity-50"
              style={{ backgroundImage: `linear-gradient(120deg, ${primaryColor}50, transparent 30%, transparent 70%, ${primaryColor}50)` }}
            />
            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 flex items-end gap-3 sm:gap-5">
              {categoryGame?.image ? (
                <img
                  src={resolveIconUrl(categoryGame.image)}
                  alt={gameName}
                  className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 shadow-2xl shrink-0"
                  style={{ borderColor: primaryColor }}
                />
              ) : (
                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl bg-white/15 backdrop-blur-xl border border-white/40 flex items-center justify-center shrink-0 shadow-2xl">
                  <Tag className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-4xl font-bold text-white drop-shadow-lg truncate">{gameName}</h1>
                <p className="text-white/85 text-xs sm:text-base mt-1 line-clamp-2">
                  {categoryGame?.description || 'Instant code delivery'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur border border-white/30 text-[10px] sm:text-xs font-semibold text-white">
                    <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", liveError ? "bg-amber-400" : "bg-emerald-400")} />
                    {liveError ? 'Live feed offline' : `Live stock & price from ${settings.siteName}`}
                  </span>
                  {liveUpdatedAt && !liveError && (
                    <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-[10px] sm:text-xs text-white/80">
                      Updated {new Date(liveUpdatedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step tracker */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 mt-5 sm:mt-7 animate-fade-in-up">
          {steps.map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 && (
                <div className={cn("h-0.5 flex-1 max-w-12 sm:max-w-20 rounded-full transition-colors", s.done || steps[i - 1].done ? "bg-gold/70" : "bg-muted-foreground/20")} />
              )}
              <div className="flex flex-col items-center gap-1 px-1.5 sm:px-2">
                <div
                  className={cn(
                    "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-all border-2",
                    s.done
                      ? "text-white shadow-lg scale-105"
                      : "bg-white/70 backdrop-blur border-muted text-muted-foreground dark:bg-black/20"
                  )}
                  style={s.done ? { background: primaryColor, borderColor: primaryColor } : undefined}
                >
                  {s.done ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : s.n}
                </div>
                <div className="hidden sm:block text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.en}</p>
                  <p className="font-khmer text-[10px] text-muted-foreground/70">{s.kh}</p>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Select Product */}
        <div className="mt-5 sm:mt-7 p-5 sm:p-7 rounded-[28px] relative overflow-hidden border border-white/60 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)] backdrop-blur-2xl animate-fade-in-up"
          style={{ backgroundColor: settings.idSectionBgColor || "hsl(39 40% 95% / 0.85)" }}
        >
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gold/20 blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-2 sm:gap-3 mb-5">
            <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm text-white" style={{ backgroundColor: primaryColor }}>
              1
            </span>
            <h2 className="font-khmer text-base sm:text-xl font-bold" style={{ color: primaryColor }}>
              ជ្រើសរើសផលិតផល
            </h2>
            <span className="hidden sm:inline text-xs text-muted-foreground mt-0.5">Select Product</span>
            {selectedProduct && (
              <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                <Check className="w-3 h-3" /> Selected
              </span>
            )}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Tag className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground mb-2">No products available</h3>
              <p className="text-sm text-muted-foreground/60">Check back later for new products in this category</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {filteredProducts.map((product) => {
                const stock = liveStock[product.id];
                const badge = stockBadge(stock);
                const livePrice = livePrices[product.id];
                const isSelected = selectedProduct === product.id;
                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      if (badge.out) {
                        toast({ title: "Out of stock", description: `${product.name} is currently out of stock`, variant: "destructive" });
                        return;
                      }
                      setSelectedProduct(product.id);
                    }}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card/80 backdrop-blur transition-all duration-200 text-left",
                      isSelected
                        ? "shadow-xl -translate-y-0.5"
                        : "border-border/60 hover:border-muted-foreground/30 hover:shadow-lg hover:-translate-y-0.5",
                      badge.out && "opacity-60 grayscale hover:-translate-y-0"
                    )}
                    style={isSelected ? { borderColor: primaryColor } : undefined}
                  >
                    <div className="relative aspect-[4/3] flex items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-primary/10 via-card to-primary/10">
                      <div
                        className="absolute inset-0 opacity-[0.08] pointer-events-none"
                        style={{ backgroundImage: `radial-gradient(circle at 20% 30%, ${primaryColor}, transparent 60%), radial-gradient(circle at 80% 70%, ${primaryColor}, transparent 55%)` }}
                      />
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="relative w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-md group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <Tag className="relative w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/50" />
                      )}
                      <span className={cn("absolute top-2 right-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] sm:text-[10px] font-bold border backdrop-blur-sm z-10", badge.cls)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", badge.dot, !badge.out && "animate-pulse")} />
                        {badge.label}
                      </span>
                      {isSelected && (
                        <span className="absolute -top-px -right-px w-7 h-7 rounded-bl-2xl rounded-tr-2xl flex items-center justify-center text-white shadow-md z-10" style={{ background: primaryColor }}>
                          <Check className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                    <div className="p-3 sm:p-4 flex flex-col gap-1 flex-1">
                      <h4 className="text-xs sm:text-sm font-bold text-foreground leading-tight line-clamp-2">{product.name}</h4>
                      <div className="flex items-baseline gap-1.5 mt-auto pt-1">
                        <span className="text-base sm:text-lg font-extrabold" style={{ color: primaryColor }}>
                          ${product.price.toFixed(2)}
                        </span>
                      </div>
                      {livePrice != null && (
                        <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] text-muted-foreground">
                          <span className="w-1 h-1 rounded-full bg-emerald-500" />
                          G2Bulk live ${livePrice.toFixed(2)}
                        </span>
                      )}
                      {typeof stock === 'number' && stock > 0 && (
                        <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                          {stock} in stock
                        </span>
                      )}
                      {stock === 0 && (
                        <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold text-red-500">
                          <span className="w-1 h-1 rounded-full bg-red-500" />
                          Out of stock
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 2 + 3: Quantity & Payment / Confirm — always visible */}
        <div className="mt-5 sm:mt-7 p-5 sm:p-7 rounded-[28px] relative overflow-hidden border border-white/60 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)] backdrop-blur-2xl animate-fade-in-up"
          style={{ backgroundColor: settings.idSectionBgColor || "hsl(39 40% 95% / 0.85)" }}
        >
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-gold/20 blur-3xl pointer-events-none" />

          {/* Step 2 */}
          <div className="relative flex items-center gap-2 sm:gap-3 mb-5">
            <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm text-white" style={{ backgroundColor: primaryColor }}>
              2
            </span>
            <h2 className="font-khmer text-base sm:text-xl font-bold" style={{ color: primaryColor }}>
              ចំនួន & ការទូទាត់
            </h2>
            <span className="hidden sm:inline text-xs text-muted-foreground mt-0.5">Quantity & Payment</span>
          </div>

          <div className="relative space-y-5">
            {/* Quantity */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <label className="text-sm font-medium text-muted-foreground">
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border-2 border-muted-foreground/20 bg-white/60 flex items-center justify-center hover:bg-white disabled:opacity-40 transition-all"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-extrabold w-12 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(q => Math.min(MAX_QTY, q + 1))}
                  disabled={quantity >= MAX_QTY}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all shadow-md"
                  style={{ background: primaryColor }}
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">Max {MAX_QTY} codes per order</span>
            </div>

            {/* Payment methods */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Payment Method</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method.id)}
                    className={cn(
                      "relative p-3 rounded-2xl border-2 transition-all text-center bg-white/60 hover:bg-white",
                      selectedPayment === method.id ? "border-current shadow-md" : "border-muted-foreground/15 hover:border-muted-foreground/30"
                    )}
                    style={selectedPayment === method.id ? { borderColor: primaryColor } : undefined}
                  >
                    {selectedPayment === method.id && (
                      <span className="absolute -top-px -right-px w-6 h-6 rounded-bl-2xl rounded-tr-2xl flex items-center justify-center text-white" style={{ background: primaryColor }}>
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {method.icon && (
                      <img src={method.icon} alt={method.name} className="w-8 h-8 mx-auto mb-1 object-contain" />
                    )}
                    <span className="text-xs font-medium">{method.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 3 divider */}
          <div className="relative my-6 border-t border-dashed border-muted-foreground/20" />

          {/* Step 3 */}
          <div className="relative">
            <div className="flex items-center gap-2 sm:gap-3 mb-4">
              <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm text-white" style={{ backgroundColor: primaryColor }}>
                3
              </span>
              <h2 className="font-khmer text-base sm:text-xl font-bold" style={{ color: primaryColor }}>
                បញ្ជាក់ការបញ្ជាទិញ
              </h2>
              <span className="hidden sm:inline text-xs text-muted-foreground mt-0.5">Confirm Order</span>
            </div>

            {selectedProductData ? (
              <div className="mb-4 rounded-2xl border border-muted-foreground/10 bg-white/50 p-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {selectedProductData.image && (
                    <img src={selectedProductData.image} alt={selectedProductData.name} className="w-9 h-9 object-contain rounded-lg" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{selectedProductData.name}</p>
                    <p className="text-xs text-muted-foreground">{gameName} · ×{quantity}</p>
                  </div>
                </div>
                <span className="text-xl sm:text-2xl font-extrabold" style={{ color: primaryColor }}>
                  ${totalPrice.toFixed(2)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">Select a product in Step 1 to continue.</p>
            )}

            {!authUser && (
              <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
                <LogIn className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs sm:text-sm text-muted-foreground flex-1">
                  Login is required to order vouchers or gift cards.
                </p>
                <Button
                  size="sm"
                  className="bg-gold hover:bg-gold-dark text-primary-foreground whitespace-nowrap"
                  onClick={() => navigate(`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`)}
                >
                  Login
                </Button>
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer group mb-4">
              <button
                type="button"
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                  agreedToTerms ? "scale-110 shadow-md border-transparent text-white" : "border-muted-foreground"
                )}
                style={agreedToTerms ? { background: primaryColor } : {}}
              >
                {agreedToTerms && <Check className="w-3 h-3" />}
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
              ) : !authUser ? (
                <span className="flex items-center justify-center gap-2 relative z-10">
                  <LogIn className="w-5 h-5" />
                  ចូលប្រើដើម្បីទិញ
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2 relative z-10">
                  <ShoppingCart className="w-5 h-5" />
                  ទិញឥឡូវ {totalPrice > 0 && `($${totalPrice.toFixed(2)})`}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // ── Tab mode (legacy layout) ──────────────────────────────────────────────
  const renderTabMode = () => (
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
                    {activeTab === 'voucher' ? 'Redeem codes delivered instantly' : 'Perfect gifting solution'}
                  </p>
                </div>
              </div>
            </div>

            {!authUser && (
              <div className="p-4 rounded-[28px] shadow-lg ring-1 ring-white/40 border border-white/60 bg-white/75 backdrop-blur-2xl animate-fade-in-up">
                <div className="flex items-center gap-3">
                  <LogIn className="w-5 h-5 text-gold shrink-0" />
                  <p className="text-xs sm:text-sm text-muted-foreground flex-1">
                    Login is required to order vouchers or gift cards.
                  </p>
                  <Button
                    size="sm"
                    className="bg-gold hover:bg-gold-dark text-primary-foreground whitespace-nowrap"
                    onClick={() => navigate(`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`)}
                  >
                    Login
                  </Button>
                </div>
              </div>
            )}
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
              <p className="text-sm text-muted-foreground/60">
                Check back later for new {activeTab === 'voucher' ? 'vouchers' : 'gift cards'}
              </p>
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
                  </div>
                  {selectedProduct === product.id && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md" style={{ background: primaryColor }}>
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {selectedProduct && selectedProductData && (
            <div className="bg-white/80 backdrop-blur-xl rounded-[28px] p-5 sm:p-6 shadow-lg ring-1 ring-white/40 border border-white/60 animate-fade-in-up">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-bold text-lg">Selected: {selectedProductData.name}</h3>
                <span className="text-2xl font-extrabold" style={{ color: primaryColor }}>
                  ${totalPrice.toFixed(2)}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Quantity ({quantity} × ${unitPrice.toFixed(2)})
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="w-10 h-10 rounded-xl border-2 border-muted-foreground/20 bg-white/60 flex items-center justify-center hover:bg-white disabled:opacity-40 transition-all"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-xl font-extrabold w-12 text-center">{quantity}</span>
                    <button
                      onClick={() => setQuantity(q => Math.min(MAX_QTY, q + 1))}
                      disabled={quantity >= MAX_QTY}
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all shadow-md"
                      style={{ background: primaryColor }}
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-muted-foreground ml-2">Max {MAX_QTY} codes per order</span>
                  </div>
                </div>

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
                    type="button"
                    onClick={() => setAgreedToTerms(!agreedToTerms)}
                    className={cn(
                      "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                      agreedToTerms ? "scale-110 shadow-md border-transparent text-white" : "border-muted-foreground"
                    )}
                    style={agreedToTerms ? { background: primaryColor } : {}}
                  >
                    {agreedToTerms && <Check className="w-3 h-3" />}
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
                  ) : !authUser ? (
                    <span className="flex items-center justify-center gap-2 relative z-10">
                      <LogIn className="w-5 h-5" />
                      ចូលប្រើដើម្បីទិញ
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2 relative z-10">
                      <ShoppingCart className="w-5 h-5" />
                      ទិញឥឡូវ {totalPrice > 0 && `($${totalPrice.toFixed(2)})`}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>{pageTitle} - {settings.siteName}</title>
        <meta name="description" content={pageDesc} />
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
          isCategoryMode ? renderCategoryMode() : renderTabMode()
        )}
      </div>
    </>
  );
};

export default GetVgPage;
