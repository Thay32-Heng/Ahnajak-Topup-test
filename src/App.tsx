import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { SiteProvider } from "@/contexts/SiteContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import ProtectedRoute from "./components/ProtectedRoute";
import CustomFontLoader from "./components/CustomFontLoader";
import GlobalBackground from "./components/GlobalBackground";
import ContactButton from "./components/ContactButton";
import ClickSpark from "./components/ClickSpark";
import MobileBottomNav from "./components/MobileBottomNav";
import Index from "./pages/Index";
import TopupPage from "./pages/TopupPage";
import CheckoutPage from "./pages/CheckoutPage";
import InvoicePage from "./pages/InvoicePage";
import OrderHistoryPage from "./pages/OrderHistoryPage";
import AdminPage from "./pages/AdminPage";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";
import EventsPage from "./pages/EventsPage";
import PreorderPage from "./pages/PreorderPage";
import PreorderTopupPage from "./pages/PreorderTopupPage";
import TermsPage from "./pages/TermsPage";
import ProfilePage from "./pages/ProfilePage";
import PointExchangePage from "./pages/PointExchangePage";
import GetVgPage from "./pages/GetVgPage";
const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SiteProvider>
            <CartProvider>
              <TooltipProvider>
                <CustomFontLoader />
                <GlobalBackground />
                <ClickSpark sparkColor="#E6B93F" sparkCount={10} sparkRadius={20} sparkSize={12} duration={500} />
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/topup/:gameSlug" element={<TopupPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/invoice/:orderId" element={<InvoicePage />} />
                  <Route path="/orders" element={<OrderHistoryPage />} />
                  <Route path="/events" element={<EventsPage />} />
                  <Route path="/preorder" element={<PreorderPage />} />
                  <Route path="/preorder/:gameSlug" element={<PreorderTopupPage />} />
                  <Route path="/get-vg" element={<GetVgPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<TermsPage />} />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <ProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/exchange"
                    element={
                      <ProtectedRoute>
                        <PointExchangePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute requireAdmin>
                        <AdminPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <div className="pb-24 md:pb-0" />
                <MobileBottomNav />
                <ContactButton />
              </TooltipProvider>
            </CartProvider>
          </SiteProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
