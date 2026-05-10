import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PulseData } from './agentOrchestrator';

export const mockPulses: Omit<PulseData, 'id'>[] = [
  {
    date: "2026-02-14T10:00:00Z",
    summary: "Valentine's Day economic metrics show unexpected surge in luxury consumption in emerging Asian markets. Global shipping remains stable despite localized monsoon alerts in the Indian Ocean.",
    ticker: [
      "LUXURY SALES SOAR IN SOUTH EAST ASIA AS DISPOSABLE INCOME HITS RECORD",
      "MONSOON WATCH: ADVISORY ISSUED FOR BENGAL BAY TRANSITS",
      "SEMICONDUCTOR EQUIPMENT UPGRADES ANNOUNCED BY NORDIC CONSORTIUM",
      "EU DATA PRIVACY SHIELD 3.0 NEGOTIATIONS REACH STALEMATE"
    ],
    hotspots: [
      {
        event: "Nordic Data Center Expansion",
        impact: "Low",
        sector: "Tech",
        analysis: "Sweden announces new renewable-powered hubs, reducing European latency for sovereign clouds.",
        lat: 62.0,
        lng: 15.0
      },
      {
        event: "Horn of Africa Shipping Risk",
        impact: "Med",
        sector: "Security",
        analysis: "Localized piracy alert near Djibouti increasing patrol costs for commercial vessels.",
        lat: 11.5,
        lng: 43.1
      }
    ],
    marketCorrelations: [
      { assetClass: "LVMH/Luxury Basket", trend: "Increasing", driver: "Asian demand surge" },
      { assetClass: "Swedish Krona", trend: "Increasing", driver: "Tech investment inflows" },
      { assetClass: "Gold (XAU)", trend: "Increasing", driver: "Safe haven flows" }
    ],
    forecast: {
      scenarios: [
        { type: "Base Case", description: "Consumption boom sustains through Q1.", likelihood: "70%" },
        { type: "Bearish", description: "EU regulatory stalemate triggers tech selloff.", likelihood: "20%" },
        { type: "Bullish", description: "Monsoon patterns dissipate early, boosting trade volumes.", likelihood: "10%" }
      ],
      keyIndicator: "Consumer Sentiment Index"
    },
    confidenceScore: 9,
    confidenceReasoning: "Historical seasonality and clear regulatory signals provide stability to this pulse."
  },
  {
    date: "2026-02-21T12:00:00Z",
    summary: "Mid-month synthesis reveals a significant pivot in semiconductor supply chains. Central European energy grid stabilization complete, allowing for industrial output ramp-up.",
    ticker: [
      "TSMC ANNOUNCES STRATEGIC PARTNERSHIP WITH ARIZONA HUB",
      "GERMAN INDUSTRIAL INDEX REBOUNDS ON ENERGY STABILITY",
      "CYBER-ATTACK MITIGATED AT ROTTERDAM PORT TERMINAL",
      "BLOCKCHAIN IDENTITY PROTOCOL PILOTED FOR CROSS-BORDER LOGISTICS"
    ],
    hotspots: [
      {
        event: "Taiwan Strait Maneuvers",
        impact: "Low",
        sector: "Security",
        analysis: "Routine drills conclude without escalation; shipping lanes reopening to full capacity.",
        lat: 24.0,
        lng: 121.0
      },
      {
        event: "European Power Grid Stability",
        impact: "Med",
        sector: "Energy",
        analysis: "Integration of offshore wind peaks, driving down spot prices in the DACH region.",
        lat: 51.0,
        lng: 10.0
      }
    ],
    marketCorrelations: [
      { assetClass: "TSMC/Semis", trend: "Increasing", driver: "Arizona partnership news" },
      { assetClass: "DAX Index", trend: "Increasing", driver: "Energy stability output" },
      { assetClass: "Bitcoin (BTC)", trend: "Increasing", driver: "Institutional adoption" }
    ],
    forecast: {
      scenarios: [
        { type: "Base Case", description: "Tech rally continues into late Feb.", likelihood: "65%" },
        { type: "Bearish", description: "Cyber-risks in ports trigger supply chain backlog.", likelihood: "25%" },
        { type: "Bullish", description: "New trade agreements accelerate EU-Asia integration.", likelihood: "10%" }
      ],
      keyIndicator: "Energy Spot Price Index"
    },
    confidenceScore: 8,
    confidenceReasoning: "Strong alignment between policy announcements and market reaction vectors."
  },
  {
    date: "2026-02-28T18:00:00Z",
    summary: "End-of-month rebalancing triggered by escalation in Taiwan Strait naval exercises. Cyber-resiliency protocols activated across major Japanese financial centers.",
    ticker: [
      "TAIWAN STRAIT: UNANNOUNCED DRILLS TRIGGER LOGISTICS REROUTING",
      "TOKYO STOCK EXCHANGE INVESTIGATING SUSPICIOUS NETWORK LATENCY",
      "COPPER PRICES HIT 5-YEAR PEAK ON GREEN TRANSITION DEMAND",
      "NATO DEFENSE SPENDING TARGETS TO BE REVISED UPWARD IN UPCOMING SUMMIT"
    ],
    hotspots: [
      {
        event: "Taiwan Strait Maneuvers",
        impact: "High",
        sector: "Security",
        analysis: "Scale of exercises forces commercial flights to deviate; air freight costs spiking +15% overnight.",
        lat: 24.0,
        lng: 121.0
      },
      {
        event: "Nordic Power Grid Pressure",
        impact: "Med",
        sector: "Energy",
        analysis: "Extreme cold snap testing stability of newly integrated wind farms in Finland.",
        lat: 64.0,
        lng: 26.0
      }
    ],
    marketCorrelations: [
      { assetClass: "TSMC/Semis", trend: "Decreasing", driver: "Geopolitical risk premium" },
      { assetClass: "Defense Stocks", trend: "Increasing", driver: "NATO budget optimism" },
      { assetClass: "Copper Spot", trend: "Increasing", driver: "Renewable energy infrastructure" }
    ],
    forecast: {
      scenarios: [
        { type: "Base Case", description: "Drills conclude within 48h; markets mean-revert by Tuesday.", likelihood: "55%" },
        { type: "Bearish", description: "Accidental encounter in Strait triggers global risk-off event.", likelihood: "30%" },
        { type: "Bullish", description: "Back-channel diplomacy leads to immediate de-escalation.", likelihood: "15%" }
      ],
      keyIndicator: "Logistics Congestion Index"
    },
    confidenceScore: 7,
    confidenceReasoning: "High signal volatility due to active military posturing; projection relies on historical 'drill-and-fade' patterns."
  }
];

export async function seedMockData(userId?: string) {
  const pulsesRef = collection(db, 'pulses');
  console.log('🌱 Starting seed process for user:', userId);
  
  for (let i = 0; i < mockPulses.length; i++) {
    const pulse = mockPulses[i];
    try {
      const payload: any = {
        ...pulse,
        summary: `[MOCK_ARCHIVE_RECOVERY] ${pulse.summary}`,
        createdAt: serverTimestamp()
      };
      
      if (userId) {
        payload.userId = userId;
      }
      
      console.log(`📤 Sending pulse ${i+1}/${mockPulses.length}...`);
      const docRef = await addDoc(pulsesRef, payload);
      console.log(`✅ Pulse seeded successfully. ID: ${docRef.id}`);
    } catch (err: any) {
      console.error(`❌ Error seeding pulse ${i+1}:`, err);
      throw err;
    }
  }
  console.log('✨ Seeding complete.');
}
