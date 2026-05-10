import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, logout } from './lib/firebase';
import Dashboard from './components/Dashboard';
import { OracleLogo } from './components/OracleLogo';
import { LogIn, Globe, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#E4E3E0]">
        <div className="font-mono text-xs animate-pulse">SYSTEM_INITIALIZING...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen selection:bg-yellow-500/30 selection:text-yellow-200 bg-zinc-950 text-zinc-200">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div 
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-black"
          >
            <div className="max-w-md w-full glass-panel p-10 space-y-8 relative overflow-hidden premium-border">
              <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500"></div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <OracleLogo className="w-8 h-8" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Alpha_Node / v2.4</span>
                </div>
                <h1 className="text-5xl font-bold tracking-tight text-white uppercase">
                  AEVX <br/><span className="text-yellow-500">Oracle</span>
                </h1>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Enterprise-grade multi-agent synthesis engine for geopolitical risk and market correlation analysis.
                </p>
              </div>

              <div className="space-y-6">
                <button
                  onClick={loginWithGoogle}
                  className="w-full h-14 bg-yellow-600 text-black rounded-xl flex items-center justify-center gap-3 hover:bg-yellow-500 transition-all font-bold uppercase text-xs tracking-[0.15em] shadow-[0_0_20px_rgba(234,179,8,0.2)] active:scale-[0.98]"
                >
                  <LogIn className="w-4 h-4" />
                  Initialize Auth Session
                </button>
                <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-500 font-mono uppercase tracking-tighter">
                  <Shield className="w-3 h-3 text-yellow-500/50" />
                  Encrypted Google Cloud Gateway
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="app"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col min-h-screen"
          >
            <Dashboard user={user} onLogout={logout} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
