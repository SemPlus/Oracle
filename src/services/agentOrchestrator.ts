import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, Timestamp, deleteDoc, doc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { mockPulses } from "./mockDataSeeder";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface AgentStatus {
  agent: 'Scout' | 'Synthesizer' | 'Oracle';
  status: 'idle' | 'processing' | 'complete' | 'error';
  message: string;
}

export interface PulseData {
  id?: string;
  date: string;
  summary: string;
  ticker?: string[];
  hotspots: {
    event: string;
    impact: 'High' | 'Med' | 'Low';
    sector: 'Energy' | 'Tech' | 'Finance' | 'Commodities' | 'Security';
    analysis: string;
    lat: number;
    lng: number;
  }[];
  marketCorrelations: {
    assetClass: string;
    trend: 'Increasing' | 'Decreasing' | 'Stable';
    driver: string;
  }[];
  forecast: {
    scenarios: {
      type: 'Bullish' | 'Bearish' | 'Base Case';
      description: string;
      likelihood: string;
    }[];
    keyIndicator: string;
  };
  confidenceScore: number;
  confidenceReasoning: string;
  rawLog?: string;
  userId?: string;
}

export async function deletePulse(id: string): Promise<void> {
  const path = `pulses/${id}`;
  try {
    await deleteDoc(doc(db, 'pulses', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function runPulseOrchestration(
  onStatusUpdate: (status: AgentStatus) => void,
  forceRefresh: boolean = false,
  targetDate?: Date,
  userId?: string
): Promise<PulseData> {
  const MOCK_CURRENT_DATE = new Date('2026-02-28T14:10:00Z');
  const dateStr = targetDate ? targetDate.toISOString().split('T')[0] : MOCK_CURRENT_DATE.toISOString().split('T')[0];
  
  // Step 1: Scout
  onStatusUpdate({ agent: 'Scout', status: 'processing', message: `[MOCK_PROTO] Searching archival nodes for signal date: ${dateStr}...` });
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Cache check still exists but we do the dance first
  if (!forceRefresh) {
    const q = query(collection(db, 'pulses'), orderBy('date', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    const existing = snapshot.docs.find(d => d.data().date.startsWith(dateStr));
    
    if (existing) {
      onStatusUpdate({ agent: 'Synthesizer', status: 'processing', message: '[MOCK_PROTO] Retrieving historical correlation vectors...' });
      await new Promise(resolve => setTimeout(resolve, 500));
      onStatusUpdate({ agent: 'Oracle', status: 'complete', message: `Historical synthesis recovered: ${dateStr}` });
      return { ...existing.data(), id: existing.id } as PulseData;
    }
  }

  // Step 2: Synthesizer
  onStatusUpdate({ agent: 'Synthesizer', status: 'processing', message: '[MOCK_PROTO] Synthesizing correlation vectors from available nodes...' });
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 3: Oracle
  onStatusUpdate({ agent: 'Oracle', status: 'processing', message: '[MOCK_PROTO] Constructing Bayesian probabilistic forecasts...' });
  await new Promise(resolve => setTimeout(resolve, 600));

  // Pick from our 3 specific mock windows
  const targetMock = mockPulses.find(p => p.date?.split('T')[0] === dateStr) || 
                   mockPulses[Math.floor(Math.random() * mockPulses.length)];
  
  const finalPulse: PulseData = {
    ...targetMock,
    date: targetDate ? targetDate.toISOString() : MOCK_CURRENT_DATE.toISOString(),
    summary: `[MOCK_PROTO_RECOVERY] ${targetMock.summary}`,
  };

  if (userId) {
    finalPulse.userId = userId;
  }

  try {
    const docRef = await addDoc(collection(db, 'pulses'), {
      ...finalPulse,
      createdAt: serverTimestamp()
    });
    finalPulse.id = docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'pulses');
  }

  onStatusUpdate({ agent: 'Oracle', status: 'complete', message: 'Synthesis complete (Mock Archive Recovery Mode).' });
  return finalPulse;
}
