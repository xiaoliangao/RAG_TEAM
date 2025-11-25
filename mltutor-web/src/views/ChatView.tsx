import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, User, Bot, ThumbsUp, ThumbsDown, Copy, Sparkles } from 'lucide-react';
import type { Message, AppSettings, ChatHistoryItem, ChatRequest, Material } from '../types';
import { chat } from '../api/client';

interface ChatViewProps {
  messages: Message[];
  settings: AppSettings;
  updateMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  pendingQuestion?: string | null;
  onConsumePending?: () => void;
  currentMaterial?: Material | null;
}

const renderMath = () => {
  const mathjax = (window as unknown as { MathJax?: { typesetPromise?: () => Promise<void> } }).MathJax;
  if (mathjax?.typesetPromise) {
    mathjax.typesetPromise().catch(() => setTimeout(() => mathjax.typesetPromise?.(), 150));
  }
};

const ChatView: React.FC<ChatViewProps> = ({ messages, settings, updateMessages, pendingQuestion, onConsumePending, currentMaterial }) => {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const markedReady = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    const frame = requestAnimationFrame(() => renderMath());
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    const nextMessages = [...messages, userMsg];
    updateMessages(prev => [...prev, userMsg]);

    const historyPayload: ChatHistoryItem[] = nextMessages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const request: ChatRequest = {
      question,
      temperature: settings.temperature,
      k: settings.kDocuments,
      enable_expansion: settings.queryExpansion,
      use_fewshot: settings.useFewShot,
      use_multi_turn: historyPayload.length > 1,
      history: historyPayload,
      material_id: currentMaterial?.id ?? undefined,
    };

    setIsSending(true);
    setError(null);

    try {
      const res = await chat(request);
      const aiMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        sources: res.sources,
        timestamp: new Date(),
      };
      updateMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '发送失败，请稍后重试';
      setError(message);
    } finally {
      setIsSending(false);
    }
  }, [messages, settings, updateMessages]);

  const processedPendingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingQuestion) {
      processedPendingRef.current = null;
      return;
    }
    if (processedPendingRef.current === pendingQuestion) {
      return;
    }
    processedPendingRef.current = pendingQuestion;
    setInput('');
    void sendMessage(pendingQuestion);
    onConsumePending?.();
  }, [pendingQuestion, sendMessage, onConsumePending]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    void sendMessage(input);
    setInput('');
  };

const renderMarkdown = useCallback((text: string) => {
    if (typeof window === 'undefined') {
      return text.replace(/\n/g, '<br/>');
    }
    const markedLib = (window as typeof window & { marked?: { parse: (input: string) => string; setOptions?: (opts: Record<string, unknown>) => void } }).marked;
    if (!markedLib) {
      return text.replace(/\n/g, '<br/>');
    }
    if (!markedReady.current && typeof markedLib.setOptions === 'function') {
      markedLib.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false,
        smartLists: true,
      });
      markedReady.current = true;
    }
    const tokens: { key: string; html: string }[] = [];
    let processed = text;
    processed = processed.replace(/\\\[(.+?)\\\]/gs, (_, content) => {
      const key = `@@BLOCK_${tokens.length}@@`;
      tokens.push({ key, html: `$$${content}$$` });
      return key;
    });
    processed = processed.replace(/\$\$(.+?)\$\$/gs, (_, content) => {
      const key = `@@BLOCK_${tokens.length}@@`;
      tokens.push({ key, html: `$$${content}$$` });
      return key;
    });
    processed = processed.replace(/\\\((.+?)\\\)/gs, (_, content) => {
      const key = `@@INLINE_${tokens.length}@@`;
      tokens.push({ key, html: `$${content}$` });
      return key;
    });
    processed = processed.replace(/\$(.+?)\$/gs, (_, content) => {
      const key = `@@INLINE_${tokens.length}@@`;
      tokens.push({ key, html: `$${content}$` });
      return key;
    });
    let html = markedLib.parse(processed);
    tokens.forEach(({ key, html: tokenHtml }) => {
      html = html.replace(new RegExp(key, 'g'), tokenHtml);
    });
    return html;
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[720px] glass-panel rounded-[2rem] border border-white/70 shadow-xl shadow-indigo-100/60 overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth bg-white/45">
        {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
                  <Sparkles size={32} className="text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">AI 助教已就绪</h3>
                <p className="text-slate-500 max-w-xs leading-relaxed">
                  随时询问关于上传教材的任何问题。我可以解释概念、概括教材重点或解答您的疑惑。
                </p>
                <div className="grid grid-cols-1 gap-2 mt-8 w-full max-w-md">
                  {["机器学习有哪些常见模型？", "深度学习和传统 ML 有何区别？", "如何提升模型泛化能力？"].map(q => (
                    <button 
                      key={q}
                      onClick={() => void sendMessage(q)}
                      className="px-4 py-3 bg-white/80 border border-white/70 rounded-xl text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-lg hover:shadow-indigo-100 transition-all text-left"
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
            </div>
        )}
        
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex gap-5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm border ${msg.role === 'user' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white/90 border-white/70 text-indigo-600'}`}>
              {msg.role === 'user' ? <User size={18} /> : <Bot size={20} />}
            </div>

            <div className={`flex flex-col max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`px-6 py-4 rounded-3xl text-[15px] leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-slate-900 text-white rounded-tr-sm' 
                    : 'bg-white/85 text-slate-700 border border-white/70 rounded-tl-sm'
                }`}>
                    {msg.role === 'assistant' ? (
                      <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    ) : (
                      msg.content
                    )}
                </div>

                {msg.role === 'assistant' && (
                    <div className="mt-3 flex flex-col gap-2">
                        {msg.sources && (
                            <div className="flex flex-wrap gap-2 mb-1">
                                {msg.sources.map((src, i) => (
                                    <span key={i} className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-md border border-slate-200">
                                        {src}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex items-center gap-1 ml-1">
                            <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors" title="复制"><Copy size={14}/></button>
                            <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-emerald-600 transition-colors" title="有帮助"><ThumbsUp size={14}/></button>
                            <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-600 transition-colors" title="无帮助"><ThumbsDown size={14}/></button>
                        </div>
                    </div>
                )}
                {msg.role === 'user' && (
                   <span className="text-[10px] text-slate-400 mt-2 font-medium px-1">刚刚</span>
                )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/60 bg-white/80 backdrop-blur-xl p-6">
        <form onSubmit={handleSend} className="relative flex items-center max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="基于教材内容提问..."
            className="w-full pl-6 pr-16 py-4 bg-white/90 border border-white/70 text-slate-900 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all shadow-lg shadow-indigo-100 text-[15px]"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="absolute right-3 p-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-200 disabled:opacity-50 transition-all shadow-md shadow-indigo-200"
          >
            <Send size={18} strokeWidth={2.5} />
          </button>
        </form>
        {error && (
          <div className="max-w-4xl mx-auto mt-3 text-sm text-rose-700 bg-rose-100 border border-rose-200 rounded-xl px-4 py-2">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatView;
