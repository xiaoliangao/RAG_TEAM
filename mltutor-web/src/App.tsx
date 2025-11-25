import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.tsx';
import HeroSection from './components/HeroSection.tsx';
import UploadView from './views/UploadView.tsx';
import QuizView from './views/QuizView.tsx';
import ReportView from './views/ReportView.tsx';
import ChatView from './views/ChatView.tsx';
import type {
  AppSettings,
  AppState,
  Material,
  MaterialsResponse,
  Message,
  QuizHistoryEntry,
  QuizResult,
  QuizSessionState,
  TabType,
  UploadResponse,
} from './types';
import { UploadCloud, CheckSquare, BarChart2, MessageCircle, Menu, X } from 'lucide-react';
import { INITIAL_APP_STATE } from './constants';
import { fetchMaterials, uploadMaterial } from './api/client';

const createInitialQuizSession = (): QuizSessionState => ({
  stage: 'config',
  questions: [],
  answers: {},
  config: { choice: 3, boolean: 2, difficulty: 'medium' },
  mode: 'standard',
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const currentMaterial = useMemo<Material | null>(() => {
    if (!materials || !state.selectedMaterialId) return null;
    const combined = [...materials.uploaded, ...materials.builtins];
    return combined.find((mat) => mat.id === state.selectedMaterialId) ?? null;
  }, [materials, state.selectedMaterialId]);

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
      const allIds = [...normalized.builtins, ...normalized.uploaded].map(m => m.id);
      setState(prev => {
        const currentValid = prev.selectedMaterialId && allIds.includes(prev.selectedMaterialId)
          ? prev.selectedMaterialId
          : (normalized.uploaded[0]?.id ?? normalized.builtins[0]?.id ?? prev.selectedMaterialId ?? null);
        return {
          ...prev,
          selectedMaterialId: currentValid,
          isKnowledgeBaseReady: (normalized.builtins.length + normalized.uploaded.length) > 0,
        };
      });
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

  const handleSelectMaterial = (materialId: string | null) => {
    setState(prev => ({
      ...prev,
      selectedMaterialId: materialId,
    }));
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
      className={`relative flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-200 border ${
        state.activeTab === id 
          ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200 border-indigo-200' 
          : 'text-slate-600 hover:bg-white/80 hover:text-slate-900 border-white/60'
      }`}
    >
      <Icon size={16} strokeWidth={2.5} />
      {label}
    </button>
  );

  const SettingToggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!checked)}
      className={`w-12 h-6 rounded-full relative transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`}
    >
      <span
        className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 shadow-sm ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  );

  return (
    <div className="relative min-h-screen bg-transparent selection:bg-indigo-100 selection:text-indigo-700 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-24 w-96 h-96 bg-indigo-100/60 blur-3xl" />
        <div className="absolute right-[-12%] top-10 w-[420px] h-[420px] bg-violet-100/60 blur-3xl" />
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[520px] h-[520px] bg-cyan-100/40 blur-3xl" />
      </div>
      <div className="flex min-h-screen relative z-10 gap-6 px-4 lg:px-8">
        {/* Sidebar */}
        <Sidebar 
          resetSystem={resetSystem}
          clearChat={clearChat}
          activeTab={state.activeTab}
          onChangeTab={(tab) => setState(prev => ({ ...prev, activeTab: tab }))}
          onOpenSettings={() => setSettingsOpen(true)}
          currentMaterial={currentMaterial}
          isKnowledgeBaseReady={state.isKnowledgeBaseReady}
          turns={messages.length / 2}
        />

        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 bg-white/70 backdrop-blur-xl border-b border-white/60 p-4 flex justify-between items-center z-50 shadow-sm shadow-slate-200/60">
          <div className="flex items-center gap-2 text-indigo-600">
            <span className="font-bold text-lg tracking-tight">MLTutor</span>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <Menu size={24} className="text-slate-600" />
          </button>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8 lg:ml-0 pt-24 lg:pt-10 overflow-x-hidden max-w-[1600px] mx-auto w-full">
        <div className="lg:hidden mb-6">
          <HeroSection 
            isKnowledgeBaseReady={state.isKnowledgeBaseReady} 
            currentMaterial={currentMaterial}
            turns={messages.length / 2}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {/* Mobile Controls */}
        <div className="lg:hidden space-y-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">当前教材</p>
              <span className={`w-2 h-2 rounded-full ${state.isKnowledgeBaseReady ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            </div>
            <select
              value={state.selectedMaterialId ?? ''}
              onChange={(e) => handleSelectMaterial(e.target.value || null)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">未选择教材</option>
              {materials && (
                [...materials.uploaded, ...materials.builtins].map((mat) => (
                  <option key={mat.id} value={mat.id}>
                    {mat.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              <TabButton id="upload" label="教材上传" icon={UploadCloud} />
              <TabButton id="quiz" label="智能测验" icon={CheckSquare} />
              <TabButton id="report" label="学习报告" icon={BarChart2} />
              <TabButton id="chat" label="AI 助教" icon={MessageCircle} />
            </div>
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
              materials={materials}
              selectedMaterialId={state.selectedMaterialId}
              onSelectMaterial={handleSelectMaterial}
              currentMaterial={currentMaterial}
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
                currentMaterial={currentMaterial}
                selectedMaterialId={state.selectedMaterialId}
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
             <ReportView 
               lastResult={quizResult} 
               onAskAI={handleAskAIFromReport} 
               history={quizHistory}
               currentMaterial={currentMaterial}
             />
          )}

          {state.activeTab === 'chat' && (
             <ChatView 
               messages={messages} 
               settings={state.settings}
               updateMessages={setMessages}
               pendingQuestion={pendingQuestion}
               onConsumePending={() => setPendingQuestion(null)}
               currentMaterial={currentMaterial}
             />
          )}
        </div>
      </main>
      </div>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-lg glass-panel rounded-3xl shadow-2xl p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">系统设置</h3>
                <p className="text-sm text-slate-500">调整检索与生成参数，影响聊天与测验行为。</p>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="p-2 rounded-full hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">启用查询扩展</p>
                  <p className="text-xs text-slate-500">自动生成相关问题提升覆盖率</p>
                </div>
                <SettingToggle
                  checked={state.settings.queryExpansion}
                  onChange={(v) => updateSettings('queryExpansion', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Few-shot 示例</p>
                  <p className="text-xs text-slate-500">参考标准答案以优化输出风格</p>
                </div>
                <SettingToggle
                  checked={state.settings.useFewShot}
                  onChange={(v) => updateSettings('useFewShot', v)}
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold text-slate-800">检索文档数 (Top-K)</span>
                  <span className="text-indigo-600 font-bold">{state.settings.kDocuments} 篇</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="8"
                  value={state.settings.kDocuments}
                  onChange={(e) => updateSettings('kDocuments', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold text-slate-800">随机性 (Temperature)</span>
                  <span className="text-indigo-600 font-bold">{state.settings.temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.1"
                  value={state.settings.temperature}
                  onChange={(e) => updateSettings('temperature', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-indigo-200 transition-all"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
