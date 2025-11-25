import React, { useEffect, useMemo, useState } from 'react';
import { Sliders, Play, Check, X, Award, RefreshCcw } from 'lucide-react';
import { generateQuiz, fetchWrongQuestions, submitQuizAnswers } from '../api/client';
import type {
  Material,
  MaterialsResponse,
  QuizQuestion,
  QuizResult,
  QuizSessionState,
  QuizSubmitRequestPayload,
} from '../types';

interface QuizViewProps {
  onFinish: (result: QuizResult) => void;
  materials: MaterialsResponse | null;
  refreshMaterials: () => Promise<MaterialsResponse | null>;
  materialsError?: string | null;
  session: QuizSessionState;
  updateSession: React.Dispatch<React.SetStateAction<QuizSessionState>>;
  currentMaterial: Material | null;
  selectedMaterialId: string | null;
}

const QuizView: React.FC<QuizViewProps> = ({
  onFinish,
  materials,
  refreshMaterials,
  materialsError,
  session,
  updateSession,
  currentMaterial,
  selectedMaterialId,
}) => {
  const { stage, questions, answers, config, result, mode } = session;
  const [quizError, setQuizError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedSnippet, setExpandedSnippet] = useState<number | null>(null);
  const [openExplanations, setOpenExplanations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!materials) {
      void refreshMaterials();
    }
  }, [materials, refreshMaterials]);

  const materialNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (materials) {
      materials.uploaded.forEach((mat) => { map[mat.id] = mat.name; });
      materials.builtins.forEach((mat) => { map[mat.id] = mat.name; });
    }
    return map;
  }, [materials]);
  const resolvedMaterialId = currentMaterial?.id ?? selectedMaterialId ?? null;
  const selectedMaterialName = currentMaterial?.name
    ? currentMaterial.name
    : (resolvedMaterialId ? (materialNameMap[resolvedMaterialId] ?? '未知教材') : '未选择教材');
  const formatSource = (item: QuizQuestion) => {
    if (item.chapter_title) return item.chapter_title;
    if (item.material_id && materialNameMap[item.material_id]) return materialNameMap[item.material_id];
    if (item.source) {
      const parts = item.source.split(/[\\/]/);
      return parts[parts.length - 1] || item.source;
    }
    return '未知教材';
  };

  const resolveOptions = (q: QuizQuestion): string[] => {
    if (q.options && q.options.length > 0) return q.options;
    if ((q.qtype ?? '').toLowerCase() === 'boolean') {
      return ['正确', '错误'];
    }
    return [];
  };

  const startQuiz = async () => {
    setQuizError(null);
    setExpandedSnippet(null);
    setIsGenerating(true);
    try {
      const totalCount = config.choice + config.boolean;
      if (mode === 'review') {
        const wrong = await fetchWrongQuestions({
          limit: Math.max(totalCount, 1),
          material_id: resolvedMaterialId,
        });
        if (!wrong.length) {
          throw new Error('暂未收集到错题，先完成一次测验吧');
        }
        updateSession(prev => ({
          ...prev,
          questions: wrong.slice(0, totalCount || wrong.length),
          stage: 'answering',
          answers: {},
          result: null,
        }));
        return;
      }
      const payload = {
        num_choice: config.choice,
        num_boolean: config.boolean,
        difficulty: config.difficulty,
        material_id: resolvedMaterialId,
      };
      const data = await generateQuiz(payload);
      if (!data.questions.length) {
        throw new Error('未获取到题目，请稍后再试');
      }
      updateSession(prev => ({
        ...prev,
        questions: data.questions,
        stage: 'answering',
        answers: {},
        result: null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成测验失败，请稍后重试';
      setQuizError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const submitQuiz = async () => {
    let correct = 0;
    const results = questions.map((q) => {
      const userAnswer = answers[q.id] ?? null;
      const normalizedUser = userAnswer?.trim().toLowerCase() ?? '';
      const normalizedCorrect = q.correct?.trim().toLowerCase() ?? '';
      const isCorrect = Boolean(normalizedUser && normalizedCorrect && normalizedUser === normalizedCorrect);
      if (isCorrect) correct++;
      return {
        questionId: q.id,
        isCorrect,
        userAnswer,
        correctAnswer: q.correct ?? undefined,
        questionText: q.stem ?? q.question,
        source: q.source,
        page: q.page,
        chapter_id: q.chapter_id ?? null,
        chapter_title: q.chapter_title,
        snippet: q.snippet,
      };
    });

    const res: QuizResult = {
      total: questions.length,
      correct,
      wrong: questions.length - correct,
      scorePercentage: questions.length ? (correct / questions.length) * 100 : 0,
      results,
      nextChapter: null,
    };

    const payload: QuizSubmitRequestPayload = {
      difficulty: config.difficulty,
      questions: questions.map((q) => ({
        ...q,
        stem: q.stem ?? q.question ?? '',
        user_answer: answers[q.id] ?? null,
        chapter_id: q.chapter_id ?? null,
      })),
      material_id: resolvedMaterialId,
      num_choice: config.choice,
      num_boolean: config.boolean,
      mode: mode === 'review' ? 'review' : 'standard',
    };

    setIsSubmitting(true);
    try {
      const serverRes = await submitQuizAnswers(payload);
      res.nextChapter = serverRes.next_chapter ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : '记录测验失败（不影响结果展示）';
      setQuizError(message);
    } finally {
      setIsSubmitting(false);
    }

    updateSession(prev => ({
      ...prev,
      result: res,
      stage: 'result',
    }));
    onFinish(res);
  };

  const answeredCount = Object.keys(answers).length;
  const progressPercent = questions.length ? (answeredCount / questions.length) * 100 : 0;

  if (stage === 'config') {
    return (
      <div className="max-w-5xl mx-auto mt-10">
        <div className="glass-panel rounded-[2rem] border border-white/70 shadow-xl shadow-indigo-100/60 p-10 min-h-[520px]">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Sliders size={28} />
            </div>
            <div>
                <h2 className="text-2xl font-semibold text-slate-900">测验配置</h2>
                <p className="text-slate-500 font-medium">定制您的专属练习参数</p>
            </div>
          </div>

          <div className="space-y-8 mb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white/70 p-5 rounded-2xl border border-white/70 shadow-sm">
                  <label className="text-sm font-bold text-slate-700 mb-3 block">选择题数量</label>
                  <div className="flex items-center gap-4">
                      <input 
                          type="range" min="1" max="10" 
                          value={config.choice}
                          onChange={(e) => updateSession(prev => ({
                            ...prev,
                            config: { ...prev.config, choice: parseInt(e.target.value) }
                          }))}
                          className="flex-1"
                      />
                      <span className="w-10 h-10 flex items-center justify-center font-bold text-indigo-600 bg-white rounded-xl shadow-sm border border-slate-100">{config.choice}</span>
                  </div>
              </div>

              <div className="bg-white/70 p-5 rounded-2xl border border-white/70 shadow-sm">
                  <label className="text-sm font-bold text-slate-700 mb-3 block">判断题数量</label>
                  <div className="flex items-center gap-4">
                      <input 
                          type="range" min="1" max="10" 
                          value={config.boolean}
                          onChange={(e) => updateSession(prev => ({
                            ...prev,
                            config: { ...prev.config, boolean: parseInt(e.target.value) }
                          }))}
                          className="flex-1"
                      />
                      <span className="w-10 h-10 flex items-center justify-center font-bold text-indigo-600 bg-white rounded-xl shadow-sm border border-slate-100">{config.boolean}</span>
                  </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-700 mb-4 block">难度等级</label>
              <div className="grid grid-cols-3 gap-4">
                  {[
                      { id: 'easy', label: '🟢 基础' },
                      { id: 'medium', label: '🟡 进阶' },
                      { id: 'hard', label: '🔴 挑战' }
                  ].map((level) => (
                      <button
                          key={level.id}
                          onClick={() => updateSession(prev => ({
                            ...prev,
                            config: { ...prev.config, difficulty: level.id as 'easy' | 'medium' | 'hard' }
                          }))}
                          className={`py-4 rounded-2xl text-sm font-bold border transition-all duration-200 ${config.difficulty === level.id ? 'border-indigo-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200' : 'border-white/70 hover:border-indigo-300 text-slate-600 bg-white/70'}`}
                      >
                          {level.label}
                      </button>
                  ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-700 mb-3 block">测验模式</label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'standard', label: '标准出题' },
                  { id: 'review', label: '错题重做' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => updateSession(prev => ({ ...prev, mode: item.id as 'standard' | 'review' }))}
                    className={`py-4 rounded-2xl text-sm font-bold border transition-all duration-200 ${
                      mode === item.id ? 'border-indigo-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200' : 'border-white/70 hover:border-indigo-300 text-slate-600 bg-white/70'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {mode === 'review' && (
                <p className="text-xs text-amber-600 mt-2">将从当前教材的历史错题中抽取试题。</p>
              )}
            </div>

            <div className="bg-white/70 p-5 rounded-2xl border border-white/70 shadow-sm">
              <label className="text-sm font-bold text-slate-700 mb-3 block">当前学习范围</label>
              <div className="text-sm text-slate-700 space-y-1">
                <p>教材：<span className="font-semibold text-slate-900">{selectedMaterialName}</span></p>
              </div>
              <p className="text-xs text-slate-400 mt-3">系统会基于整本教材生成题目与错题重练。</p>
              {materialsError && (
                <p className="text-xs text-rose-600 mt-2">{materialsError}</p>
              )}
            </div>
          </div>

          {quizError && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-700">
              {quizError}
            </div>
          )}

          <button 
            onClick={startQuiz}
            disabled={isGenerating}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-2xl font-bold text-lg hover:shadow-lg hover:shadow-indigo-200 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            <Play size={20} fill="currentColor" />
            {isGenerating ? '正在生成...' : '生成测验'}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'answering') {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Progress Header */}
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/70 shadow-sm sticky top-4 z-20">
            <div className="flex items-center gap-4 px-2">
                <div className="h-2 w-32 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-sm font-bold text-slate-600">已答 {answeredCount} / {questions.length}</span>
            </div>
            <button 
              onClick={() => void submitQuiz()} 
              disabled={answeredCount !== questions.length || isSubmitting}
              className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-indigo-200 disabled:opacity-50 transition-all shadow-sm shadow-indigo-200"
            >
                {isSubmitting ? '提交中...' : '提交答案'}
            </button>
        </div>

        {questions.map((q, idx) => {
          const options = resolveOptions(q);
          return (
            <div key={q.id} className="glass-panel p-8 rounded-[2rem] border border-white/70 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-lg text-white shadow-sm ${(q.qtype ?? q.type) === 'boolean' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                      {(q.qtype ?? q.type) === 'boolean' ? '判断题' : '选择题'}
                  </span>
                  <span className="text-slate-400 text-sm font-bold">第 {idx + 1} 题</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-8 leading-relaxed">{q.stem ?? q.question}</h3>
              
              <div className="space-y-3">
                  {options.map((opt) => (
                      <label 
                          key={opt}
                          className={`flex items-center p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 group ${
                            answers[q.id] === opt 
                              ? 'border-indigo-600 bg-indigo-50/30 shadow-sm' 
                              : 'border-slate-100 bg-slate-50 hover:bg-white hover:border-indigo-200'
                          }`}
                      >
                          <input 
                              type="radio" 
                              name={`q-${q.id}`} 
                              className="hidden"
                            checked={answers[q.id] === opt}
                            onChange={() => updateSession(prev => ({
                              ...prev,
                              answers: { ...prev.answers, [q.id]: opt }
                            }))}
                          />
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 transition-colors ${
                            answers[q.id] === opt ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 group-hover:border-indigo-300'
                          }`}>
                              {answers[q.id] === opt && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                          </div>
                          <span className={`font-medium text-base ${answers[q.id] === opt ? 'text-indigo-900' : 'text-slate-700'}`}>{opt}</span>
                      </label>
                  ))}
                  {!options.length && (
                    <div className="text-sm text-slate-500">
                      此题为开放题，请输入答案：
                      <input 
                        type="text"
                        value={answers[q.id] ?? ''}
                        onChange={(e) => updateSession(prev => ({
                          ...prev,
                          answers: { ...prev.answers, [q.id]: e.target.value }
                        }))}
                        className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/50 overflow-hidden mb-10">
            <div className="relative p-10 text-center overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-800 text-white">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_45%),radial-gradient(circle_at_80%_0,rgba(129,140,248,0.18),transparent_35%)]" />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -bottom-16 left-1/2 w-80 h-80 -translate-x-1/2 bg-indigo-500/20 blur-[90px]" />
                </div>
                <div className="relative z-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/10 backdrop-blur-md mb-6 border border-white/20 shadow-lg shadow-indigo-500/30">
                        <Award size={40} className="text-yellow-300 drop-shadow-md" />
                    </div>
                    <h2 className="text-4xl font-bold mb-2 tracking-tight">测验完成！</h2>
                    <p className="text-indigo-100 font-medium text-lg">以下是您的详细表现报告</p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100 border-b border-slate-100">
                {[
                    { label: '最终得分', val: result ? `${result.scorePercentage.toFixed(0)}` : '-', color: 'text-indigo-600' },
                    { label: '答对题数', val: result?.correct ?? '-', color: 'text-emerald-600' },
                    { label: '错题数', val: result?.wrong ?? '-', color: 'text-rose-700' },
                    { label: '总题数', val: result?.total ?? '-', color: 'text-slate-900' }
                ].map((stat, i) => (
                    <div key={i} className="text-center p-6 bg-white group hover:bg-slate-50 transition-colors">
                        <div className="text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">{stat.label}</div>
                        <div className={`text-3xl font-black tracking-tight ${stat.color}`}>{stat.val}</div>
                    </div>
                ))}
            </div>

            {quizError && (
              <div className="mx-10 my-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {quizError}
              </div>
            )}

            <div className="p-10 bg-slate-50/50">
                <h3 className="font-bold text-slate-900 text-xl mb-8 flex items-center gap-2">
                  详细解析
                </h3>
                <div className="space-y-8">
                    {questions.map((q) => {
                        const res = result?.results.find(r => r.questionId === q.id);
                        const isCorrect = res?.isCorrect;
                        const options = resolveOptions(q);

                        const expanded = openExplanations[q.id] ?? false;
                        return (
                            <div key={q.id} className={`bg-white rounded-2xl border p-6 transition-shadow hover:shadow-md ${isCorrect ? 'border-emerald-100 shadow-sm' : 'border-rose-100 shadow-sm'}`}>
                                <div className="flex items-start gap-4 mb-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCorrect ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-700'}`}>
                                        {isCorrect ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 text-lg">{q.stem ?? q.question}</h4>
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {options.map((opt) => {
                                                const isRight = (q.correct ?? '').trim().toLowerCase() === opt.trim().toLowerCase();
                                                const isUser = res?.userAnswer?.trim().toLowerCase() === opt.trim().toLowerCase();
                                                let style = "border-slate-200 bg-white text-slate-600 hover:border-indigo-100";
                                                let icon: React.ReactNode = null;
                                                if (isRight) {
                                                  style = "border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold shadow-[0_6px_18px_-10px_rgba(16,185,129,0.8)]";
                                                  icon = <Check size={14} />;
                                                }
                                                if (isUser && !isRight) {
                                                  style = "border-rose-200 bg-rose-50 text-rose-700 font-semibold shadow-[0_6px_18px_-10px_rgba(244,63,94,0.15)]";
                                                  icon = <X size={14} />;
                                                }
                                                
                                                return (
                                                    <span key={opt} className={`inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-all ${style}`}>
                                                        {icon}
                                                        {opt}
                                                    </span>
                                                );
                                            })}
                                            {!options.length && (
                                              <span className="text-sm text-slate-500">参考答案：{q.correct ?? '暂无'}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {q.explanation && (
                                  <div className="mt-4 ml-12 space-y-3">
                                    <button
                                      onClick={() => setOpenExplanations(prev => ({ ...prev, [q.id]: !expanded }))}
                                      className="text-sm font-semibold text-indigo-600 flex items-center gap-1 hover:underline"
                                    >
                                      {expanded ? '收起解析' : '查看解析'}
                                    </button>
                                    {expanded && (
                                      <div className="p-5 bg-slate-50/80 rounded-xl text-sm text-slate-700 leading-relaxed border border-indigo-100 shadow-sm">
                                        <span className="font-bold text-indigo-900 block mb-2">解析</span>
                                        {q.explanation}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {(q.snippet || q.page) && (
                                  <div className="mt-4 ml-12 space-y-3">
                                    <button
                                      onClick={() => setExpandedSnippet(expandedSnippet === q.id ? null : q.id)}
                                      className="text-sm font-semibold text-indigo-600 flex items-center gap-1 hover:underline"
                                    >
                                      {expandedSnippet === q.id ? '收起教材原文' : '查看教材原文'}
                                    </button>
                                    {expandedSnippet === q.id && (
                                      <div className="p-4 bg-white border border-indigo-100 rounded-2xl text-sm text-slate-700 shadow-sm">
                                        <div className="font-bold text-slate-900 mb-1">{formatSource(q)}</div>
                                        {q.page && <div className="text-xs text-slate-500 mb-2">页码：{q.page}</div>}
                                        {q.snippet && <p className="whitespace-pre-line leading-relaxed">{q.snippet}</p>}
                                      </div>
                                    )}
                                  </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            
            <div className="p-8 border-t border-slate-200 flex justify-center bg-white">
                <button
                  onClick={() => {
                    updateSession(prev => ({
                      ...prev,
                      stage: 'config',
                      result: null,
                      questions: [],
                      answers: {},
                    }));
                  }}
                  className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold rounded-2xl hover:shadow-lg hover:shadow-indigo-200 hover:-translate-y-1 transition-all flex items-center gap-2"
                >
                    <RefreshCcw size={18} /> 开始新的练习
                </button>
            </div>
        </div>
    </div>
  );
};

export default QuizView;
