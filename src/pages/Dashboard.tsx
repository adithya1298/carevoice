import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { 
  LogOut, 
  Mic2, 
  BarChart3, 
  Globe, 
  Play, 
  Trophy,
  Clock,
  Target,
  User,
  Flame,
  Plus,
  Sparkles,
  ArrowLeft,
  Edit3,
  Save,
  X,
  Check,
  Settings,
  LayoutDashboard,
  Volume2,
  ChevronRight,
  ArrowRight,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { RecommendedSession } from '@/components/dashboard/RecommendedSession';
import { LanguageDialog } from '@/components/dashboard/LanguageDialog';
import { WeeklyChart } from '@/components/dashboard/WeeklyChart';
import { MispronounedWords } from '@/components/dashboard/MispronounedWords';
import { PerformanceBadge } from '@/components/dashboard/PerformanceBadge';
import { TodaysFocus } from '@/components/dashboard/TodaysFocus';
import { TherapyModeSelector } from '@/components/dashboard/TherapyModeSelector';
import { TherapyMode } from '@/lib/therapyModes';
import { useServerWarmer } from '@/hooks/useServerWarmer';
import { useRole } from '@/hooks/useRole';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import Footer from '@/components/landing/Footer';

const quickLanguages = ['English', 'Telugu', 'Hindi'];

interface Profile {
  full_name: string | null;
  preferred_language: string;
  therapy_sessions_completed: number;
  total_practice_minutes: number;
  goals: string[] | null;
  difficulty: string | null;
  age_group: string | null;
  current_streak: number;
  therapy_mode: TherapyMode | null;
  pro_popup_seen: boolean;
}

interface SessionStats {
  totalSessions: number;
  totalMinutes: number;
  averageAccuracy: number;
}

const Dashboard = () => {
  useServerWarmer(); // Wake up server on load
  const { user, loading, signOut } = useAuth();
  const { isPro, refreshSubscription, isLoading: subscriptionLoading } = useSubscription();
  const { isTherapist } = useRole();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [sessionDuration, setSessionDuration] = useState('');
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);
  const languageSectionRef = useRef<HTMLDivElement>(null);
  const [showProWelcome, setShowProWelcome] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    totalSessions: 0,
    totalMinutes: 0,
    averageAccuracy: 0,
  });

  // Handle Stripe redirect success
  useEffect(() => {
    const upgradeStatus = searchParams.get('upgrade');
    if (upgradeStatus === 'success') {
      toast({
        title: 'Welcome to Pro! 🎉',
        description: 'You now have unlimited sessions and all premium features.',
      });
      refreshSubscription();
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard');
    } else if (upgradeStatus === 'cancelled') {
      toast({
        title: 'Upgrade Cancelled',
        description: 'No worries! You can upgrade anytime from your dashboard.',
      });
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams, refreshSubscription]);

  useEffect(() => {
    const checkAuth = async () => {
      if (!loading && !user) {
        navigate('/auth');
      } else if (!loading && user) {
        // Check if user has completed onboarding
        const { data } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!data?.onboarding_completed) {
          navigate('/onboarding');
        }
      }
    };

    checkAuth();
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchProfileAndStats = async () => {
      if (user) {
        // Fetch profile including pro_popup_seen
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, preferred_language, therapy_sessions_completed, total_practice_minutes, goals, difficulty, age_group, current_streak, therapy_mode, pro_popup_seen')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (profileData && !profileError) {
          setProfile({
            ...profileData,
            current_streak: profileData.current_streak || 0,
            therapy_mode: (profileData.therapy_mode as TherapyMode) || 'pronunciation',
            pro_popup_seen: profileData.pro_popup_seen ?? false,
          });
          setSelectedLanguage(profileData.preferred_language || 'English');
        }

        // Fetch session stats from sessions table for accurate data
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('sessions')
          .select('duration_minutes, accuracy_score, exercises_completed')
          .eq('user_id', user.id);

        if (sessionsData && !sessionsError) {
          const totalSessions = sessionsData.length;
          const totalMinutes = sessionsData.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
          
          // Only count sessions with exercises completed for accuracy
          const sessionsWithExercises = sessionsData.filter(s => (s.exercises_completed || 0) > 0);
          const avgAccuracy = sessionsWithExercises.length > 0
            ? sessionsWithExercises.reduce((sum, s) => sum + (Number(s.accuracy_score) || 0), 0) / sessionsWithExercises.length
            : 0;

          setSessionStats({
            totalSessions: profileData?.therapy_sessions_completed || totalSessions,
            totalMinutes: profileData?.total_practice_minutes || totalMinutes,
            averageAccuracy: Math.round(avgAccuracy),
          });
        }
      }
    };

    if (user) {
      fetchProfileAndStats();
    }
  }, [user]);

  // Pro welcome popup logic - check after subscription and profile load
  useEffect(() => {
    const checkAndShowProPopup = async () => {
      if (!user || subscriptionLoading || !profile) return;
      
      // Only show if user is Pro and hasn't seen the popup
      if (isPro && !profile.pro_popup_seen) {
        setShowProWelcome(true);
        
        // Mark as seen in Supabase immediately
        await supabase
          .from('profiles')
          .update({ pro_popup_seen: true })
          .eq('user_id', user.id);
        
        // Update local state
        setProfile(prev => prev ? { ...prev, pro_popup_seen: true } : null);
      }
    };

    checkAndShowProPopup();
  }, [user, isPro, subscriptionLoading, profile?.pro_popup_seen]);

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: 'Signed Out',
      description: 'You have been successfully logged out.',
    });
    navigate('/');
  };

  const handleStartSession = () => {
    const minutes = parseInt(sessionDuration, 10);
    if (!minutes || minutes < 1 || minutes > 120) {
      toast({
        title: 'Invalid Duration',
        description: 'Please enter a duration between 1 and 120 minutes.',
        variant: 'destructive',
      });
      return;
    }

    navigate(`/therapy-session?duration=${minutes}`);
  };

  const formatPracticeTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hrs`;
  };

  const quickLanguages = ['English', 'Telugu', 'Hindi'];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold">CV</span>
            </div>
            <span className="text-xl font-bold text-foreground">CareVoice</span>
          </div>
          
          <div className="flex items-center gap-3">
             <Button variant="ghost" onClick={() => navigate('/profile')} className="text-muted-foreground hover:text-foreground">
               <User className="w-4 h-4 mr-2" />
               Profile
             </Button>
             <Button variant="ghost" onClick={handleSignOut} className="text-muted-foreground hover:text-foreground">
               <LogOut className="w-4 h-4 mr-2" />
               Sign Out
             </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 flex-grow">
        
        {/* Welcome Section */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Welcome back, {firstName}! 👋
            </h1>
            <p className="text-muted-foreground">
              Ready to continue your speech therapy journey?
            </p>
          </div>
          <PerformanceBadge averageScore={sessionStats.averageAccuracy} />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card border-border shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {sessionStats.totalSessions}
                </p>
                <p className="text-xs text-muted-foreground">Sessions</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {formatPracticeTime(sessionStats.totalMinutes)}
                </p>
                <p className="text-xs text-muted-foreground">Practice Time</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center">
                <Target className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {sessionStats.averageAccuracy > 0 ? `${sessionStats.averageAccuracy}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">Accuracy</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20 shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Flame className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {profile?.current_streak || 0}
                </p>
                <p className="text-xs text-muted-foreground">Day Streak</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <TodaysFocus userId={user.id} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <WeeklyChart userId={user.id} />
          <MispronounedWords userId={user.id} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <TherapyModeSelector 
            userId={user.id} 
            currentMode={profile?.therapy_mode || 'pronunciation'}
            onModeChange={(mode) => setProfile(prev => prev ? { ...prev, therapy_mode: mode } : null)}
          />
          <RecommendedSession 
            profile={profile ? { goals: profile.goals, difficulty: profile.difficulty, age_group: profile.age_group } : null}
            stats={sessionStats}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <Card className="bg-card border-border shadow-card" ref={languageSectionRef}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Globe className="w-5 h-5 text-primary" />
                Select Language
              </CardTitle>
              <CardDescription>Choose your therapy language</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {quickLanguages.map((lang) => (
                  <Button
                    key={lang}
                    variant={selectedLanguage === lang ? 'default' : 'outline'}
                    className={`rounded-xl transition-all ${
                      selectedLanguage === lang 
                        ? 'shadow-button' 
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedLanguage(lang)}
                  >
                    {lang}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Mic2 className="w-5 h-5 text-primary" />
                Start Therapy Session
              </CardTitle>
              <CardDescription>Choose your session duration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Session Duration
                </label>
                <Input
                  type="number"
                  placeholder="Enter minutes e.g. 7, 12, 25"
                  value={sessionDuration}
                  onChange={(e) => setSessionDuration(e.target.value)}
                  min={1}
                  max={120}
                  className="text-lg"
                />
              </div>
              <Button 
                size="lg" 
                className="w-full rounded-pill shadow-button hover:shadow-card-hover transition-all"
                onClick={handleStartSession}
                disabled={!sessionDuration}
              >
                <Play className="w-5 h-5 mr-2" />
                Start Session
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick Access Section */}
        <div className="mt-12 pt-8 border-t border-border">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            Explore More
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card 
              className="bg-card hover:shadow-card-hover transition-all cursor-pointer group"
              onClick={() => navigate('/progress')}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <BarChart3 className="w-6 h-6 text-primary" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">Your Progress</h3>
                <p className="text-sm text-muted-foreground">Detailed analytics and session history</p>
              </CardContent>
            </Card>

            <Card 
              className="bg-card hover:shadow-card-hover transition-all cursor-pointer group"
              onClick={() => navigate('/achievements')}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Trophy className="w-6 h-6 text-yellow-500" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-yellow-500 transition-colors" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">Achievements</h3>
                <p className="text-sm text-muted-foreground">Badges and milestones you've unlocked</p>
              </CardContent>
            </Card>

            {isTherapist && (
              <Card 
                className="bg-card hover:shadow-card-hover transition-all cursor-pointer group"
                onClick={() => navigate('/therapist')}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <ShieldCheck className="w-6 h-6 text-purple-500" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-purple-500 transition-colors" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-1">Therapist Portal</h3>
                  <p className="text-sm text-muted-foreground">Manage patients and therapy plans</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />

      {/* Language Dialog */}
      {user && (
        <LanguageDialog
          open={languageDialogOpen}
          onOpenChange={setLanguageDialogOpen}
          selectedLanguage={selectedLanguage}
          onLanguageChange={setSelectedLanguage}
          userId={user.id}
        />
      )}

      {/* Pro Welcome Modal */}
      <Dialog open={showProWelcome} onOpenChange={setShowProWelcome}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="w-6 h-6 text-primary" />
              Welcome to Pro! 🎉
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              You now have access to all premium features:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-primary" />
              </div>
              <span className="text-foreground">Unlimited therapy sessions</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <span className="text-foreground">Advanced analytics & reports</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <span className="text-foreground">Priority AI feedback</span>
            </div>
          </div>
          <Button 
            onClick={() => setShowProWelcome(false)} 
            className="w-full rounded-pill"
          >
            Get Started
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
