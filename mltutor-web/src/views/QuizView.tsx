import React, { useEffect, useMemo, useState } from 'react';
import { Sliders, Play, Check, X, Award, RefreshCcw, BookOpen } from 'lucide-react';
import { generateQuiz } from '../api/client';
import type { MaterialsResponse, QuizQuestion, QuizResult, QuizSessionState } from '../types';

interface QuizViewProps {
  onFinish: (result: QuizResult) => void;
  materials: MaterialsResponse | null;
  refreshMaterials: () => Promise<MaterialsResponse | null>;
  materialsError?: string | null;
  session: QuizSessionState;
  updateSession: React.Dispatch<React.SetStateAction<QuizSessionState>>;
}

const QuizView: React.FC<QuizViewProps> = ({ onFinish, materials, refreshMaterials, materialsError, session, updateSession }) => {
  const { stage, questions, answers, config, selectedMaterial, result } = session;
  const [quizError, setQuizError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!materials) {
      void refreshMaterials();
    }
  }, [materials, refreshMaterials]);

  const materialOptions = useMemo(() => {
    if (!materials) return [];
    return [
      ...materials.uploaded.map((mat) => ({ id: mat.id, label: `${mat.name}（上传）` })),
      ...materials.builtins.map((mat) => ({ id: mat.id, label: `${mat.name}（内置）` })),
    ];
  }, [materials]);

  const resolveOptions = (q: QuizQuestion): string[] => {
    if (q.options && q.options.length > 0) return q.options;
    if ((q.qtype ?? '').toLowerCase() === 'boolean') {
      return ['正确', '错误'];
    }
    return [];
  };

  const startQuiz = async () => {
    setQuizError(null);
    setIsGenerating(true);
    try {
      const payload = {
        num_choice: config.choice,
        num_boolean: config.boolean,
        difficulty: config.difficulty,
        material_id: selectedMaterial === 'auto' ? undefined : selectedMaterial,
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

  const submitQuiz = () => {
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
      };
    });

    const res: QuizResult = {
      total: questions.length,
      correct,
      wrong: questions.length - correct,
      scorePercentage: questions.length ? (correct / questions.length) * 100 : 0,
      results,
    };

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
      <div className="max-w-2xl mx-auto mt-10">
        <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-xl shadow-slate-200/40 p-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                <Sliders size={28} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-900">测验配置</h2>
                <p className="text-slate-500 font-medium">定制您的专属练习参数</p>
            </div>
          </div>

          <div className="space-y-8 mb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
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

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
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
                          className={`py-4 rounded-2xl text-sm font-bold border transition-all duration-200 ${config.difficulty === level.id ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'border-slate-200 hover:border-indigo-300 text-slate-600 bg-white'}`}
                      >
                          {level.label}
                      </button>
                  ))}
              </div>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <label className="text-sm font-bold text-slate-700 mb-3 block">出题教材</label>
              <div className="space-y-3">
                <select
                  value={selectedMaterial}
                  onChange={(e) => updateSession(prev => ({ ...prev, selectedMaterial: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                >
                  <option value="auto">自动选择（最近上传优先）</option>
                  {materialOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
                {!materials && (
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    <BookOpen size={14} /> 正在获取教材...
                  </p>
                )}
                {materialsError && (
                  <p className="text-xs text-red-500">{materialsError}</p>
                )}
              </div>
            </div>
          </div>

          {quizError && (
            <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {quizError}
            </div>
          )}

          <button 
            onClick={startQuiz}
            disabled={isGenerating}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 disabled:opacity-60 disabled:hover:translate-y-0"
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
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-4 z-20">
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
              onClick={submitQuiz} 
              disabled={answeredCount !== questions.length}
              className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-sm shadow-indigo-200"
            >
                提交答案
            </button>
        </div>

        {questions.map((q, idx) => {
          const options = resolveOptions(q);
          return (
            <div key={q.id} className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
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
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl shadow-slate-200/50 overflow-hidden mb-10">
            <div className="bg-slate-900 p-10 text-white text-center relative overflow-hidden">
                <div className="relative z-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/10 backdrop-blur-md mb-6 border border-white/20 shadow-lg">
                        <Award size={40} className="text-yellow-400 drop-shadow-md" />
                    </div>
                    <h2 className="text-4xl font-bold mb-2 tracking-tight">测验完成！</h2>
                    <p className="text-slate-400 font-medium text-lg">以下是您的详细表现报告</p>
                </div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/4 pointer-events-none"></div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100 border-b border-slate-100">
                {[
                    { label: '最终得分', val: result ? `${result.scorePercentage.toFixed(0)}` : '-', color: 'text-indigo-600' },
                    { label: '答对题数', val: result?.correct ?? '-', color: 'text-emerald-600' },
                    { label: '错题数', val: result?.wrong ?? '-', color: 'text-red-600' },
                    { label: '总题数', val: result?.total ?? '-', color: 'text-slate-900' }
                ].map((stat, i) => (
                    <div key={i} className="text-center p-6 bg-white group hover:bg-slate-50 transition-colors">
                        <div className="text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">{stat.label}</div>
                        <div className={`text-3xl font-black tracking-tight ${stat.color}`}>{stat.val}</div>
                    </div>
                ))}
            </div>

            <div className="p-10 bg-slate-50/50">
                <h3 className="font-bold text-slate-900 text-xl mb-8 flex items-center gap-2">
                  详细解析
                </h3>
                <div className="space-y-8">
                    {questions.map((q) => {
                        const res = result?.results.find(r => r.questionId === q.id);
                        const isCorrect = res?.isCorrect;
                        const options = resolveOptions(q);

                        return (
                            <div key={q.id} className={`bg-white rounded-2xl border p-6 transition-shadow hover:shadow-md ${isCorrect ? 'border-emerald-100 shadow-sm' : 'border-red-100 shadow-sm'}`}>
                                <div className="flex items-start gap-4 mb-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCorrect ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                        {isCorrect ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 text-lg">{q.stem ?? q.question}</h4>
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {options.map((opt) => {
                                                const isRight = (q.correct ?? '').trim().toLowerCase() === opt.trim().toLowerCase();
                                                const isUser = res?.userAnswer?.trim().toLowerCase() === opt.trim().toLowerCase();
                                                let style = "bg-slate-50 text-slate-500 border-slate-100";
                                                if (isRight) style = "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold ring-1 ring-emerald-200";
                                                if (isUser && !isRight) style = "bg-red-50 text-red-700 border-red-200 font-bold ring-1 ring-red-200 line-through decoration-2";
                                                
                                                return (
                                                    <span key={opt} className={`text-sm px-4 py-2 rounded-lg border ${style}`}>
                                                        {opt} {isRight && "✓"}
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
                                  <div className="mt-4 ml-12 p-5 bg-slate-50/80 rounded-xl text-sm text-slate-700 leading-relaxed border-l-4 border-indigo-400">
                                      <span className="font-bold text-indigo-900 block mb-1">💡 解析：</span> 
                                      {q.explanation}
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
                  className="px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 hover:shadow-lg hover:-translate-y-1 transition-all flex items-center gap-2"
                >
                    <RefreshCcw size={18} /> 开始新的练习
                </button>
            </div>
        </div>
    </div>
  );
};

export default QuizView;
