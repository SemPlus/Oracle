import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot, addDoc, deleteDoc, getDocs, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PulseData, runPulseOrchestration, AgentStatus, deletePulse } from '../services/agentOrchestrator';
import { LogOut, RefreshCcw, TrendingUp, AlertTriangle, Target, Activity, Calendar, Zap, Globe, Search, Trash2, X, Terminal, Radio, Database, PanelLeftClose, PanelLeftOpen, Cpu, Layers, Fingerprint, Bookmark, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Toaster, toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup, Tooltip as MapTooltip, useMap, Circle, Polygon } from 'react-leaflet';
import L from 'leaflet';

// Fix for Leaflet hidden container issue
function MapResizer({ selectedPulse }: { selectedPulse: any }) {
  const map = useMap();
  const lastIdRef = React.useRef<string | null>(null);
  
  useEffect(() => {
    if (!map || !selectedPulse) return;

    // Handle initial size and layout shifts
    map.invalidateSize();
    
    // Resize observers handle standard container changes
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    
    // Auto-focus on hotspots only when a NEW pulse is selected
    if (selectedPulse.id !== lastIdRef.current && selectedPulse.hotspots && selectedPulse.hotspots.length > 0) {
      const validHotspots = selectedPulse.hotspots.filter((h: any) => 
        h.lat !== undefined && h.lng !== undefined && h.lat !== null && h.lng !== null
      );
      if (validHotspots.length > 0) {
        // Find the "center" or most significant hotspot
        const centerHotspot = validHotspots[0];
        map.panTo([centerHotspot.lat, centerHotspot.lng]);
        lastIdRef.current = selectedPulse.id;
      }
    }
    
    // Aggressive polling to handle late-mounting parent transitions
    const interval = setInterval(() => map.invalidateSize(), 500);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      map.invalidateSize();
    }, 4000);
    
    return () => {
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [map, selectedPulse]);

  return null;
}

// Custom Marker Creators
const createMarkerIcon = (impact: string) => {
  const color = impact === 'High' ? '#ef4444' : impact === 'Med' ? '#f59e0b' : '#10b981';
  const size = impact === 'High' ? 20 : impact === 'Med' ? 16 : 12;
  const isHigh = impact === 'High';
  
  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="relative flex items-center justify-center" style="width: ${size}px; height: ${size}px;">
        ${isHigh ? `<div class="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-40"></div>` : ''}
        <div class="absolute inset-0 rounded-full border-2 border-white shadow-lg" style="background-color: ${color};"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    tooltipAnchor: [size / 2 + 5, 0]
  });
};

const GEOGRAPHIC_ZONE_OFFSETS: Record<string, [number, number][]> = {
  "Suez Canal Transit Delay": [
    [2.8, -0.4], [2.8, 0.4], [0, 0.6], [-2.8, 0.4], [-2.8, -0.4], [0, -0.6]
  ],
  "Red Sea Naval Tensions": [
    [12.0, -1.8], [9.5, 1.2], [4.5, 3.8], [1.2, 5.0], [-4.5, 3.5], [-9.5, 1.8], [-13.0, -0.5], [-11.0, -2.5], [-6.5, -4.0], [-1.5, -4.5], [4.0, -4.8], [9.0, -3.5]
  ],
  "South China Sea Naval Drills": [
    [16, -14], [18, 5], [12, 18], [1, 21], [-11, 18], [-17, 7], [-18, -10], [-10, -18], [-2, -20], [8, -18]
  ],
  "Taiwan Strait Maneuvers": [
    [3.5, -2.2], [4.5, 1.2], [-2.5, 2.2], [-5.5, -1.2]
  ],
  "Strait of Hormuz Blockade Risk": [
    [2.2, -3.5], [3.2, 0.5], [1.6, 3.5], [-2.2, 2.2], [-3.0, -1.2]
  ],
  "European Power Grid Stability": [
    [12, -15], [12, 18], [0, 22], [-10, 18], [-15, 0], [-12, -15], [-5, -20]
  ],
  "Silicon Valley Compute Shortage": [
    [2.5, -3.0], [2.5, 2.5], [-2.5, 2.5], [-2.5, -3.0]
  ],
  "Black Sea Grain Corridor": [
    [5.5, -8], [6.5, 3], [3.5, 12], [-3.5, 10], [-6.5, -2], [-3, -9]
  ],
  "Pilbara Mining Expansion": [
    [8, -8], [8, 8], [-8, 8], [-8, -8]
  ],
  "Brazil Agricultural Pulse": [
    [15, -14], [12, 14], [-12, 12], [-18, -10], [-10, -18]
  ],
  "Arctic Northern Sea Route": [
    [5.5, -35], [5.5, 35], [-5.5, 35], [-5.5, -35]
  ],
  "Nordic Data Center Expansion": [
    [8, -6], [8, 6], [-8, 6], [-8, -6]
  ],
  "Horn of Africa Shipping Risk": [
    [8, -6], [10, 4], [4, 12], [-4, 10], [-8, -2]
  ]
};

const getZoneStyle = (event: string, impact: string) => {
  const isHigh = impact === 'High';
  const isMed = impact === 'Med';
  const lowerEvent = event.toLowerCase();
  
  let color = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#3b82f6';
  
  if (lowerEvent.includes('south china sea')) {
    color = isHigh ? '#22d3ee' : isMed ? '#0891b2' : '#0ea5e9';
  } else if (lowerEvent.includes('red sea') || lowerEvent.includes('suez')) {
    color = isHigh ? '#ef4444' : isMed ? '#f97316' : '#fbbf24';
  } else if (lowerEvent.includes('canal') || lowerEvent.includes('sea') || lowerEvent.includes('strait') || lowerEvent.includes('naval') || lowerEvent.includes('shipping')) {
    color = isHigh ? '#dc2626' : isMed ? '#0891b2' : '#0ea5e9';
  } else if (lowerEvent.includes('power') || lowerEvent.includes('energy') || lowerEvent.includes('grid')) {
    color = '#eab308';
  } else if (lowerEvent.includes('silicon') || lowerEvent.includes('compute') || lowerEvent.includes('tech') || lowerEvent.includes('data')) {
    color = '#8b5cf6';
  } else if (lowerEvent.includes('grain') || lowerEvent.includes('agri')) {
    color = '#84cc16';
  } else if (lowerEvent.includes('mining') || lowerEvent.includes('oil') || lowerEvent.includes('gas') || lowerEvent.includes('resource')) {
    color = '#f97316';
  }

  return {
    fillColor: color,
    fillOpacity: isHigh ? 0.22 : isMed ? 0.15 : 0.1,
    color: color,
    weight: isHigh ? 1.5 : 1,
    dashArray: isHigh ? '3, 4' : '6, 6'
  };
};

const getZonePolygon = (event: string, lat: number, lng: number, impact: string): [number, number][] => {
  const baseOffsets = GEOGRAPHIC_ZONE_OFFSETS[event];
  if (baseOffsets) {
    return baseOffsets.map(([latOff, lngOff]) => [lat + latOff, lng + lngOff]);
  }
  
  // Generate a slightly randomized polygon for unknown events based on impact
  const scale = impact === 'High' ? 5 : impact === 'Med' ? 3.5 : 2;
  return [
    [lat + scale, lng],
    [lat + scale * 0.4, lng + scale * 0.9],
    [lat - scale * 0.6, lng + scale * 0.7],
    [lat - scale, lng - scale * 0.2],
    [lat - scale * 0.5, lng - scale * 0.9],
    [lat + scale * 0.6, lng - scale * 0.6],
  ];
};

export default function Dashboard({ user, onLogout }: { user: User, onLogout: () => void }) {
  const MOCK_NOW = new Date('2026-02-28T14:10:00Z');
  const [pulses, setPulses] = useState<PulseData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statuses, setStatuses] = useState<AgentStatus[]>([]);
  const [selectedPulse, setSelectedPulse] = useState<PulseData | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<any | null>(null);
  const [selectedAssetClass, setSelectedAssetClass] = useState<string>('');
  const [lastAlertedPulseDate, setLastAlertedPulseDate] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [selectedDate, setSelectedDate] = useState(MOCK_NOW.toISOString().split('T')[0]);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [savedAssets, setSavedAssets] = useState<string[]>([]);

  // Fetch saved assets
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'saved_assets'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const assets = snapshot.docs.map(doc => doc.data().assetName);
      setSavedAssets(assets);
    }, (error) => {
      console.error('Watchlist Error:', error);
    });
    return () => unsubscribe();
  }, [user]);

  const toggleSaveAsset = async (assetName: string) => {
    if (!user) return;
    const isSaved = savedAssets.includes(assetName);
    const watchlistRef = collection(db, 'users', user.uid, 'saved_assets');
    
    try {
      if (isSaved) {
        const q = query(watchlistRef, where('assetName', '==', assetName));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        toast.success(`Removed ${assetName} from watchlist`);
      } else {
        await addDoc(watchlistRef, {
          assetName,
          savedAt: serverTimestamp(),
          userId: user.uid
        });
        toast.success(`Priority tracking active for ${assetName}`);
      }
    } catch (e: any) {
      console.error('Watchlist Toggle Error:', e);
      toast.error('Watchlist Update Failed', { description: e.message });
    }
  };

  // Get unique asset classes
  const assetClasses = Array.from(new Set(pulses.flatMap(p => p.marketCorrelations.map(m => m.assetClass))));

  const handleGenerate = useCallback(async (force: boolean = false, targetDate?: Date) => {
    let finalTargetDate = targetDate;

    // Handle sequential generation logic for demo
    if (!finalTargetDate) {
      if (pulses.length === 0) {
        finalTargetDate = new Date('2026-02-14T10:00:00Z');
      } else if (pulses.length === 1) {
        finalTargetDate = new Date('2026-02-21T12:00:00Z');
      } else if (pulses.length === 2) {
        finalTargetDate = new Date('2026-02-28T18:00:00Z');
      }
    }

    if (pulses.length >= 3 && !targetDate) {
      toast.info('Demo Limit Reached', {
        description: 'The prototype archive is restricted to 3 intelligence nodes. Upgrade to full system for unlimited synthesis.',
        duration: 5000
      });
      return;
    }

    setIsGenerating(true);
    setStatuses([]);
    try {
      const pulsePromise = runPulseOrchestration((status) => {
        setStatuses(prev => {
          const filtered = prev.filter(s => s.agent !== status.agent);
          return [...filtered, status];
        });
      }, force, finalTargetDate, user.uid);

      toast.promise(pulsePromise, {
        loading: finalTargetDate 
          ? `Neural Reconstruction for ${format(finalTargetDate, 'MMM dd, yyyy')}...` 
          : (force ? '[MOCK_PROTO] Forced Re-Synthesis...' : '[MOCK_PROTO] Recovering Archive Nodes...'),
        success: 'Synthesis Complete: Historical State Restored',
        error: (err) => `Failed: ${err.message || 'System Error'}`,
      });

      const result = await pulsePromise;
      if (result) {
        setSelectedPulse(result);
        // Show progression notification
        if (pulses.length === 2 && !targetDate) {
          toast.success('Simulation Capacity Reached', {
            description: 'The 3-node archival limit has been reached. System is now stabilized.',
            duration: 8000
          });
        }
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Scan Failed', {
        description: e.message || 'The data pipeline encountered a critical error.'
      });
    } finally {
      setIsGenerating(false);
    }
  }, [pulses.length, user?.uid, runPulseOrchestration]);

  useEffect(() => {
    if (assetClasses.length > 0 && !selectedAssetClass) {
      setSelectedAssetClass(assetClasses[0]);
    }
  }, [assetClasses, selectedAssetClass]);

  useEffect(() => {
    const q = query(collection(db, 'pulses'), orderBy('createdAt', 'desc'), limit(30));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        return {
          ...docData,
          id: doc.id,
          // Ensure date is always a string to prevent formatting crashes
          date: docData.date || new Date().toISOString()
        } as PulseData & { id: string };
      });
      
      console.log('📝 Archive updated:', data.length, 'reports found.');
      setPulses(data);
      
      if (data.length > 0) {
        if (!selectedPulse || isSeeding) {
          console.log('🎯 Auto-selecting latest record');
          setSelectedPulse(data[0]);
          if (isSeeding) setIsSeeding(false);
        } else {
          const updated = data.find(p => p.id === selectedPulse.id);
          if (updated) setSelectedPulse(updated);
        }
      } else if (!isSeeding && user?.uid && pulses.length === 0) {
        // Only seed the FIRST report on initial boot to allow progression
        console.log('🌱 Archive empty. Initiating first mock pulse...');
        setIsSeeding(true);
        handleGenerate(false, new Date('2026-02-14T10:00:00Z'));
      }
      
      // Alerts logic - safely handle date
      if (data.length > 0) {
        const latestPulse = data[0];
        const pulseDateStr = latestPulse.date ? latestPulse.date.split('T')[0] : '';
        
        if (pulseDateStr && pulseDateStr !== lastAlertedPulseDate) {
          const highImpactHotspots = latestPulse.hotspots?.filter(h => h.impact === 'High') || [];
          const isLowConfidence = latestPulse.confidenceScore < 5;

          if (highImpactHotspots.length > 0) {
            toast.error(`CRITICAL RISK DETECTED`, {
              description: `${highImpactHotspots.length} High-impact geopolitical hotspot(s) identified.`,
              duration: 10000,
            });
          }

          if (isLowConfidence) {
            toast.warning(`LOW CONFIDENCE ALERT`, {
              description: `Model confidence has dropped to ${latestPulse.confidenceScore}/10. Analysis may be unstable.`,
              duration: 8000,
            });
          }

          setLastAlertedPulseDate(pulseDateStr);
        }
      }
    }, (error) => {
      console.error('❌ onSnapshot error:', error);
      toast.error('Archive Sync Failed', {
        description: 'Check console for security rule violations or connectivity issues.'
      });
    });
    return () => unsubscribe();
  }, [lastAlertedPulseDate, selectedPulse, isSeeding, user?.uid, handleGenerate]);

  useEffect(() => {
    let interval: any;
    if (isPlaybackActive && pulses.length > 0) {
      interval = setInterval(() => {
        setSelectedPulse(prev => {
          if (!prev) return pulses[0];
          const currentIndex = pulses.findIndex(p => p.id === prev.id);
          const nextIndex = (currentIndex + 1) % pulses.length;
          return pulses[nextIndex];
        });
      }, 3000); // Pulse every 3 seconds
    }
    return () => clearInterval(interval);
  }, [isPlaybackActive, pulses]);

  const handleDeletePulse = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!id) {
      toast.error('Invalid Report ID');
      return;
    }
    
    // Using a more reliable interactive confirmation for the environment
    toast('Confirm Deletion', {
      description: 'Are you sure you want to delete this intelligence report? This action is irreversible.',
      action: {
        label: 'Delete',
        onClick: async () => {
          try {
            await deletePulse(id);
            toast.success('Report deleted successfully');
            if (selectedPulse?.id === id) {
              const nextPulse = pulses.find(p => p.id !== id);
              setSelectedPulse(nextPulse || null);
            }
          } catch (err: any) {
            console.error('Delete failed:', err);
            let errorMessage = 'Check permissions';
            try {
              if (err.message && err.message.startsWith('{')) {
                const parsed = JSON.parse(err.message);
                errorMessage = parsed.error || errorMessage;
              } else {
                errorMessage = err.message || errorMessage;
              }
            } catch (pErr) {
              errorMessage = err.message || errorMessage;
            }
            toast.error(`Deletion Failed: ${errorMessage}`);
          }
        },
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const lastUpdated = selectedPulse?.date ? new Date(selectedPulse.date) : null;

  const trendDataRaw = [...pulses].reverse().map((p, i) => ({
    x: i,
    y: p.confidenceScore,
    date: format(new Date(p.date), 'MM/dd')
  }));

  const trendlineScores = (function calculateTrendline(data: { x: number, y: number }[]) {
    const n = data.length;
    if (n < 2) return data.map(d => d.y);
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += data[i].x;
      sumY += data[i].y;
      sumXY += data[i].x * data[i].y;
      sumXX += data[i].x * data[i].x;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return data.map(d => slope * d.x + intercept);
  })(trendDataRaw);

  const trendData = trendDataRaw.map((d, i) => ({
    date: d.date,
    score: d.y,
    trend: trendlineScores[i]
  }));

  const correlationTrendDataRaw = [...pulses].reverse().map((p, i) => {
    const correlation = p.marketCorrelations.find(m => m.assetClass === selectedAssetClass);
    let value = 0;
    if (correlation) {
      if (correlation.trend === 'Increasing') value = 1;
      if (correlation.trend === 'Decreasing') value = -1;
    }
    return {
      x: i,
      y: value,
      date: format(new Date(p.date), 'MM/dd')
    };
  });

  const correlationTrendlineValues = (function calculateTrendline(data: { x: number, y: number }[]) {
    const n = data.length;
    if (n < 2) return data.map(d => d.y);
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += data[i].x;
      sumY += data[i].y;
      sumXY += data[i].x * data[i].y;
      sumXX += data[i].x * data[i].x;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return data.map(d => slope * d.x + intercept);
  })(correlationTrendDataRaw);

  const correlationTrendData = correlationTrendDataRaw.map((d, i) => ({
    date: d.date,
    value: d.y,
    trend: correlationTrendlineValues[i]
  }));

  const marketBiasData = [...pulses].reverse().map((p) => {
    const increasing = p.marketCorrelations?.filter(m => m.trend === 'Increasing').length || 0;
    const decreasing = p.marketCorrelations?.filter(m => m.trend === 'Decreasing').length || 0;
    return {
      date: format(new Date(p.date), 'MM/dd'),
      bias: increasing - decreasing,
      bullish: increasing,
      bearish: decreasing
    };
  });

  // Mock Market Prices for the "Telemetry" view
  const getMockMarketData = (pulse: PulseData | null) => {
    if (!pulse) return [];
    const seed = pulse.date.split('T')[0];
    const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    const assets = [
      { name: 'SPX', base: 4800, volatility: 50 },
      { name: 'NDX', base: 17000, volatility: 200 },
      { name: 'XBT', base: 64000, volatility: 2000 },
      { name: 'XAU', base: 2100, volatility: 30 },
      { name: 'CL1', base: 78, volatility: 5 }
    ];

    return assets.map(asset => {
      const data = [];
      // Use the pulse date to create a distinct historical seed
      const historicalSeed = hash + (new Date(pulse.date).getTime() / 100000000);
      let current = asset.base + (hash % 100) - 50;
      
      // Limit data points to 15 to feel like a concise historical snapshot
      for (let i = 0; i < 15; i++) {
        const noise = (Math.sin(i + historicalSeed) * asset.volatility);
        data.push({ 
          time: i, 
          price: current + noise,
          // Add a formatted date for the tooltip to show it's historical
          displayDate: format(new Date(new Date(pulse.date).getTime() - (15 - i) * 86400000), 'MMM dd')
        });
        current += (noise * 0.05); 
      }
      const trend = data[data.length - 1].price > data[0].price ? 'up' : 'down';
      const pctChange = ((data[data.length - 1].price - data[0].price) / data[0].price * 100).toFixed(2);
      return { ...asset, data, trend, pctChange, current: data[data.length - 1].price.toFixed(asset.base > 1000 ? 0 : 2) };
    });
  };

  const marketTelemetry = getMockMarketData(selectedPulse);

  return (
    <div className="flex-1 flex flex-col min-h-screen md:h-screen md:overflow-hidden bg-[#050505] selection:bg-yellow-500/30">
      <Toaster theme="dark" position="top-right" expand={true} richColors />
      
      {/* Intelligence Synthesis Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md overflow-hidden"
          >
            {/* Background Animations */}
            <div className="absolute inset-0 z-0">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-yellow-500/10 rounded-full animate-spin-slow" />
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-yellow-500/20 rounded-full animate-reverse-spin-slow" />
               
               {/* Floating Data Particles */}
               {[...Array(20)].map((_, i) => (
                 <motion.div 
                   key={i}
                   className="absolute w-1 h-1 bg-yellow-500/40 rounded-full"
                   animate={{ 
                     x: [Math.random() * window.innerWidth, Math.random() * window.innerWidth],
                     y: [Math.random() * window.innerHeight, Math.random() * window.innerHeight],
                     opacity: [0, 1, 0]
                   }}
                   transition={{ duration: Math.random() * 5 + 2, repeat: Infinity }}
                 />
               ))}
            </div>

            <div className="relative z-10 w-full max-w-2xl px-8 flex flex-col items-center">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-12 relative"
              >
                <div className="w-32 h-32 rounded-3xl bg-yellow-500 flex items-center justify-center shadow-[0_0_50px_rgba(234,179,8,0.4)] animate-pulse">
                  <Cpu className="w-16 h-16 text-black" />
                </div>
                {/* Orbital Status */}
                <div className="absolute -inset-12 border-2 border-dashed border-yellow-500/20 rounded-full animate-spin-slow" />
              </motion.div>

              <div className="text-center space-y-6 w-full">
                <div>
                  <h2 className="text-4xl font-black text-white uppercase tracking-[0.2em] mb-2 italic">Neural_Synthesis</h2>
                  <div className="flex items-center justify-center gap-4">
                    <div className="h-px w-12 bg-yellow-500/30" />
                    <span className="text-xs font-mono text-yellow-500 uppercase tracking-widest bg-yellow-500/10 px-3 py-1 rounded">System_Status: ORCHESTRATING</span>
                    <div className="h-px w-12 bg-yellow-500/30" />
                  </div>
                </div>

                {/* Progress Indicators */}
                <div className="grid grid-cols-3 gap-6 w-full">
                  {['Scout', 'Synthesizer', 'Oracle'].map((agent, i) => {
                    const status = statuses.find(s => s.agent === agent);
                    const isProcessing = status?.status === 'processing';
                    const isComplete = statuses.some(s => s.agent === agent && s.status === 'complete');
                    const index = i + 1;

                    return (
                      <div key={agent} className="space-y-3">
                        <div className="flex flex-col items-center gap-2">
                           <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 border ${
                             isProcessing ? 'bg-yellow-500 text-black border-yellow-500' : 
                             isComplete ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-500' : 
                             'bg-zinc-900/50 border-zinc-800 text-zinc-600'
                           }`}>
                             {isComplete ? <Zap className="w-5 h-5" /> : <span className="font-black italic">{index}</span>}
                           </div>
                           <span className={`text-[10px] font-bold uppercase tracking-widest ${isProcessing ? 'text-yellow-500' : isComplete ? 'text-emerald-500' : 'text-zinc-600'}`}>{agent}</span>
                        </div>
                        {isProcessing && (
                          <motion.div 
                            className="h-1 bg-yellow-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: '100%' }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        )}
                        {isComplete && <div className="h-1 bg-emerald-500 rounded-full" />}
                      </div>
                    );
                  })}
                </div>

                {/* Status Message */}
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={statuses[statuses.length - 1]?.message}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl min-h-[100px] flex items-center justify-center"
                  >
                    <p className="text-xl font-mono text-zinc-300 italic">
                      {statuses[statuses.length - 1]?.message || "Initializing neural pathways..."}
                    </p>
                  </motion.div>
                </AnimatePresence>

                <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-zinc-600">
                  <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> NODE_STABLE</span>
                  <span className="flex items-center gap-1.5"><Layers className="w-3 h-3" /> DEPTH_SCAN_0{pulses.length + 1}</span>
                  <span className="flex items-center gap-1.5"><Fingerprint className="w-3 h-3" /> RSA_ENCRYPTED</span>
                </div>
              </div>
            </div>

            {/* Scanning Overlay */}
            <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-yellow-500/5 to-transparent animate-scan" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Asset Detail Overlay */}
      <AnimatePresence>
        {selectedAsset && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12 overflow-hidden"
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
              onClick={() => setSelectedAsset(null)}
            />
            
            <motion.div 
              layoutId={`asset-${selectedAsset.name}`}
              className="relative w-full max-w-6xl h-full max-h-[800px] bg-[#080808] border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-yellow-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-wider italic flex items-baseline gap-2">
                      {selectedAsset.name} 
                      <span className="text-xs font-mono text-zinc-600 uppercase">/ Tactical_Analysis</span>
                    </h2>
                    <div className="flex items-center gap-3">
                       <span className="text-sm font-mono text-zinc-400">{selectedAsset.current}</span>
                       <span className={`text-xs font-mono ${selectedAsset.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
                         {selectedAsset.trend === 'up' ? '▲' : '▼'} {selectedAsset.pctChange}%
                       </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => toggleSaveAsset(selectedAsset.name)}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all border ${
                      savedAssets.includes(selectedAsset.name) 
                        ? 'bg-yellow-500 border-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.3)]' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    {savedAssets.includes(selectedAsset.name) ? <BookmarkCheck className="w-5 h-5" /> : <BookmarkPlus className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={() => setSelectedAsset(null)}
                    className="w-12 h-12 rounded-xl hover:bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white transition-all border border-transparent hover:border-zinc-800"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 bg-black p-1 relative">
                {/* TradingView Widget Integration */}
                <iframe 
                  src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_762ae&symbol=${
                    selectedAsset.name === 'SPX' ? 'SPX' :
                    selectedAsset.name === 'NDX' ? 'NASDAQ:NDX' :
                    selectedAsset.name === 'XBT' ? 'BINANCE:BTCUSDT' :
                    selectedAsset.name === 'XAU' ? 'TVC:GOLD' :
                    selectedAsset.name === 'CL1' ? 'TVC:UKOIL' :
                    selectedAsset.name
                  }&interval=D&hidesidetoolbar=1&hidetoptoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=ais-oracle&utm_medium=widget&utm_campaign=chart&utm_term=${selectedAsset.name}`}
                  className="w-full h-full border-0"
                  title={`${selectedAsset.name} Terminal Chart`}
                />
                
                {/* Tactical HUD Overlays for the iframe */}
                <div className="absolute top-4 right-4 pointer-events-none space-y-2">
                   <div className="px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-md backdrop-blur-md">
                      <div className="text-[10px] font-mono text-yellow-500 uppercase tracking-widest font-black">
                        {isPlaybackActive || (selectedPulse && new Date(selectedPulse.date).getTime() < MOCK_NOW.getTime() - 86400000) 
                          ? `DATA_SNAPSHOT: ${format(new Date(selectedPulse!.date), 'yyyy-MM-dd')}` 
                          : 'LIVE_FEED_TERMINAL'}
                      </div>
                   </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-800 bg-[#060606] grid grid-cols-4 gap-6">
                 {[
                   { label: 'Volatility', value: 'High_Sigma', icon: Activity },
                   { label: 'Correl_Factor', value: '0.84_Positive', icon: Target },
                   { label: 'Risk_Weight', value: 'Tier_2_Medium', icon: AlertTriangle },
                   { label: 'Market_Status', value: 'Consolidating', icon: Radio },
                 ].map((stat, i) => (
                   <div key={i} className="flex flex-col gap-1">
                     <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none">
                       <stat.icon className="w-3 h-3 text-yellow-500" />
                       {stat.label}
                     </div>
                     <div className="text-xs font-mono text-zinc-300 italic">{stat.value}</div>
                   </div>
                 ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* (2) HUD Branding Overlay */}
      <div className="hud-overlay">
        <div className="hud-scanline" />
        
        {/* Corner Accents */}
        <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-yellow-500/10" />
        <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-yellow-500/10" />
        <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-yellow-500/10" />
        <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-yellow-500/10" />
      </div>

      {/* Top Header Navigation */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-black shrink-0 sticky top-0 z-50 md:relative">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 -ml-2 text-zinc-500 hover:text-yellow-500 transition-colors md:flex items-center gap-2 hidden"
            title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5 shadow-[0_0_10px_rgba(234,179,8,0.3)] animate-pulse text-yellow-500" />}
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white uppercase">
              AEVX <span className="text-yellow-500">ORACLE</span>
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="hidden md:block text-right">
            <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-[0.2em]">Latest Synthesis</div>
            <div className="text-sm font-semibold text-zinc-200">
              {lastUpdated ? format(lastUpdated, 'MMM dd, HH:mm') : 'NO DATA'} <span className="text-[10px] text-zinc-600 ml-1">UTC</span>
            </div>
          </div>
          <div className="hidden md:block text-right">
            <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-[0.2em]">Analysis Clock</div>
            <div className="text-sm font-semibold text-zinc-200 font-mono tracking-tighter">{format(MOCK_NOW, 'HH:mm:ss')} UTC</div>
          </div>
          <button 
            onClick={onLogout}
            className="p-2 text-zinc-500 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* News Ticker Bar */}
      {selectedPulse?.ticker && selectedPulse.ticker.length > 0 && (
        <div className="w-full bg-[#080808] border-b border-zinc-900 py-1.5 overflow-hidden z-40 shrink-0">
          <div className="flex whitespace-nowrap animate-marquee">
            {[...selectedPulse.ticker, ...selectedPulse.ticker, ...selectedPulse.ticker].map((item, idx) => (
              <div key={idx} className="inline-flex items-center gap-4 px-12 border-r border-zinc-800 last:border-0">
                <span className="text-[10px] text-yellow-600 font-black tracking-widest uppercase">INTELLIGENCE_SPIKE:</span>
                <span className="text-[11px] text-zinc-300 font-mono uppercase">{item}</span>
                <div className="w-1 h-1 rounded-full bg-yellow-500/30"></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-visible md:overflow-hidden">
        {/* Sidebar: Agent Status & History */}
        <motion.aside 
          initial={false}
          animate={{ width: isSidebarOpen ? 320 : 64 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800 bg-[#050505] flex flex-col shrink-0 md:h-full overflow-hidden relative"
        >
          {/* Minimized Sidebar View */}
          {!isSidebarOpen && (
            <div className="absolute inset-0 flex flex-col items-center py-6 gap-8 overflow-hidden">
               <button onClick={() => setIsSidebarOpen(true)} className="p-3 text-zinc-600 hover:text-yellow-500 transition-colors bg-zinc-900/50 rounded-xl hover:shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                 <Zap className="w-5 h-5 text-yellow-500" />
               </button>
               <div className="w-8 h-px bg-zinc-800" />
               <div className="flex flex-col gap-6">
                  <button onClick={() => setIsSidebarOpen(true)} className="text-zinc-600 hover:text-white transition-colors" title="Intelligence Pulse">
                    <Activity className="w-5 h-5" />
                  </button>
                  <button onClick={() => setIsSidebarOpen(true)} className="text-zinc-600 hover:text-white transition-colors" title="Archive">
                    <Database className="w-5 h-5" />
                  </button>
                  <button onClick={() => setIsSidebarOpen(true)} className="text-zinc-600 hover:text-white transition-colors" title="Watchlist">
                    <Bookmark className="w-5 h-5" />
                  </button>
                  <button onClick={() => setIsSidebarOpen(true)} className="text-zinc-600 hover:text-white transition-colors" title="Metadata">
                    <Terminal className="w-5 h-5" />
                  </button>
               </div>
               <div className="mt-auto pb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               </div>
            </div>
          )}

          <div className={`flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar w-80 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Watchlist Section */}
            {savedAssets.length > 0 && (
               <div className="space-y-3">
                 <div className="flex items-center gap-2 text-zinc-500 overflow-hidden">
                    <Bookmark className="w-3 h-3 text-yellow-500" />
                    <span className="text-[9px] uppercase tracking-widest font-black">Priority_Watchlist</span>
                    <div className="h-px flex-1 bg-yellow-500/10" />
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                   {savedAssets.map(assetName => {
                     const telemetry = marketTelemetry.find(t => t.name === assetName);
                     return (
                       <button 
                         key={assetName}
                         onClick={() => {
                           const t = marketTelemetry.find(tm => tm.name === assetName);
                           if (t) setSelectedAsset(t);
                         }}
                         className="flex flex-col gap-1 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-yellow-500/30 transition-all text-left group"
                       >
                         <div className="flex justify-between items-center w-full">
                           <span className="text-[10px] font-bold text-zinc-300 group-hover:text-yellow-500 transition-colors uppercase tracking-tighter">{assetName}</span>
                           {telemetry && (
                             <span className={`text-[8px] font-mono ${telemetry.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
                               {telemetry.pctChange}%
                             </span>
                           )}
                         </div>
                         {telemetry ? (
                           <div className="text-xs font-mono font-bold text-white leading-none tabular-nums italic tracking-tighter">
                             {telemetry.current}
                           </div>
                         ) : (
                           <div className="text-[8px] font-mono text-zinc-700 uppercase">Searching...</div>
                         )}
                       </button>
                     );
                   })}
                 </div>
               </div>
             )}

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => handleGenerate(true)}
                  disabled={isGenerating}
                  className="w-full h-12 bg-yellow-600/10 border border-yellow-500/40 hover:bg-yellow-600 hover:text-black text-yellow-500 rounded-lg flex items-center justify-center gap-3 font-black uppercase text-[10px] tracking-[0.2em] transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(202,138,4,0.1)]"
                >
                  {isGenerating ? <Activity className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Request Intelligence Pulse
                </button>
              </div>
            </div>
    
                <div className="border-t border-zinc-900 pt-6">
                  <h2 className="section-label flex justify-between items-center">
                    <span>Terminal_Metadata</span>
                    <Terminal className="w-3 h-3 opacity-30" />
                  </h2>
                  
                  <div className="space-y-4 mt-4">
                    {/* Historical Search Group */}
                    <div className="flex flex-col gap-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/40 group hover:border-yellow-500/20 transition-all">
                      <div className="flex items-center gap-2 text-zinc-500 mb-1">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[9px] uppercase tracking-widest font-bold">Historical Archive</span>
                      </div>
                      <div className="flex gap-2">
                        <input 
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          max={MOCK_NOW.toISOString().split('T')[0]}
                          className="flex-1 bg-black/50 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-yellow-500/50 transition-colors cursor-pointer"
                        />
                        <button 
                          onClick={() => handleGenerate(false, new Date(selectedDate))}
                          disabled={isGenerating}
                          className="w-10 h-8 flex items-center justify-center bg-yellow-600/10 border border-yellow-500/20 text-yellow-500 rounded hover:bg-yellow-600 hover:text-black transition-all disabled:opacity-50"
                          title="Search Archive Nodes"
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
    
                    {/* (6) Confidence Trend with Interaction */}
                    <div className="space-y-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/40 group hover:border-yellow-500/20 transition-all cursor-crosshair">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-zinc-500">
                          <Activity className="w-3 h-3" />
                          <span className="text-[9px] uppercase tracking-widest font-bold">Confidence_Trend</span>
                        </div>
                        <span className="text-[8px] font-mono text-yellow-500/50">Score / 1.0</span>
                      </div>
                      <div className="h-28 w-full relative overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendData}>
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#eab308" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#eab308" 
                              fillOpacity={0.25} 
                              fill="url(#colorScore)" 
                              strokeWidth={3}
                              isAnimationActive={false}
                            />
                            <XAxis dataKey="date" hide />
                            <YAxis domain={[0, 11]} hide padding={{ top: 10, bottom: 10 }} />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#000', 
                                border: '1px solid #eab30833',
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                borderRadius: '4px'
                              }}
                              itemStyle={{ color: '#eab308' }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between items-center text-[8px] font-mono text-zinc-700 uppercase">
                        <span>Depth: {pulses.length}</span>
                        <span className="text-yellow-500/30">Stable_Pipeline</span>
                      </div>
                    </div>

                    {/* Market Bias Trend */}
                    <div className="space-y-2 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/40 group hover:border-yellow-500/20 transition-all cursor-crosshair">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-zinc-500">
                          <TrendingUp className="w-3 h-3" />
                          <span className="text-[9px] uppercase tracking-widest font-bold">Market_Bias_Vector</span>
                        </div>
                        <span className="text-[8px] font-mono text-emerald-500/50">Bull vs Bear</span>
                      </div>
                      <div className="h-28 w-full relative overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={marketBiasData}>
                            <defs>
                              <linearGradient id="colorBias" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#eab308" stopOpacity={0.6}/>
                                <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area 
                              type="monotone" 
                              dataKey="bias" 
                              stroke="#eab308" 
                              fillOpacity={0.3} 
                              fill="url(#colorBias)" 
                              strokeWidth={3}
                              isAnimationActive={false}
                            />
                            <XAxis dataKey="date" hide />
                            <YAxis hide domain={['auto', 'auto']} padding={{ top: 10, bottom: 10 }} />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#000', 
                                border: '1px solid #eab30833',
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                borderRadius: '4px'
                              }}
                              itemStyle={{ color: '#eab308' }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between items-center text-[8px] font-mono text-zinc-700 uppercase">
                        <span>Asset Momentum</span>
                        <span className="text-emerald-500/30">Sentiment_Sync</span>
                      </div>
                    </div>
                  </div>
                </div>
    
                <div className="border-t border-zinc-900 pt-6 flex flex-col">
                  <h2 className="section-label flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span>Archive_Node</span>
                      <span className="text-[8px] font-mono opacity-50 bg-zinc-800 px-1 rounded">{pulses.length}</span>
                    </div>
                    <button 
                      onClick={() => setIsPlaybackActive(!isPlaybackActive)}
                      className={`p-1 rounded border transition-all ${isPlaybackActive ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-500' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                      title={isPlaybackActive ? "Stop Playback" : "Temporal Playback Mode"}
                    >
                      <RefreshCcw className={`w-3 h-3 ${isPlaybackActive ? 'animate-spin' : ''}`} />
                    </button>
                  </h2>
                  <div className="space-y-1 mt-2">
                    {pulses.length === 0 ? (
                      <div className="py-8 text-center border border-dashed border-zinc-900 rounded-lg">
                        <Database className="w-4 h-4 text-zinc-800 mx-auto mb-2 opacity-20" />
                        <p className="text-[9px] text-zinc-700 uppercase font-bold tracking-widest">No Intelligence Records</p>
                      </div>
                    ) : (
                      pulses.map((p, idx) => {
                        let displayDate = '??';
                        let fullDate = 'Unknown Date';
                        try {
                          const d = new Date(p.date || '');
                          if (!isNaN(d.getTime())) {
                            displayDate = format(d, 'dd');
                            fullDate = format(d, 'MMM dd');
                          }
                        } catch (e) {}
    
                        return (
                          <div
                            key={p.id || idx}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedPulse(p)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedPulse(p);
                              }
                            }}
                            className={`w-full group p-3 rounded-lg text-left transition-all flex items-center gap-3 border cursor-pointer shrink-0 ${
                              selectedPulse?.id === p.id 
                              ? 'bg-yellow-500/10 border-yellow-500/30' 
                              : 'border-white/5 hover:bg-zinc-900/50'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded border flex items-center justify-center bg-black/50 shrink-0 ${selectedPulse?.id === p.id ? 'border-yellow-500/40 text-yellow-500' : 'border-white/10 text-zinc-600'}`}>
                              <span className="mono-data text-[9px] text-current">{displayDate}</span>
                            </div>
                            <div className="overflow-hidden flex-1">
                              <div className={`text-[10px] font-bold uppercase truncate ${selectedPulse?.id === p.id ? 'text-yellow-500' : 'text-zinc-400'}`}>Report: {fullDate}</div>
                              <div className="text-[9px] text-zinc-600 font-mono truncate">{p.summary}</div>
                            </div>
                            {p.id && (!p.userId || p.userId === user.uid) && (
                              <button 
                                onClick={(e) => handleDeletePulse(e, p.id!)}
                                className={`p-1.5 hover:bg-red-500/20 text-zinc-500 hover:text-red-500 transition-all rounded ${
                                  selectedPulse?.id === p.id ? 'opacity-100' : 'opacity-10 group-hover:opacity-100'
                                }`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </motion.aside>

        {/* Main Content: The Report */}
        <main className="flex-1 p-4 md:p-8 flex flex-col gap-8 md:overflow-y-auto scroll-smooth">
          <AnimatePresence mode="wait">
            {selectedPulse ? (
              <motion.div
                key={selectedPulse.date}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-4xl mx-auto w-full space-y-8"
              >
                {/* Executive Summary Section Optimized */}
                <section className="flex flex-col gap-6">
                  {/* System Alerts */}
                  {(selectedPulse.confidenceScore < 5 || selectedPulse.hotspots.some(h => h.impact === 'High')) && (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-3 animate-pulse shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <div className="flex-1">
                        <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Active System Alert</div>
                        <div className="text-[11px] text-red-200">
                          {selectedPulse.confidenceScore < 5 && `Critical: Confidence below threshold (${selectedPulse.confidenceScore}/10). `}
                          {selectedPulse.hotspots.filter(h => h.impact === 'High').length > 0 && `High Impact Risk: ${selectedPulse.hotspots.filter(h => h.impact === 'High').length} hotspots require attention.`}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="tech-card p-5 border-yellow-500/10 bg-zinc-900/20 relative group overflow-hidden">
                    <div className="flex justify-between items-center mb-3">
                      <h2 className="section-label mb-0 flex items-center gap-2">
                        <Target className="w-3 h-3" />
                        <span>Intelligence_Pulse</span>
                      </h2>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Confidence</span>
                          <div className="flex gap-0.5">
                            {[...Array(10)].map((_, i) => (
                              <div key={i} className={`w-1.5 h-3 rounded-full ${i < selectedPulse.confidenceScore ? 'bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]' : 'bg-zinc-800'}`} />
                            ))}
                          </div>
                          <span className="text-[10px] font-mono text-yellow-500 font-bold ml-1">{selectedPulse.confidenceScore}/10</span>
                        </div>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase">{format(new Date(selectedPulse.date), 'MMM dd, yyyy // HH:mm')} UTC</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-lg text-zinc-100 font-medium leading-relaxed italic border-l-2 border-yellow-500/20 pl-4 py-1">
                        "{selectedPulse.summary}"
                      </p>
                    </div>
                  </div>
                </section>

                {/* Market Telemetry Row */}
                <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {marketTelemetry.map((asset, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedAsset(asset)}
                      className="tech-card p-4 border-zinc-800 bg-zinc-900/10 hover:border-yellow-500/20 transition-all group cursor-pointer active:scale-[0.98]"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black text-zinc-500 tracking-widest">{asset.name}</span>
                        <span className={`text-[9px] font-mono font-bold ${asset.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {asset.trend === 'up' ? '+' : ''}{asset.pctChange}%
                        </span>
                      </div>
                      <div className="text-lg font-bold text-white mb-2 font-mono tabular-nums">
                        {asset.current}
                      </div>
                      <div className="h-20 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={asset.data}>
                            <Tooltip 
                              labelKey="displayDate"
                              contentStyle={{ 
                                backgroundColor: '#000', 
                                border: '1px solid #eab30833',
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                borderRadius: '4px'
                              }}
                              itemStyle={{ color: '#eab308' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="price" 
                              stroke="#eab308" 
                              fill="#eab30844" 
                              strokeWidth={3} 
                              dot={false}
                              isAnimationActive={false}
                            />
                            <YAxis hide domain={['dataMin', 'dataMax']} padding={{ top: 10, bottom: 10 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </section>

                {/* Interactive Geopolitical Map */}
                <section className="tech-card border-yellow-500/10 overflow-hidden relative">
                  <div className="p-4 border-b border-zinc-800 bg-black/40 flex justify-between items-center absolute top-0 left-0 w-full z-10 backdrop-blur-sm">
                    <h2 className="section-label mb-0 flex items-center gap-2">
                       <Globe className="w-3 h-3" /> Tactical_Overlay_Map
                    </h2>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setShowZones(!showZones)}
                        className={`px-2 py-0.5 flex items-center gap-2 rounded border transition-all text-[9px] font-mono uppercase ${
                          showZones ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-500' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <Activity className={`w-3 h-3 ${showZones ? 'animate-pulse' : ''}`} />
                        {showZones ? 'Zones_Active' : 'Show_Zones'}
                      </button>
                    </div>
                  </div>
                  <div className="h-[400px] w-full bg-zinc-950">
                      <MapContainer 
                        center={[20, 10]} 
                        zoom={2} 
                        className="h-full w-full"
                        scrollWheelZoom={true}
                        doubleClickZoom={true}
                        dragging={true}
                        zoomControl={true}
                        minZoom={2}
                      >
                        <MapResizer selectedPulse={selectedPulse} />
                        <TileLayer
                          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                          subdomains="abcd"
                          attribution='&copy; CARTO'
                        />
                          {/* Render Zones First (Grouped by Event) */}
                          {(() => {
                            const groupedByEvent = selectedPulse.hotspots.reduce((acc: any, h: any) => {
                              if (h.lat === undefined || h.lng === undefined || h.lat === null || h.lng === null) return acc;
                              if (!h.event) return acc;
                              if (!acc[h.event]) acc[h.event] = [];
                              acc[h.event].push(h);
                              return acc;
                            }, {});

                            return Object.entries(groupedByEvent).map(([event, hs]: [string, any]) => {
                              if (!showZones) return null;
                              const h = hs[0]; // Reference hotspot for zone positioning
                              const zonePositions = getZonePolygon(event, h.lat, h.lng, h.impact);
                              const zoneStyle = getZoneStyle(event, h.impact);

                              return (
                                <Polygon
                                  key={`zone-${event}-${selectedPulse.id}`}
                                  positions={zonePositions}
                                  pathOptions={zoneStyle}
                                  eventHandlers={{
                                    click: () => setSelectedHotspot({ hotspots: hs, isZone: true, label: event })
                                  }}
                                >
                                  <MapTooltip sticky>
                                    <div className="text-[10px] uppercase font-bold text-yellow-500">{event} <span className="text-zinc-400 ml-1">(ZONE)</span></div>
                                  </MapTooltip>
                                </Polygon>
                              );
                            });
                          })()}

                          {/* Render Markers on Top */}
                          {selectedPulse.hotspots.map((h, i) => {
                            if (h.lat === undefined || h.lng === undefined || h.lat === null || h.lng === null) return null;
                            
                            return (
                              <Marker 
                                key={`marker-${selectedPulse.id}-${i}`}
                                position={[h.lat, h.lng]}
                                icon={createMarkerIcon(h.impact)}
                                eventHandlers={{
                                  click: () => setSelectedHotspot({ hotspots: [h], isZone: false })
                                }}
                              >
                                <MapTooltip className="premium-map-tooltip" direction="top" offset={[0, -10]}>
                                  <div className="flex flex-col gap-1 min-w-[124px]">
                                    <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">{h.event}</span>
                                    <div className="flex justify-between items-center">
                                      <span className="text-[8px] text-zinc-400 uppercase font-mono">{h.impact} RISK</span>
                                      <span className="text-[8px] text-zinc-600 font-mono italic">Click for info</span>
                                    </div>
                                  </div>
                                </MapTooltip>
                              </Marker>
                            );
                          })}
                      </MapContainer>
                  </div>
                  <div className="absolute bottom-4 left-4 flex gap-4 z-10">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-black/80 backdrop-blur border border-zinc-800 rounded shadow-xl">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-[8px] font-mono text-zinc-400 uppercase">High_Risk</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-black/80 backdrop-blur border border-zinc-800 rounded shadow-xl">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>
                      <span className="text-[8px] font-mono text-zinc-400 uppercase">Medium_Risk</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-black/80 backdrop-blur border border-zinc-800 rounded shadow-xl">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                      <span className="text-[8px] font-mono text-zinc-400 uppercase">Stable</span>
                    </div>
                  </div>
                </section>

                {/* Key Insights & Asset Correlation Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
                  {/* Hotspots */}
                  <section className="tech-card flex flex-col min-h-[300px] border-yellow-500/5">
                    <div className="p-4 border-b border-zinc-800 bg-black/40 flex justify-between items-center shrink-0">
                      <h2 className="section-label mb-0">Geopolitical Hotspots</h2>
                      <span className="text-[9px] bg-red-950/40 text-red-500 px-1.5 py-0.5 rounded border border-red-900/50 uppercase font-bold tracking-tighter">Risk Alert</span>
                    </div>
                  {/* Hotspots List */}
                  <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                    {selectedPulse.hotspots.map((h, i) => (
                      <button 
                        key={i} 
                        onClick={() => setSelectedHotspot({ hotspots: [h], isZone: false })}
                        className={`w-full text-left pl-4 border-l-2 transition-all hover:bg-white/5 active:scale-[0.98] ${h.impact === 'High' ? 'border-yellow-500 bg-yellow-500/5' : h.impact === 'Med' ? 'border-zinc-500 bg-zinc-500/5' : 'border-zinc-700 bg-zinc-800/10'} p-3 rounded-r-lg relative overflow-hidden group`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">{h.sector || 'GENERAL'}</span>
                            <span className="text-sm font-bold text-white uppercase tracking-tight">{h.event}</span>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${h.impact === 'High' ? 'text-yellow-500 border-yellow-500/30' : 'text-zinc-500 border-zinc-800'}`}>{h.impact.toUpperCase()}</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-relaxed font-mono">
                          {h.analysis}
                        </p>
                        {/* Status bar */}
                        <div className="absolute bottom-0 left-0 h-0.5 bg-yellow-500/20 w-0 group-hover:w-full transition-all duration-500" />
                      </button>
                    ))}
                  </div>
                  </section>

                  {/* Correlations */}
                  <section className="tech-card flex flex-col border-yellow-500/5">
                    <div className="p-4 border-b border-zinc-800 bg-black/40 shrink-0">
                      <h2 className="section-label mb-0">Market Correlations</h2>
                    </div>
                    <div className="p-4 grid gap-3 flex-1 items-start content-start">
                      {selectedPulse.marketCorrelations.map((m, i) => {
                        const assetHistory = [...pulses].reverse().map(p => {
                          const corr = p.marketCorrelations.find(c => c.assetClass === m.assetClass);
                          let val = 0;
                          if (corr?.trend === 'Increasing') val = 1;
                          if (corr?.trend === 'Decreasing') val = -1;
                          return { val };
                        });

                        return (
                          <div key={i} className="flex flex-col gap-3 p-3 bg-zinc-900/20 rounded border border-zinc-800/40 hover:border-yellow-500/30 transition-all group">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-xs font-bold text-zinc-100 uppercase tracking-wide group-hover:text-yellow-500 transition-colors">{m.assetClass}</div>
                                <div className="text-[9px] text-zinc-600 italic mt-0.5">Driver: {m.driver}</div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-bold ${m.trend === 'Increasing' ? 'text-yellow-500' : m.trend === 'Decreasing' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                  {m.trend === 'Increasing' ? '↑' : m.trend === 'Decreasing' ? '↓' : '↔'}
                                </div>
                                <div className="text-[9px] text-zinc-700 font-mono uppercase">{m.trend}</div>
                              </div>
                            </div>
                            
                            {/* Asset Correlation Sparkline */}
                            <div className="h-12 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={assetHistory}>
                                  <Line 
                                    type="stepAfter" 
                                    dataKey="val" 
                                    stroke="#eab308" 
                                    strokeWidth={3} 
                                    dot={false}
                                    isAnimationActive={false}
                                  />
                                  <YAxis hide domain={[-1.5, 1.5]} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                {/* Live Signal Stream Section */}
                <section className="tech-card border-zinc-800 bg-black/40 overflow-hidden flex flex-col h-[400px]">
                  <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/10">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-emerald-500" />
                        <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] pt-0.5">Geopolitical_Signal_Stream</h2>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[8px] font-bold text-emerald-500">
                        <Radio className="w-2 h-2 animate-pulse" />
                        LIVE
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-[#020202]">
                    <div className="divide-y divide-zinc-900/50">
                      {selectedPulse ? (
                        selectedPulse.hotspots.map((event, idx) => (
                          <motion.div 
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={`${selectedPulse.date}-${idx}`} 
                            className="px-5 py-3 hover:bg-white/[0.02] flex gap-4 items-start group"
                          >
                            <div className="w-20 shrink-0 font-mono text-[9px] text-zinc-600 pt-0.5">
                              {format(new Date(selectedPulse.date), 'HH:mm:ss')} <span className="opacity-40">UTC</span>
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`w-1 h-1 rounded-full ${
                                  event.impact === 'High' ? 'bg-red-500' : 
                                  event.impact === 'Med' ? 'bg-yellow-500' : 'bg-emerald-500'
                                }`} />
                                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-tight">{event.event}</span>
                                <span className="text-[9px] text-zinc-700 font-mono italic">#{event.sector}</span>
                              </div>
                              <p className="text-[10px] text-zinc-500 leading-normal line-clamp-1 group-hover:line-clamp-none transition-all duration-300">
                                {event.analysis}
                              </p>
                            </div>
                            <div className="shrink-0 flex items-center gap-3">
                              <button 
                                onClick={() => setSelectedHotspot({ hotspots: [event], isZone: false })}
                                className="text-[9px] text-zinc-700 hover:text-yellow-500 uppercase font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-all font-mono"
                              >
                                [XRAY_SCAN]
                              </button>
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                                event.impact === 'High' ? 'text-red-500/50 border-red-500/20' : 
                                event.impact === 'Med' ? 'text-yellow-500/50 border-yellow-500/20' : 'text-emerald-500/50 border-emerald-500/20'
                              }`}>
                                {event.impact}
                              </span>
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="p-12 text-center flex flex-col items-center gap-3">
                          <Activity className="w-8 h-8 text-zinc-800 animate-pulse" />
                          <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-[0.2em]">Awaiting Uplink Connection...</p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Forecast Section */}
                <section className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                    <Zap className="w-24 h-24 text-yellow-500" />
                  </div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-yellow-500 rounded-lg text-black shadow-[0_0_15px_rgba(234,179,8,0.3)]">
                      <Target className="w-5 h-5" />
                    </div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-[0.2em] pt-1">Oracle Predictive Forecast</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
                    {selectedPulse.forecast.scenarios.map((s, i) => (
                      <div key={i} className={`p-4 rounded-xl border transition-all ${s.type === 'Base Case' ? 'bg-yellow-500/10 border-yellow-500/30 ring-1 ring-yellow-500/20' : 'bg-black/40 border-zinc-800/50 hover:bg-zinc-900/50'} group-hover:scale-[1.01] transition-transform flex flex-col`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-[9px] font-bold uppercase tracking-widest italic ${s.type === 'Base Case' ? 'text-yellow-500' : 'text-zinc-500'}`}>{s.type}</span>
                          <span className="text-[9px] font-bold text-yellow-500 bg-yellow-950/40 px-1.5 rounded border border-yellow-500/20">{s.likelihood}</span>
                        </div>
                        <p className="text-xs text-zinc-300 mt-2 leading-relaxed flex-1">
                          {s.description}
                        </p>
                        <div className="mt-3 pt-3 border-t border-zinc-800/50 flex items-center justify-end">
                           <div className="flex gap-1">
                             {[...Array(5)].map((_, j) => (
                               <div key={j} className={`w-1.5 h-1.5 rounded-full ${j < parseInt(s.likelihood) / 20 ? 'bg-yellow-500' : 'bg-zinc-800'}`}></div>
                             ))}
                           </div>
                        </div>
                      </div>
                    ))}
                    <div className="bg-black/40 p-4 rounded-xl border border-zinc-800/50 relative overflow-hidden flex flex-col justify-between">
                      <div>
                        <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Impact Oscillator</div>
                        <div className="text-sm font-bold text-yellow-500 uppercase tracking-tight">{selectedPulse.forecast.keyIndicator}</div>
                      </div>
                      <div className="mt-4">
                        <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${selectedPulse.confidenceScore * 10}%` }}
                            transition={{ duration: 1.5, delay: 0.5 }}
                            className="h-full bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]" 
                          />
                        </div>
                        <div className="flex justify-end items-center mt-2">
                          <span className="text-[10px] font-mono text-yellow-500 font-bold">{selectedPulse.confidenceScore}/10</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </motion.div>
            ) : (
                <div className="h-[600px] flex flex-col items-center justify-center gap-6 tech-card border-dashed border-zinc-800 bg-transparent">
                  <div className="w-16 h-16 rounded-full border border-zinc-800 flex items-center justify-center animate-pulse">
                    <Activity className="w-6 h-6 text-zinc-700" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="font-mono text-zinc-500 text-[10px] uppercase tracking-[0.5em]">System_Readiness: 100%</h3>
                    <p className="text-zinc-700 text-[9px] uppercase tracking-widest">Awaiting initialization signal from orchestration node</p>
                  </div>
                  <button 
                    onClick={() => handleGenerate(false)}
                    className="px-6 py-2 border border-zinc-800 rounded-full text-[10px] text-zinc-500 uppercase tracking-widest hover:border-yellow-500/50 hover:text-yellow-500 transition-all font-bold"
                  >
                    Initialize First Scan
                  </button>
                </div>
            )}
          </AnimatePresence>
        </main>

        {/* Right Sidebar: Market Intel */}
        <aside className="w-72 border-l border-zinc-800 bg-black hidden xl:flex flex-col p-4 gap-6 shrink-0 overflow-y-auto">
          <div>
            <h2 className="section-label">Market_Intel_Trend</h2>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-mono text-zinc-600 uppercase">Target_Asset</label>
                <select 
                  value={selectedAssetClass}
                  onChange={(e) => setSelectedAssetClass(e.target.value)}
                  className="bg-black border border-zinc-800 text-zinc-400 text-[10px] rounded p-2 outline-none focus:border-yellow-500/50 transition-colors uppercase font-mono"
                >
                  {assetClasses.map(ac => (
                    <option key={ac} value={ac}>{ac}</option>
                  ))}
                </select>
              </div>

              <div className="h-48 w-full bg-zinc-900/10 rounded-lg border border-zinc-800/40 p-2 relative overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minHeight={160}>
                  <LineChart data={correlationTrendData}>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#000', 
                        border: '1px solid #eab30833',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        borderRadius: '4px'
                      }}
                      itemStyle={{ color: '#eab308' }}
                      labelStyle={{ display: 'none' }}
                      cursor={{ stroke: '#eab30866', strokeWidth: 1 }}
                    />
                    <XAxis dataKey="date" hide />
                    <YAxis domain={[-1.5, 1.5]} hide />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#000', 
                        border: '1px solid #eab30833',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        borderRadius: '4px'
                      }}
                      itemStyle={{ color: '#eab308' }}
                      formatter={(val: number) => [val === 1 ? 'Bullish' : val === -1 ? 'Bearish' : 'Neutral', 'Trend']}
                    />
                    <Line 
                      type="stepAfter" 
                      dataKey="value" 
                      stroke="#eab308" 
                      strokeWidth={4} 
                      dot={{ fill: '#eab308', r: 5 }}
                      activeDot={{ r: 7, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="trend" 
                      stroke="#eab308" 
                      strokeWidth={1.5} 
                      strokeDasharray="5 5" 
                      dot={false} 
                      activeDot={false}
                      opacity={0.6}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between px-1">
                <span className="text-[8px] font-mono text-yellow-500/70 uppercase tracking-tighter">Bullish</span>
                <span className="text-[8px] font-mono text-zinc-700 uppercase tracking-tighter">Neutral</span>
                <span className="text-[8px] font-mono text-white/20 uppercase tracking-tighter">Bearish</span>
              </div>
              <p className="text-[9px] text-zinc-600 font-mono leading-tight italic">
                Cross-agent correlation of sentiment vectors for {selectedAssetClass} over the last 10 cycle iterations.
              </p>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-zinc-900">
            <h2 className="section-label">System_Nodes</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 border border-zinc-900 rounded bg-zinc-900/10">
                <div className="text-[8px] font-mono text-zinc-700 uppercase">Provider</div>
                <div className="text-[9px] font-bold text-zinc-400">TAVILY_v1</div>
              </div>
              <div className="p-2 border border-zinc-900 rounded bg-zinc-900/10">
                <div className="text-[8px] font-mono text-zinc-700 uppercase">LLM</div>
                <div className="text-[9px] font-bold text-zinc-400">LLAMA_3.3</div>
              </div>
              <div className="p-2 border border-zinc-900 rounded bg-zinc-900/10">
                <div className="text-[8px] font-mono text-zinc-700 uppercase">Latency</div>
                <div className="text-[9px] font-bold text-zinc-400">42ms</div>
              </div>
              <div className="p-2 border border-zinc-900 rounded bg-zinc-900/10">
                <div className="text-[8px] font-mono text-zinc-700 uppercase">Security</div>
                <div className="text-[9px] font-bold text-yellow-500/70">WAF_ACTIVE</div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-8 bg-black border-t border-zinc-900 px-6 flex items-center justify-between text-[9px] font-mono text-zinc-600 uppercase tracking-wider shrink-0">
        <div className="flex gap-6 divide-x divide-zinc-900">
          <span className="pl-0">Session: pulse.alpha.842</span>
          <span className="pl-6 flex gap-2">
            LLM: <span className="text-zinc-400">Groq Llama 3.3</span>
          </span>
          <span className="pl-6">Memory: <span className="text-zinc-400">Active</span></span>
        </div>
        <div className="flex gap-4">
          <span className="text-yellow-500/70 animate-pulse">● Synchronization Active</span>
          <span className="text-zinc-800">Checksum: 0x9fA2</span>
        </div>
      </footer>

      {/* Hotspot Intelligence Dossier (Slide-out) */}
      <AnimatePresence>
        {selectedHotspot && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedHotspot(null)}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[#080808] border-l border-zinc-800 z-[101] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 bg-black/40 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
                    <Target className="w-4 h-4 text-yellow-500" />
                  </div>
                  <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white">Intel_Dossier</h2>
                </div>
                <button 
                  onClick={() => setSelectedHotspot(null)}
                  className="p-2 hover:bg-white/5 rounded-full text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                {selectedHotspot.hotspots.map((h: any, idx: number) => (
                  <div key={idx} className={`space-y-8 ${idx > 0 ? 'pt-8 border-t border-zinc-800' : ''}`}>
                    {/* Dossier Header */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{h.sector || 'GENERAL'}</span>
                        <div className="h-px flex-1 bg-zinc-800/50" />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          h.impact === 'High' ? 'text-red-500 border-red-500/20 bg-red-500/10' :
                          h.impact === 'Med' ? 'text-yellow-500 border-yellow-500/20 bg-yellow-500/10' :
                          'text-emerald-400 border-emerald-400/20 bg-emerald-400/10'
                        }`}>
                          {h.impact.toUpperCase()} IMPACT
                        </span>
                      </div>
                      <h3 className="text-2xl font-bold text-white uppercase leading-tight tracking-tighter">
                        {h.event}
                      </h3>
                      {selectedHotspot.isZone && (
                        <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-[8px] font-mono text-yellow-500 uppercase">
                          Zone_Match_{idx + 1}
                        </div>
                      )}
                    </div>

                    {/* Risk Score Indicator */}
                    <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Operational Risk</div>
                        <div className="text-3xl font-black text-yellow-500 font-mono italic">
                          {h.impact === 'High' ? '0.84' : h.impact === 'Med' ? '0.52' : '0.18'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-[8px] font-mono text-zinc-600 uppercase">System_Verify</div>
                        <div className="flex gap-0.5">
                           {[...Array(5)].map((_, i) => (
                             <div key={i} className={`w-3 h-1 rounded-full ${
                               i < (h.impact === 'High' ? 5 : h.impact === 'Med' ? 3 : 1) 
                               ? 'bg-yellow-500' : 'bg-zinc-800'
                             }`} />
                           ))}
                        </div>
                      </div>
                    </div>

                    {/* Analysis Section */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <Terminal className="w-3 h-3" />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest">Scout_Briefing</h4>
                      </div>
                      <div className="text-zinc-400 text-sm leading-relaxed font-mono bg-black/40 p-4 rounded-lg border border-zinc-900">
                        {h.analysis}
                      </div>
                    </div>

                    {/* Strategic Outlook */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <Zap className="w-3 h-3 text-yellow-500" />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest">Strategic_Outlook</h4>
                      </div>
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="w-1 h-auto bg-yellow-500 rounded-full" />
                          <p className="text-xs text-zinc-300 leading-relaxed italic">
                            "The convergence of current events suggests a critical escalation vector. Asset reassignment is advised for high-exposure positions."
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800/50">
                            <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">Duration_Expected</div>
                            <div className="text-[10px] font-bold text-zinc-300">SHORT_TERM (3-5d)</div>
                          </div>
                          <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800/50">
                            <div className="text-[8px] font-mono text-zinc-500 uppercase mb-1">Contagion_Risk</div>
                            <div className="text-[10px] font-bold text-zinc-300 uppercase">{h.impact === 'High' ? 'CRITICAL' : 'LIMITED'}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Coordinates Link */}
                    <div className="flex justify-between items-center text-[9px] font-mono text-zinc-600">
                      <span>GRID: {h.lat.toFixed(2)}N / {h.lng.toFixed(2)}E</span>
                    </div>
                  </div>
                ))}

                {/* Asset Correlation Lock (Consolidated for all in selection) */}
                {selectedPulse?.marketCorrelations && (
                  <div className="space-y-3 pt-4 border-t border-zinc-900">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <TrendingUp className="w-3 h-3" />
                      <h4 className="text-[10px] font-bold uppercase tracking-widest">Asset_Lock_State</h4>
                    </div>
                    <div className="grid gap-2">
                       {selectedPulse.marketCorrelations
                        .filter(m => selectedHotspot.hotspots.some((h: any) => m.driver.toLowerCase().includes(h.sector?.toLowerCase() || '')))
                        .map((m, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                            <span className="text-[10px] font-bold text-zinc-200 uppercase">{m.assetClass}</span>
                            <span className={`text-[10px] font-bold ${m.trend === 'Increasing' ? 'text-yellow-500' : 'text-zinc-500'}`}>
                              {m.trend === 'Increasing' ? 'NET_INCREASE' : 'STABLE_OR_DECREASE'}
                            </span>
                          </div>
                       ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Dossier Footer */}
              <div className="p-6 border-t border-zinc-800 bg-black/40 mt-auto">
                <div className="flex justify-between items-center text-[9px] font-mono text-zinc-600">
                  <div className="flex gap-4">
                    <span>SELECTION: {selectedHotspot.isZone ? 'ZONE_OVERLAY' : 'POINT_NODE'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 border border-zinc-800 rounded bg-black">
                     <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                     SECURE_COMM
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
