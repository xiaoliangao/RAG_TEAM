import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.tsx';
import HeroSection from './components/HeroSection.tsx';
import UploadView from './views/UploadView.tsx';
import QuizView from './views/QuizView.tsx';
import ReportView from './views/ReportView.tsx';
import ChatView from './views/ChatView.tsx';
import type {
  AppSettings,
  AppState,
  MaterialsResponse,
  Message,
  QuizHistoryEntry,
  QuizResult,
  QuizSessionState,
  TabType,
  UploadResponse,
} from './types';
import { UploadCloud, CheckSquare, BarChart2, MessageCircle, Menu } from 'lucide-react';
import { INITIAL_APP_STATE } from './constants';
import { fetchMaterials, uploadMaterial } from './api/client';

const createInitialQuizSession = (): QuizSessionState => ({
  stage: 'config',
  questions: [],
  answers: {},
  config: { choice: 3, boolean: 2, difficulty: 'medium' },
  selectedMaterial: 'auto',
  result: null,
});

const loadHistory = (): QuizHistoryEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('mltutor_quiz_history');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item?.id === 'string' && typeof item?.score === 'number');
    }
    return [];
  } catch {
    return [];
  }
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    ...INITIAL_APP_STATE,
    settings: { ...INITIAL_APP_STATE.settings },
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialsResponse | null>(null);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [quizSession, setQuizSession] = useState<QuizSessionState>(createInitialQuizSession);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    return loadHistory();
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('mltutor_quiz_history', JSON.stringify(quizHistory));
  }, [quizHistory]);

  const refreshMaterials = useCallback(async (): Promise<MaterialsResponse | null> => {
    try {
      setMaterialsError(null);
      const data = await fetchMaterials();
      const dedupe = (items: MaterialsResponse['builtins']) => {
        const seen = new Set<string>();
        return items.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      };
      const normalized: MaterialsResponse = {
        builtins: dedupe(data.builtins),
        uploaded: dedupe(data.uploaded),
      };
      setMaterials(normalized);
      setState(prev => ({
        ...prev,
        isKnowledgeBaseReady: (normalized.builtins.length + normalized.uploaded.length) > 0,
      }));
      return normalized;
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载教材失败';
      setMaterialsError(message);
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshMaterials();
  }, [refreshMaterials]);

  // Actions
  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setState(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  };

  const handleUpload = async (file: File): Promise<UploadResponse | null> => {
    if (!file) return null;
    setUploadError(null);
    setState(prev => ({ ...prev, isProcessing: true }));
    let uploadRes: UploadResponse | null = null;
    try {
      uploadRes = await uploadMaterial(file);
      const data = await refreshMaterials();
      if (data) {
        setState(prev => ({ ...prev, isKnowledgeBaseReady: true }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败，请重试';
      setUploadError(message);
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
    return uploadRes;
  };

  const handleLoadDefault = async () => {
    const data = await refreshMaterials();
    if (data) {
      setState(prev => ({ ...prev, isKnowledgeBaseReady: true, activeTab: 'quiz' }));
    }
  };

  const handleQuizFinish = (result: QuizResult) => {
    setQuizResult(result);
    setQuizSession((prev) => ({ ...prev, result }));
    const entry: QuizHistoryEntry = {
      id: Date.now().toString(),
      score: Number(result.scorePercentage.toFixed(2)),
      timestamp: Date.now(),
      label: new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
    setQuizHistory((prev) => {
      const next = [...prev, entry].slice(-12);
      return next;
    });
  };

  const handleAskAIFromReport = (question: string) => {
    setState(prev => ({ ...prev, activeTab: 'chat' }));
    setPendingQuestion(question);
  };

  const resetSystem = () => {
    setState({
      ...INITIAL_APP_STATE,
      settings: { ...INITIAL_APP_STATE.settings },
    });
    setMessages([]);
    setQuizResult(null);
    setUploadError(null);
    setMaterialsError(null);
    void refreshMaterials();
    setQuizSession(createInitialQuizSession());
  };
  const clearChat = () => setMessages([]);

  const TabButton = ({ id, label, icon: Icon }: { id: TabType, label: string, icon: React.ElementType }) => (
    <button
      onClick={() => setState(prev => ({ ...prev, activeTab: id }))}
      className={`relative flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-200 ${
        state.activeTab === id 
          ? 'bg-slate-900 text-white shadow-lg shadow-slate-200 transform scale-[1.02]' 
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon size={16} strokeWidth={2.5} />
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] selection:bg-indigo-100 selection:text-indigo-700">
      {/* Sidebar */}
      <Sidebar 
        state={state} 
        updateSettings={updateSettings}
        resetSystem={resetSystem}
        clearChat={clearChat}
      />

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-2 text-indigo-600">
          <span className="font-bold text-lg tracking-tight">MLTutor</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 hover:bg-slate-100 rounded-lg">
          <Menu size={24} className="text-slate-600" />
        </button>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 lg:ml-0 pt-24 lg:pt-10 overflow-x-hidden max-w-[1600px] mx-auto w-full">
        
        <HeroSection state={state} turns={messages.length / 2} />

        {/* Tabs Navigation */}
        <div className="flex justify-center lg:justify-start mb-8">
          <div className="bg-white p-1.5 rounded-full border border-slate-200/60 shadow-sm inline-flex gap-1 overflow-x-auto max-w-full scrollbar-hide">
            <TabButton id="upload" label="教材上传" icon={UploadCloud} />
            <TabButton id="quiz" label="智能测验" icon={CheckSquare} />
            <TabButton id="report" label="学习报告" icon={BarChart2} />
            <TabButton id="chat" label="AI 助教" icon={MessageCircle} />
          </div>
        </div>

        {/* View Content */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
          {state.activeTab === 'upload' && (
            <UploadView 
              isProcessing={state.isProcessing} 
              onUpload={handleUpload} 
              onLoadDefault={handleLoadDefault}
              kbReady={state.isKnowledgeBaseReady}
              errorMessage={uploadError || materialsError}
            />
          )}
          
          {state.activeTab === 'quiz' && (
            state.isKnowledgeBaseReady ? (
              <QuizView 
                onFinish={handleQuizFinish} 
                materials={materials}
                refreshMaterials={refreshMaterials}
                materialsError={materialsError}
                session={quizSession}
                updateSession={setQuizSession}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-dashed border-slate-200 text-center shadow-sm">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <CheckSquare className="text-slate-300" size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">出题引擎离线</h3>
                <p className="text-slate-500 max-w-md mt-2 mb-6">请先在“教材上传”页面加载学习资料，系统才能为您生成个性化测验。</p>
                <button 
                  onClick={() => setState(p => ({...p, activeTab: 'upload'}))} 
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-200"
                >
                  前往上传
                </button>
              </div>
            )
          )}

          {state.activeTab === 'report' && (
             <ReportView lastResult={quizResult} onAskAI={handleAskAIFromReport} history={quizHistory} />
          )}

          {state.activeTab === 'chat' && (
             <ChatView 
               messages={messages} 
               settings={state.settings}
               updateMessages={setMessages}
               pendingQuestion={pendingQuestion}
               onConsumePending={() => setPendingQuestion(null)}
             />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
