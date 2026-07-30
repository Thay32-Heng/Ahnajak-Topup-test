import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, CheckCircle, Loader2, UserCheck, XCircle, Clock } from "lucide-react";
import Header from "@/components/Header";
import HeaderSpacer from "@/components/HeaderSpacer";
import PackageCard from "@/components/PackageCard";
import KhmerFrame from "@/components/KhmerFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSite } from "@/contexts/SiteContext";
import { useCart } from "@/contexts/CartContext";
import { useFavicon } from "@/hooks/useFavicon";
import { useGameIdCache } from "@/hooks/useGameIdCache";
import { useGameVerificationConfig, ZoneOption } from "@/hooks/useGameVerificationConfig";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { db } from "@/integrations/db/client";
import { resolveIconUrl } from "@/lib/icon-url";

interface PreorderPkg {
  id: string;
  game_id: string;
  name: string;
  amount: string;
  price: number;
  icon: string | null;
  label: string | null;
  label_bg_color: string | null;
  label_text_color: string | null;
  label_icon: string | null;
  g2bulk_product_id: string | null;
  g2bulk_type_id: string | null;
  quantity: number | null;
  scheduled_fulfill_at: string | null;
  sort_order: number;
}

interface VerifiedUser {
  username: string;
  id: string;
  serverId?: string;
  accountName?: string;
}

const PreorderTopupPage: React.FC = () => {
  const { gameSlug } = useParams();
  const navigate = useNavigate();
  const { games, paymentMethods, settings, isLoading } = useSite();
  const { addToCart } = useCart();

  useFavicon(settings.siteIcon);

  const game = games.find((g) => g.slug === gameSlug);
  const { cachedUserId, cachedServerId, saveToCache, hasCachedData } = useGameIdCache(game?.id);
  const { requiresZone: dbRequiresZone, isLoading: verifyConfigLoading, zoneOptions } = useGameVerificationConfig(game?.name);

  const [userId, setUserId] = useState("");
  const [serverId, setServerId] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preorderPackages, setPreorderPackages] = useState<PreorderPkg[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);

  // Verification states
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<VerifiedUser | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [alternateRegions, setAlternateRegions] = useState<Array<{
    gameName: string; apiCode: string; requiresZone: boolean;
  }> | null>(null);

  useEffect(() => {
    if (hasCachedData && !userId) {
      setUserId(cachedUserId);
      setServerId(cachedServerId);
    }
  }, [hasCachedData, cachedUserId, cachedServerId]);

  // Load preorder packages for this game
  useEffect(() => {
    if (!game) return;
    const loadPkgs = async () => {
      setPackagesLoading(true);
      try {
        const { data, error } = await db
          .from('preorder_packages')
          .select('*')
          .eq('game_id', game.id)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        setPreorderPackages((data || []) as PreorderPkg[]);
      } catch (error) {
        console.error('Error loading preorder packages:', error);
      } finally {
        setPackagesLoading(false);
      }
    };
    loadPkgs();
  }, [game?.id]);

  // Convert preorder packages to the format PackageCard expects
  const displayPackages = useMemo(() => {
    return [...preorderPackages]
      .sort((a, b) => a.price - b.price)
      .map(pkg => ({
        id: pkg.id,
        name: pkg.name,
        amount: pkg.amount,
        price: pkg.price,
        currency: 'USD',
        icon: pkg.icon || undefined,
        label: pkg.label || undefined,
        labelBgColor: pkg.label_bg_color || undefined,
        labelTextColor: pkg.label_text_color || undefined,
        labelIcon: pkg.label_icon || undefined,
        g2bulkProductId: pkg.g2bulk_product_id || undefined,
        g2bulkTypeId: pkg.g2bulk_type_id || undefined,
        quantity: pkg.quantity || undefined,
        points: (pkg as any).points || 0,
      }));
  }, [preorderPackages]);

  // Get earliest scheduled fulfillment for display
  const earliestFulfill = useMemo(() => {
    const dates = preorderPackages
      .map(p => p.scheduled_fulfill_at)
      .filter(Boolean)
      .sort();
    return dates[0] || null;
  }, [preorderPackages]);

  // Reuse same game ID config logic from TopupPage
  const getGameIdConfig = (gameName: string) => {
    const n = gameName.toLowerCase().trim();
    if (n.includes("mobile legends") || n === "mlbb") return { fields: [{ key: "userId", label: "User ID", placeholder: "បញ្ចូល User ID" }, { key: "serverId", label: "Server ID", placeholder: "Server ID", width: "w-24 sm:w-32" }], validation: "សូមបញ្ចូល User ID និង Server ID", example: "ឧទាហរណ៍: 123456789 (1234)" };
    if (n.includes("freefire") || n.includes("free fire") || n === "ff") return { fields: [{ key: "userId", label: "Player ID", placeholder: "បញ្ចូល Player ID" }], validation: "សូមបញ្ចូល Player ID", example: "ឧទាហរណ៍: 123456789" };
    if (n.includes("honor of kings") || n.includes("hok")) return { fields: [{ key: "userId", label: "Player ID", placeholder: "បញ្ចូល Player ID" }, { key: "serverId", label: "Server ID", placeholder: "Server ID", width: "w-24 sm:w-32" }], validation: "សូមបញ្ចូល Player ID និង Server ID", example: "ឧទាហរណ៍: 123456789 (1234)" };
    if (n.includes("magic chess")) return { fields: [{ key: "userId", label: "User ID", placeholder: "បញ្ចូល User ID" }, { key: "serverId", label: "Server ID", placeholder: "Server ID", width: "w-24 sm:w-32" }], validation: "សូមបញ្ចូល User ID និង Server ID", example: "ឧទាហរណ៍: 123456789 (1234)" };
    if (n.includes("genshin")) return { fields: [{ key: "userId", label: "UID", placeholder: "បញ្ចូល UID" }, { key: "serverId", label: "Server", placeholder: "Server", width: "w-32" }], validation: "សូមបញ្ចូល UID និង Server", example: "ឧទាហរណ៍: 8001234567 (Asia)" };
    if (n.includes("valorant")) return { fields: [{ key: "userId", label: "Riot ID", placeholder: "Name#Tag" }], validation: "សូមបញ្ចូល Riot ID", example: "ឧទាហរណ៍: PlayerName#1234" };
    if (n.includes("pubg")) return { fields: [{ key: "userId", label: "Character ID", placeholder: "បញ្ចូល Character ID" }], validation: "សូមបញ្ចូល Character ID", example: "ឧទាហរណ៍: 5123456789" };
    return { fields: [{ key: "userId", label: "Player ID", placeholder: "បញ្ចូល Player ID" }], validation: "សូមបញ្ចូល Player ID", example: "ឧទាហរណ៍: 123456789" };
  };

  const gameIdConfig = getGameIdConfig(game.name);
  const hardcodedRequiresZone = gameIdConfig.fields.length > 1;
  const requiresZone = dbRequiresZone || hardcodedRequiresZone;

  let dynamicFields = gameIdConfig;
  if (dbRequiresZone && gameIdConfig.fields.length === 1) {
    dynamicFields = {
      ...gameIdConfig,
      fields: [gameIdConfig.fields[0], { key: "serverId", label: "Server ID", placeholder: "Server ID", width: "w-24 sm:w-32" }],
      validation: "សូមបញ្ចូល ID និង Server ID",
    };
  }

  const hasMultipleFields = dynamicFields.fields.length > 1;

  const handleVerify = async () => {
    if (!userId.trim()) { toast({ title: dynamicFields.validation, variant: "destructive" }); return; }
    if (requiresZone && !serverId.trim()) { toast({ title: "សូមបញ្ចូល Server ID", variant: "destructive" }); return; }
    setIsVerifying(true); setVerificationError(null); setVerifiedUser(null); setAlternateRegions(null);
    try {
      const { data, error } = await db.functions.invoke("verify-game-id", {
        body: { gameName: game.name, userId: userId.trim(), serverId: serverId.trim() || undefined },
      });
      if (error) {
        let msg = error.message || "Verification failed";
        const anyErr = error as any;
        if (anyErr?.context && typeof anyErr.context.json === "function") {
          try { const body = await anyErr.context.json(); msg = body?.error || body?.message || msg; } catch {}
        }
        throw new Error(msg);
      }
      if (data?.success) {
        if (data?.manualVerification) {
          setVerificationError(data?.message || "Automatic verification is unavailable.");
          toast({ title: "ផ្ទៀងផ្ទាត់បរាជ័យ", description: data?.message, variant: "destructive" });
          return;
        }
        const username = data.username || data.accountName;
        setVerifiedUser({ username, id: userId, serverId: serverId || undefined, accountName: data.accountName });
        saveToCache(userId, serverId);
        toast({ title: "✓ ផ្ទៀងផ្ទាត់ដោយជោគជ័យ", description: `Username: ${username}` });
      } else {
        const errorMsg = data?.error || "មិនអាចផ្ទៀងផ្ទាត់ ID បានទេ។";
        setVerificationError(errorMsg);
        if (data?.alternateRegions) setAlternateRegions(data.alternateRegions);
        toast({ title: "ផ្ទៀងផ្ទាត់បរាជ័យ", description: errorMsg, variant: "destructive" });
      }
    } catch (error: any) {
      const errorMsg = error?.message || "មិនអាចផ្ទៀងផ្ទាត់ ID បានទេ។";
      setVerificationError(errorMsg);
      toast({ title: "ផ្ទៀងផ្ទាត់បរាជ័យ", description: errorMsg, variant: "destructive" });
    } finally { setIsVerifying(false); }
  };

  const handleRetryWithRegion = async (region: { gameName: string; apiCode: string; requiresZone: boolean }) => {
    setIsVerifying(true); setVerificationError(null); setVerifiedUser(null); setAlternateRegions(null);
    try {
      const { data, error } = await db.functions.invoke("verify-game-id", {
        body: { gameName: region.gameName, userId: userId.trim(), serverId: region.requiresZone ? serverId.trim() : undefined },
      });
      if (error) { let msg = error.message; const anyErr = error as any; if (anyErr?.context?.json) { try { const body = await anyErr.context.json(); msg = body?.error || msg; } catch {} } throw new Error(msg); }
      if (data?.success) {
        const username = data.username || data.accountName;
        setVerifiedUser({ username, id: userId, serverId: serverId || undefined, accountName: data.accountName });
        saveToCache(userId, serverId);
        toast({ title: "✓ ផ្ទៀងផ្ទាត់ដោយជោគជ័យ", description: `Username: ${username} (${region.gameName})` });
      } else {
        setVerificationError(data?.error || "មិនអាចផ្ទៀងផ្ទាត់ ID បានទេ។");
        if (data?.alternateRegions) setAlternateRegions(data.alternateRegions);
        toast({ title: "ផ្ទៀងផ្ទាត់បរាជ័យ", variant: "destructive" });
      }
    } catch (error: any) {
      setVerificationError(error?.message || "មិនអាចផ្ទៀងផ្ទាត់ ID បានទេ។");
    } finally { setIsVerifying(false); }
  };

  const handleUserIdChange = (v: string) => { setUserId(v); setVerifiedUser(null); setVerificationError(null); setAlternateRegions(null); };
  const handleServerIdChange = (v: string) => { setServerId(v); setVerifiedUser(null); setVerificationError(null); setAlternateRegions(null); };

  const renderIdInputs = () => {
    const fields = dynamicFields.fields;
    return (
      <div className="space-y-2">
        <div className={hasMultipleFields ? "flex gap-2 sm:gap-4" : ""}>
          {fields.map((field, index) => (
            <div key={field.key} className={field.width || (hasMultipleFields && index === 0 ? "flex-1" : "")}>
              <label className="text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block" style={{ color: settings.frameColor || "hsl(30 30% 35%)" }}>
                {field.label}
              </label>
              {field.key === "serverId" && zoneOptions && zoneOptions.length > 0 ? (
                <Select value={serverId} onValueChange={handleServerIdChange} disabled={isVerifying}>
                  <SelectTrigger className="bg-white/80 border-0 rounded-full h-10 sm:h-12 px-4 sm:px-5 text-sm sm:text-base text-foreground">
                    <SelectValue placeholder={field.placeholder} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {zoneOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder={field.placeholder}
                  value={field.key === "userId" ? userId : serverId}
                  onChange={(e) => field.key === "userId" ? handleUserIdChange(e.target.value) : handleServerIdChange(e.target.value)}
                  className="bg-white/80 border-0 rounded-full h-10 sm:h-12 px-4 sm:px-5 text-sm sm:text-base text-foreground placeholder:text-muted-foreground"
                  disabled={isVerifying}
                />
              )}
            </div>
          ))}
        </div>
        {dynamicFields.example && (
          <p className="text-xs text-muted-foreground pl-1" style={{ color: settings.frameColor ? `${settings.frameColor}99` : "hsl(30 30% 50%)" }}>
            {dynamicFields.example}
          </p>
        )}
      </div>
    );
  };

  const handleSubmit = () => {
    if (!userId) { toast({ title: "Please enter your Game ID", variant: "destructive" }); return; }
    if (!verifiedUser) { toast({ title: "សូមផ្ទៀងផ្ទាត់ ID របស់អ្នកជាមុនសិន", variant: "destructive" }); return; }
    if (!selectedPackage) { toast({ title: "Please select a package", variant: "destructive" }); return; }
    if (!selectedPayment) { toast({ title: "Please select a payment method", variant: "destructive" }); return; }
    if (!agreedToTerms) { toast({ title: "Please agree to the terms", variant: "destructive" }); return; }

    const pkg = preorderPackages.find((p) => p.id === selectedPackage);
    if (!pkg) return;

    const paymentMethod = paymentMethods.find((p) => p.id === selectedPayment);

    addToCart({
      id: `preorder-${pkg.id}-${userId}-${Date.now()}`,
      packageId: pkg.id,
      gameId: game.id,
      gameName: game.name,
      gameIcon: game.image || "",
      packageName: pkg.name,
      amount: pkg.amount,
      price: pkg.price,
      playerId: userId.trim(),
      serverId: serverId.trim() || undefined,
      playerName: verifiedUser.username,
      paymentMethodId: selectedPayment,
      paymentMethodName: paymentMethod?.name || "Unknown",
      g2bulkProductId: pkg.g2bulk_product_id || undefined,
      g2bulkTypeId: pkg.g2bulk_type_id || undefined,
      scheduledFulfillAt: pkg.scheduled_fulfill_at || undefined,
    });

    navigate("/checkout?preorder=true");
  };

  return (
    <>
      <Helmet>
        <title>{game ? `${game.name} Pre-order - ${settings.siteName}` : settings.siteName}</title>
        <meta name="description" content={game ? `Pre-order ${game.name} top-up. Reserve now and get delivered on schedule.` : settings.siteName} />
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

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
          </div>
        ) : !game ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-4">Game not found</h1>
              <Link to="/preorder" className="text-gold hover:underline">Go back to Pre-order</Link>
            </div>
          </div>
        ) : (
          <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-2xl">
          <Link to="/preorder" className="inline-flex items-center gap-2 text-sm sm:text-base text-muted-foreground hover:text-foreground mb-4 sm:mb-6 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>ត្រលប់ទៅ Pre-order</span>
          </Link>

          {/* Game Header with Pre-order badge */}
          <KhmerFrame variant="gold" className="mb-6 sm:mb-8">
            <div
              className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4"
              style={{
                backgroundImage: settings.topupBannerImage ? `url(${settings.topupBannerImage})` : undefined,
                backgroundSize: "cover", backgroundPosition: "center",
              }}
            >
              <img src={resolveIconUrl(game.image)} alt={game.name}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl object-cover border-2"
                style={{ borderColor: settings.topupBannerColor || "hsl(43 74% 49%)" }}
              />
              <div className="flex-1">
                <h1 className="font-display text-xl sm:text-2xl font-bold"
                  style={{ color: settings.topupBannerColor || "hsl(43 74% 49%)" }}>
                  {game.name}
                </h1>
                <Badge className="bg-gold text-background text-xs mt-1">
                  <Clock className="w-3 h-3 mr-1" /> Pre-order
                </Badge>
              </div>
            </div>
          </KhmerFrame>

          {/* Scheduled fulfillment notice */}
          {earliestFulfill && (
            <div className="mb-6 p-3 rounded-lg bg-gold/10 border border-gold/30 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gold shrink-0" />
              <span className="text-muted-foreground">
                Scheduled delivery: <span className="font-bold text-foreground">{new Date(earliestFulfill).toLocaleString()}</span>
              </span>
            </div>
          )}

          {/* Step 1: Enter ID */}
          <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-lg relative"
            style={{
              backgroundColor: settings.idSectionBgColor || "hsl(39 40% 88%)",
              backgroundImage: settings.idSectionBgImage ? `url(${settings.idSectionBgImage})` : undefined,
              backgroundSize: "cover", backgroundPosition: "center",
              color: settings.idSectionTextColor || undefined,
            }}>
            <img src="/assets/romdoul-flower.png" alt="" className="absolute -top-2 sm:-top-4 -left-2 sm:-left-4 w-16 sm:w-24 h-16 sm:h-24 object-contain pointer-events-none" style={{ transform: "scaleX(-1)" }} />
            <img src="/assets/romdoul-flower.png" alt="" className="absolute -top-2 sm:-top-4 -right-2 sm:-right-4 w-16 sm:w-24 h-16 sm:h-24 object-contain pointer-events-none" />

            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
              <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm"
                style={{ backgroundColor: settings.frameColor || "hsl(43 74% 49%)", color: "hsl(var(--primary-foreground))" }}>1</span>
              <h2 className="font-khmer text-base sm:text-xl font-bold" style={{ color: settings.frameColor || "hsl(30 30% 35%)" }}>
                សុំបញ្ចូល ID របស់អ្នក
              </h2>
            </div>

            <div className="mb-4">{renderIdInputs()}</div>

            {/* Verification Status */}
            {verifiedUser && (
              <div className="relative overflow-hidden rounded-2xl p-4 sm:p-5 mb-4 bg-gradient-to-br from-emerald-500/20 via-green-500/15 to-teal-500/20 border-2 border-emerald-400/50 shadow-lg">
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-emerald-400/20 rounded-full blur-2xl" />
                <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-teal-400/20 rounded-full blur-xl" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg">
                      <span className="text-xl sm:text-2xl">✅</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-emerald-700 dark:text-emerald-300 text-sm sm:text-base flex items-center gap-2">
                        <UserCheck className="w-4 h-4" /> ផ្ទៀងផ្ទាត់ដោយជោគជ័យ! 🎉
                      </h3>
                      <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Account verified successfully</p>
                    </div>
                  </div>
                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-3 sm:p-4 backdrop-blur-sm border border-emerald-300/30">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">👤</span>
                      <span className="font-bold text-sm sm:text-base text-foreground break-all">{verifiedUser.username}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><span>🆔</span> {verifiedUser.id}</span>
                      {verifiedUser.serverId && <span className="flex items-center gap-1"><span>🌐</span> {verifiedUser.serverId}</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {verificationError && (
              <div className="relative overflow-hidden rounded-2xl p-4 sm:p-5 mb-4 bg-gradient-to-br from-red-500/20 via-rose-500/15 to-pink-500/20 border-2 border-red-400/50 shadow-lg">
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-red-400/20 rounded-full blur-2xl" />
                <div className="relative z-10 flex items-start gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center shadow-lg flex-shrink-0">
                    <span className="text-xl sm:text-2xl">❌</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-red-700 dark:text-red-300 text-sm sm:text-base flex items-center gap-2 mb-1">
                      <XCircle className="w-4 h-4" /> ផ្ទៀងផ្ទាត់បរាជ័យ 😔
                    </h3>
                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{verificationError}</p>
                    {alternateRegions && alternateRegions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-red-300/30">
                        <p className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">🌍 សាកល្បង Region ផ្សេង:</p>
                        <div className="flex flex-wrap gap-2">
                          {alternateRegions.map((region) => (
                            <Button key={region.apiCode} size="sm" variant="outline" onClick={() => handleRetryWithRegion(region)} disabled={isVerifying}
                              className="text-xs bg-white/80 hover:bg-amber-50 border-amber-400/50 text-amber-700">
                              {isVerifying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <span className="mr-1">🔄</span>}
                              {region.gameName}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!verifiedUser && (
              <p className="text-xs sm:text-sm mt-3 sm:mt-4" style={{ color: settings.frameColor || "hsl(30 30% 35%)" }}>
                បញ្ចូល ID ហើយចុច "ផ្ទៀងផ្ទាត់" ដើម្បីពិនិត្យ
              </p>
            )}

            <div className="flex justify-center mt-4 sm:mt-6">
              <Button onClick={handleVerify} disabled={isVerifying || !userId.trim() || !!verifiedUser} variant="outline"
                className={cn("rounded-full px-6 sm:px-8 py-2 sm:py-3 h-auto flex items-center gap-2 text-sm sm:text-base font-bold transition-all",
                  verifiedUser ? "bg-green-500 text-white border-green-500 hover:bg-green-500" : "bg-white/90 hover:bg-white")}
                style={!verifiedUser ? { borderColor: settings.frameColor || "hsl(43 74% 49%)", color: settings.frameColor || "hsl(30 30% 35%)" } : undefined}>
                {isVerifying ? (<><Loader2 className="w-4 h-4 animate-spin" /><span className="font-khmer">កំពុងផ្ទៀងផ្ទាត់...</span></>) :
                  verifiedUser ? (<><CheckCircle className="w-4 h-4" /><span className="font-khmer">បានផ្ទៀងផ្ទាត់</span></>) :
                    (<span className="font-khmer">ផ្ទៀងផ្ទាត់ ID</span>)}
              </Button>
            </div>
          </div>

          {/* Step 2: Select Pre-order Package */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-base"
                style={{ backgroundColor: settings.frameColor || "hsl(43 74% 49%)", color: "hsl(var(--primary-foreground))" }}>2</span>
              <h2 className="font-khmer text-base sm:text-lg font-bold">ជ្រើសរើស Pre-order Package</h2>
            </div>

            {packagesLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 sm:h-14 rounded-lg" />)}
              </div>
            ) : displayPackages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No pre-order packages available for this game yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                {displayPackages.map((pkg, index) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    selected={selectedPackage === pkg.id}
                    onSelect={() => setSelectedPackage(pkg.id)}
                    priority={index < 6}
                    gameDefaultIcon={game.defaultPackageIcon}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Step 3: Payment Method */}
          <div className="mb-6 sm:mb-8 p-3 sm:p-4 rounded-lg"
            style={{
              backgroundColor: settings.paymentSectionBgColor || undefined,
              backgroundImage: settings.paymentSectionBgImage ? `url(${settings.paymentSectionBgImage})` : undefined,
              backgroundSize: "cover", backgroundPosition: "center",
              color: settings.paymentSectionTextColor || undefined,
            }}>
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-base"
                style={{ backgroundColor: settings.frameColor || "hsl(43 74% 49%)", color: "hsl(var(--primary-foreground))" }}>3</span>
              <h2 className="font-khmer text-base sm:text-lg font-bold">ជ្រើសរើសធនាគារបង់ប្រាក់</h2>
            </div>
            <div className="flex gap-2 sm:gap-4 flex-wrap">
              {paymentMethods.map((method) => (
                <button key={method.id} onClick={() => setSelectedPayment(method.id)}
                  className={cn("px-3 sm:px-6 py-2 sm:py-4 rounded-xl border-2 transition-all flex flex-col items-center gap-1 sm:gap-2 min-w-[70px] sm:min-w-[100px]",
                    selectedPayment === method.id ? "border-gold bg-gold/20" : "border-border bg-card hover:border-gold/50")}>
                  {method.icon.startsWith("http") ? (
                    <img src={method.icon} alt={method.name} className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover" />
                  ) : (
                    <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSwG-Zx92YNnU6BuabALnRRwBqX_5USd3AJJw&s" alt="phone" className="w-6 h-6 inline" />
                  )}
                  <span className="text-xs sm:text-sm font-medium">{method.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 4: Terms & Submit */}
          <div className="border-t border-border pt-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gold text-black flex items-center justify-center text-sm sm:text-base font-bold flex-shrink-0">4</span>
              <span className="font-khmer text-sm sm:text-base font-bold text-black">ចុច​ ✔ នៅខាងក្រោម​</span>
            </div>
            <label className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 cursor-pointer">
              <button onClick={() => setAgreedToTerms(!agreedToTerms)}
                className={cn("w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0",
                  agreedToTerms ? "bg-gold border-gold" : "border-muted-foreground")}>
                {agreedToTerms && <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-primary-foreground" />}
              </button>
              <span className="font-khmer text-sm sm:text-base">
                យកព្រមទទួល
                <Link
                  to="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-gold font-bold underline underline-offset-4 decoration-gold/50 hover:decoration-gold hover:text-amber-600 transition-colors mx-1"
                >
                  លក្ខខណ្ឌ
                </Link>
              </span>
            </label>

            <Button onClick={handleSubmit}
              disabled={isSubmitting || !agreedToTerms || !selectedPackage || !selectedPayment || !verifiedUser}
              className="w-full py-4 sm:py-6 text-base sm:text-lg font-bold bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-primary-foreground shadow-gold disabled:opacity-50">
              {isSubmitting ? (
                <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />កំពុងដំណើរការ...</span>
              ) : "Pre-order ឥឡូវ"}
            </Button>
          </div>
        </div>
      )}
      </div>
    </>
  );
};

export default PreorderTopupPage;
