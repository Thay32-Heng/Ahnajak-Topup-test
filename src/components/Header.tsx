import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Settings, Receipt, User, Menu, LogOut, Search, X } from 'lucide-react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { resolveIconUrl } from '@/lib/icon-url';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileDrawer from '@/components/MobileDrawer';

const Header: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { settings } = useSite();
  const { user, isAdmin, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast({ title: 'Signed out successfully' });
  };

  const headerHeight = isMobile 
    ? (settings.headerHeightMobile || 56) 
    : (settings.headerHeightDesktop || 80);

  const primaryColor = settings.primaryColor || (settings.siteName === 'KESOR TOPUP' ? '#D4A84B' : '#E53E3E');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/');
    }
  };

  return (
    <header 
      className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 flex items-center bg-white/70 dark:bg-zinc-950/20 backdrop-blur-md border-b border-zinc-200/30 dark:border-zinc-800/30 transition-all duration-300"
      style={{
        height: `${headerHeight}px`,
        backgroundImage: settings.headerImage ? `url(${settings.headerImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {settings.headerImage && (
        <div className="absolute inset-0 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-md" />
      )}
      
      <div 
        className="absolute top-0 left-0 right-0 h-[3px] opacity-90 transition-all duration-300" 
        style={{
          background: `linear-gradient(90deg, transparent 15%, ${primaryColor} 50%, transparent 85%)`
        }}
      />
      
      <div className="container mx-auto flex items-center justify-between relative z-10 w-full gap-3">
        {/* Brand/Logo - Left */}
        <Link 
          to="/" 
          className="flex items-center gap-3 group transition-transform duration-200 active:scale-[0.98] shrink-0"
        >
          {settings.logoUrl ? (
            <img 
              src={resolveIconUrl(settings.logoUrl)} 
              alt={settings.siteName}
              style={{ height: `${isMobile ? 80 : 110}px` }}
              className="object-contain transition-transform duration-300 group-hover:rotate-3"
            />
          ) : (
            <span 
              className="font-display text-xl sm:text-2xl font-black tracking-tight transition-colors duration-300"
              style={{ color: primaryColor }}
            >
              {settings.siteName}
            </span>
          )}
        </Link>

        {/* Center Search Bar */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-auto">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="ស្វែងរកហ្គេម..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 h-10 bg-white dark:bg-zinc-900/60 border border-zinc-300 dark:border-zinc-700/50 rounded-full text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        {/* Right Section - User Options */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop User Panel */}
          <div className="hidden sm:flex items-center gap-2">
            {user && (
              <Link 
                to="/orders" 
                className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                title="ប្រវត្តិការបញ្ជាទិញ"
              >
                <Receipt className="w-5 h-5" />
              </Link>
            )}

            {user && isAdmin && (
              <Link 
                to="/admin" 
                className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                title="Admin Panel"
              >
                <Settings className="w-5 h-5" />
              </Link>
            )}

            {user ? (
              <>
                <Link 
                  to="/profile" 
                  className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                  title="គណនីរបស់ខ្ញុំ"
                >
                  <User className="w-5 h-5" />
                </Link>
                <button 
                  onClick={handleSignOut}
                  className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  title="ចាកចេញ"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <Link 
                to="/auth" 
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white font-bold transition-all duration-300 hover:shadow-lg active:scale-95"
                style={{ backgroundColor: primaryColor }}
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">ចូល</span>
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="sm:hidden p-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5 text-zinc-300" />
          </button>
        </div>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  );
};

export default Header;
