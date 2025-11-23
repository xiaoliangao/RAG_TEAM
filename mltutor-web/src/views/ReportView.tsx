import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Download, ArrowRight, BrainCircuit, Target, TrendingUp, Check, X, RefreshCw } from 'lucide-react';
import { fetchReportOverview, chat } from '../api/client';
import type { QuizHistoryEntry, QuizResult, StudyReportOverview, ChatRequest } from '../types';

interface ReportViewProps {
  lastResult: QuizResult | null;
  onAskAI: (question: string) => void;
  history: QuizHistoryEntry[];
}

const extractTopic = (input?: string | null) => {
  if (!input) return null;
  const chapterMatch = input.match(/第[一二三四五六七八九十百千0-9]+章[^，。；：]*/);
  if (chapterMatch) {
    return chapterMatch[0].replace(/[:：]/g, '').trim();
  }
  const split = input.split(/[:：]/);
  const candidate = split.length > 1 ? split[split.length - 1] : split[0];
  const cleaned = candidate.replace(/[（）()]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 16);
};

const ReportView: React.FC<ReportViewProps> = ({ lastResult, onAskAI, history }) => {
  const [report, setReport] = useState<StudyReportOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [analysisTopics, setAnalysisTopics] = useState<string[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReportOverview();
      setReport(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '报告加载失败，请稍后再试';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (lastResult) {
      void loadOverview();
    }
  }, [lastResult, loadOverview]);

  useEffect(() => {
    let cancelled = false;
    const runAnalysis = async () => {
      if (!lastResult || !lastResult.results.length) {
        setAnalysisTopics([]);
        setAnalysisError(null);
        return;
      }
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const questionSummary = lastResult.results
          .map((res, idx) => {
            const tag = res.isCorrect ? '正确' : '错误';
            return `题目${idx + 1}（${tag}）: ${res.questionText ?? ''}`;
          })
          .join('\n');
        const prompt = `你是学习报告分析助手。请根据以下题目表现，列出 2-4 个需要强化的章节或核心知识点。只返回 JSON，格式如 {"topics":["知识点1","知识点2"]}，不写其他内容。\n\n题目信息：\n${questionSummary}`;

        const request: ChatRequest = {
          question: prompt,
          temperature: 0.1,
          k: 3,
          enable_expansion: false,
          use_fewshot: false,
          use_multi_turn: false,
          history: [],
        };

        const res = await chat(request);
        const match = res.answer.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]) as { topics?: string[] };
            if (!cancelled) {
              setAnalysisTopics(Array.isArray(parsed.topics) ? parsed.topics.filter(Boolean) : []);
            }
          } catch {
            if (!cancelled) {
              setAnalysisTopics([]);
              setAnalysisError('知识点分析结果格式错误');
            }
          }
        } else if (!cancelled) {
          setAnalysisTopics([]);
          setAnalysisError('未能解析知识点建议');
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : '知识点分析失败';
          setAnalysisError(message);
          setAnalysisTopics([]);
        }
      } finally {
        if (!cancelled) {
          setAnalysisLoading(false);
        }
      }
    };
    void runAnalysis();
    return () => {
      cancelled = true;
    };
  }, [lastResult]);

  const handleExportPDF = () => {
    if (!containerRef.current) return;
    setExporting(true);
    const printWindow = window.open('', '_blank', 'width=1024,height=768');
    if (!printWindow) {
      setExporting(false);
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>MLTutor 学习报告</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 24px; color: #0f172a; }
            h1, h2, h3, h4 { margin-bottom: 12px; }
            .section { margin-bottom: 24px; }
          </style>
        </head>
        <body>${containerRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setTimeout(() => {
      printWindow.close();
      setExporting(false);
    }, 500);
  };

  const overview = report?.overview;
  const derivedOverview = useMemo(() => {
    if (!history.length) return null;
    const total = history.reduce((sum, item) => sum + item.score, 0);
    const best = Math.max(...history.map((h) => h.score));
    const recent = history[history.length - 1]?.score ?? 0;
    return {
      attempts: history.length,
      average_score: Number((total / history.length).toFixed(2)),
      best_score: Number(best.toFixed(2)),
      recent_score: Number(recent.toFixed(2)),
    };
  }, [history]);

  const displayStats = history.length ? (derivedOverview ?? overview) : overview;
  const focusTopics = report?.focus_topics ?? [];

  const derivedTopics = useMemo(() => {
    if (!lastResult) return [];
    const tags: string[] = [];
    lastResult.results.forEach((res) => {
      if (res.isCorrect) return;
      const fromQuestion = extractTopic(res.questionText);
      const fromAnswer = extractTopic(res.correctAnswer);
      [fromQuestion, fromAnswer].forEach((topic) => {
        if (topic && !tags.includes(topic)) {
          tags.push(topic);
        }
      });
    });
    return tags.slice(0, 4);
  }, [lastResult]);

  const fallbackTopics = useMemo(() => {
    if (!lastResult) return [];
    const tokens = lastResult.results
      .map((res) => res.questionText?.trim().slice(0, 12))
      .filter((text): text is string => Boolean(text));
    return Array.from(new Set(tokens)).slice(0, 4);
  }, [lastResult]);

  const displayTopics = analysisTopics.length
    ? analysisTopics
    : (derivedTopics.length
        ? derivedTopics
        : (focusTopics.length ? focusTopics : fallbackTopics));

  const mergedHistory = useMemo(() => {
    if (history.length) {
      return history.map((entry) => ({
        date: entry.label,
        score: entry.score,
      }));
    }
    if (overview) {
      return [
        { date: '平均成绩', score: overview.average_score },
        { date: '历史最佳', score: overview.best_score },
        { date: '最近一次', score: overview.recent_score },
      ];
    }
    return [];
  }, [history, overview]);

  const feedbackParagraphs = useMemo(() => {
    if (!displayStats) return [];
    const base: string[] = [
      `您共完成 ${displayStats.attempts} 次练习，平均得分 ${displayStats.average_score.toFixed(1)}，最好成绩 ${displayStats.best_score.toFixed(1)} 分。`,
      `最近一次测验得分为 ${displayStats.recent_score.toFixed(1)}，建议继续保持稳定练习节奏。`,
    ];
    if (focusTopics.length) {
      base.push(`当前系统建议重点复习：${focusTopics.join('、')}。针对这些主题多做总结和推导，可显著提升分数。`);
    }
    return base;
  }, [displayStats, focusTopics]);

  const actionSuggestions = useMemo(() => {
    if (displayTopics.length) {
      return displayTopics.slice(0, 3).map((topic) => `如何进一步巩固 ${topic}？`);
    }
    return ["解释梯度消失问题", "什么是 Softmax 函数？", "损失函数如何选择？"];
  }, [displayTopics]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500" ref={containerRef}>
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm font-medium text-indigo-600">
          正在同步学习报告...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-8">
             <div>
               <h3 className="font-bold text-slate-900 text-lg">知识点掌握度</h3>
               <p className="text-sm text-slate-500">聚焦的薄弱环节</p>
             </div>
             <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Target size={20}/></div>
          </div>
          {analysisLoading && (
            <div className="text-xs text-slate-400 mb-4">正在分析知识点...</div>
          )}
          {analysisError && (
            <div className="text-xs text-red-500 mb-4">{analysisError}</div>
          )}
          {displayTopics.length ? (
            <div className="flex flex-wrap gap-3">
              {displayTopics.map((topic) => (
                <span key={topic} className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-semibold border border-indigo-100">
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl">
              暂无重点知识点数据
            </div>
          )}
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-8">
             <div>
               <h3 className="font-bold text-slate-900 text-lg">学习曲线</h3>
               <p className="text-sm text-slate-500">近期测验得分趋势</p>
             </div>
             <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp size={20}/></div>
          </div>
          <div className="h-72 w-full">
            {mergedHistory.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mergedHistory}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12, fontWeight: 500}} dy={10} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} />
                  <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px'}} />
                  <Area type="monotone" dataKey="score" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl">
                暂无成绩数据
              </div>
            )}
          </div>
            {displayStats && (
            <div className="grid grid-cols-2 gap-4 mt-6">
              {[
                { label: '累计测验', value: displayStats.attempts },
                { label: '平均得分', value: displayStats.average_score.toFixed(1) },
                { label: '最佳成绩', value: displayStats.best_score.toFixed(1) },
                { label: '最近一次', value: displayStats.recent_score.toFixed(1) },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm font-semibold text-slate-600 flex items-center justify-between">
                  <span>{item.label}</span>
                  <span className="text-slate-900">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
        <div className="bg-slate-900 p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-indigo-200 mb-3 border border-white/10">
                    <BrainCircuit size={14}/> AI 导师
                </div>
                <h3 className="text-2xl font-bold">智能诊断报告</h3>
                <p className="text-slate-400 mt-1">基于测验结果的深度分析</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => loadOverview()}
                className="bg-white/10 border border-white/20 text-white hover:bg-white/20 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="bg-white text-slate-900 hover:bg-slate-100 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 shadow-lg disabled:opacity-70"
              >
                <Download size={16} /> {exporting ? '生成中...' : '导出 PDF'}
              </button>
            </div>
        </div>
        
        <div className="p-10">
            <div className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-600 prose-p:leading-relaxed">
                {feedbackParagraphs.length ? (
                  feedbackParagraphs.map((paragraph, idx) => (
                    <p key={idx} className="mb-3">{paragraph}</p>
                  ))
                ) : (
                  <p className="text-slate-500">暂无测验记录，完成一次练习后即可生成详细诊断报告。</p>
                )}
            </div>
        </div>

        <div className="bg-indigo-50/50 p-8 border-t border-indigo-100">
            <h4 className="text-xs font-bold text-indigo-900/60 uppercase tracking-widest mb-6">下一步行动指南 (点击提问)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {actionSuggestions.map((q, i) => (
                    <button 
                        key={i}
                        onClick={() => onAskAI(q)}
                        className="flex items-center justify-between p-5 bg-white border border-indigo-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-200/50 hover:-translate-y-1 transition-all group text-left"
                    >
                        <span className="font-bold text-slate-700 group-hover:text-indigo-700">{q}</span>
                        <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                             <ArrowRight size={16} className="text-indigo-600 group-hover:text-white transition-colors" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm">
        {lastResult ? (
          <div className="p-8 space-y-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900">最近测验解析</h3>
              <p className="text-sm text-slate-500">最后一次练习的详细表现</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: '得分', value: `${lastResult.scorePercentage.toFixed(0)}分` },
                { label: '正确题数', value: lastResult.correct },
                { label: '错误题数', value: lastResult.wrong },
                { label: '总题数', value: lastResult.total },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm font-semibold text-slate-600 flex items-center justify-between">
                  <span>{item.label}</span>
                  <span className="text-slate-900">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="space-y-6">
              {lastResult.results.map((entry) => {
                const isCorrect = entry.isCorrect;
                return (
                  <div key={entry.questionId} className={`rounded-2xl border p-5 ${isCorrect ? 'border-emerald-100 bg-emerald-50/40' : 'border-red-100 bg-red-50/30'}`}>
                    <div className="flex items-center gap-3 text-sm font-semibold text-slate-700 mb-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCorrect ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                        {isCorrect ? <Check size={18}/> : <X size={18}/>}
                      </div>
                      <span>题目 {entry.questionId}</span>
                    </div>
                    {entry.questionText && (
                      <div className="text-sm text-slate-500 mb-2">题干：{entry.questionText}</div>
                    )}
                    <div className="text-sm text-slate-600 flex flex-wrap gap-4">
                      <span>你的答案：<span className="font-semibold text-slate-900">{entry.userAnswer ?? '未作答'}</span></span>
                      <span>正确答案：<span className="font-semibold text-slate-900">{entry.correctAnswer ?? '未知'}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[320px] text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
                <BrainCircuit className="text-slate-400" size={40} strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">暂无分析报告</h3>
            <p className="text-slate-500 mt-2 max-w-sm">完成一次测验即可生成详细的错题解析与能力追踪。</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportView;
