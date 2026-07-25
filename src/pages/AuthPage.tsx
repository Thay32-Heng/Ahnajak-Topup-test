import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, User, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useSite } from '@/contexts/SiteContext';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import KhmerFrame from '@/components/KhmerFrame';
import Header from '@/components/Header';
import HeaderSpacer from '@/components/HeaderSpacer';

const AuthPage: React.FC = () => {
  const { settings } = useSite();
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [botAuthCode, setBotAuthCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [botAuthStatus, setBotAuthStatus] = useState<'idle' | 'loading' | 'pending' | 'confirmed' | 'expired'>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const primaryColor = settings.primaryColor || '#E53E3E';

  useEffect(() => {
    if (user) {
      const redirect = searchParams.get('redirect') || '/';
      navigate(redirect);
    }
  }, [user, navigate, searchParams]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleBotAuth = async () => {
    setIsLoading(true);
    setBotAuthStatus('loading');
    try {
      const { data } = await api.post('/auth/bot-auth/init');
      if ((data as any)?.auth_code) {
        setBotAuthCode((data as any).auth_code);
        setBotUsername((data as any).bot_username);
        setBotAuthStatus('pending');

        // Start polling
        pollRef.current = setInterval(async () => {
          try {
            const { data: statusData } = await api.get(`/auth/bot-auth/status?code=${(data as any).auth_code}`);
            const s = statusData as any;
            if (s.status === 'confirmed' && s.token) {
              setBotAuthStatus('confirmed');
              if (pollRef.current) clearInterval(pollRef.current);
              localStorage.setItem('auth_token', s.token);
              localStorage.setItem('auth_user', JSON.stringify(s.user));
              toast({ title: 'Welcome!' });
              window.location.href = '/';
            } else if (s.status === 'expired') {
              setBotAuthStatus('expired');
              if (pollRef.current) clearInterval(pollRef.current);
              toast({ title: 'Code expired', description: 'Please try again', variant: 'destructive' });
            }
          } catch {}
        }, 2000);
      }
    } catch (e: any) {
      toast({ title: 'Failed to start login', description: e.message, variant: 'destructive' });
      setBotAuthStatus('idle');
    }
    setIsLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: 'Validation Error', description: 'Email and password are required', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);
    if (error) {
      toast({
        title: 'Sign In Failed',
        description: error.message.includes('Invalid login credentials') ? 'Invalid email or password' : 'Failed to sign in',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Welcome back!' });
      navigate('/');
    }
  };

  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
  const [botConfigLoading, setBotConfigLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/bot-config').then(res => {
      if (res.data?.configured && res.data?.bot_username) {
        setTelegramBotUsername(res.data.bot_username);
      }
    }).catch(() => {}).finally(() => setBotConfigLoading(false));
  }, []);

  return (
    <>
      <Helmet>
        <title>Login - {settings.siteName}</title>
        <meta name="description" content="Sign in to access your order history" />
      </Helmet>

      <Header />
      <HeaderSpacer />

      <div
        className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-secondary/20"
        style={{ '--primary-color': primaryColor } as React.CSSProperties}
      >
        <div className="w-full max-w-md">
          <KhmerFrame className="p-0">
            <Card className="border-0 shadow-none bg-transparent">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: primaryColor }}>
                  <User className="w-8 h-8" />
                </div>
                <CardTitle className="font-display text-2xl font-black" style={{ color: primaryColor }}>{settings.siteName}</CardTitle>
                <CardDescription>Sign in to access your order history</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Email</label>
                    <Input
                      type="email"
                      placeholder="admin@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="border-zinc-200 dark:border-zinc-800 focus:border-[var(--primary-color)] rounded-xl"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="border-zinc-200 dark:border-zinc-800 focus:border-[var(--primary-color)] pr-10 rounded-xl"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full text-white font-bold rounded-xl transition-all hover:brightness-95"
                    style={{ backgroundColor: primaryColor }}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>

                {/* Bot Auth */}
                {botAuthStatus === 'idle' || botAuthStatus === 'loading' ? (
                  <Button
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-6 border-[#0088cc]/30 hover:bg-[#0088cc]/5"
                    onClick={handleBotAuth}
                    disabled={isLoading || !telegramBotUsername}
                  >
                    <MessageCircle className="w-5 h-5 text-[#0088cc]" />
                    <span>{isLoading ? 'Connecting...' : 'Login with Telegram'}</span>
                  </Button>
                ) : botAuthStatus === 'pending' && botAuthCode && botUsername ? (
                  <div className="space-y-3 p-4 bg-[#0088cc]/5 border border-[#0088cc]/20 rounded-xl">
                    <a
                      href={`https://t.me/${botUsername}?start=${botAuthCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-xl py-4 bg-[#0088cc] text-white hover:bg-[#0088cc]/90 transition-colors font-medium text-sm"
                      onClick={() => {
                        window.open(`https://t.me/${botUsername}?start=${botAuthCode}`, '_blank');
                      }}
                    >
                      <MessageCircle className="w-5 h-5" />
                      Open Telegram
                    </a>
                    <p className="text-xs text-center text-muted-foreground animate-pulse">
                      Waiting for confirmation...
                    </p>
                  </div>
                ) : botAuthStatus === 'expired' ? (
                  <div className="text-center">
                    <p className="text-xs text-destructive mb-2">Code expired</p>
                    <Button variant="outline" size="sm" onClick={() => setBotAuthStatus('idle')}>
                      Try Again
                    </Button>
                  </div>
                ) : null}

                {!telegramBotUsername && botAuthStatus === 'idle' && (
                  <p className="text-xs text-center text-muted-foreground">
                    {botConfigLoading ? 'Checking...' : 'Telegram login not configured'}
                  </p>
                )}
              </CardContent>
            </Card>
          </KhmerFrame>
        </div>
      </div>
    </>
  );
};

export default AuthPage;
