import React from 'react';
import { Trash2, RefreshCw, Cpu, UploadCloud, CheckSquare, BarChart2, MessageCircle, Settings as SettingsIcon } from 'lucide-react';
import type { Material, TabType } from '../types';

interface SidebarProps {
  resetSystem: () => void;
  clearChat: () => void;
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onOpenSettings: () => void;
  currentMaterial?: Material | null;
  isKnowledgeBaseReady?: boolean;
  turns?: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  resetSystem,
  clearChat,
  activeTab,
  onChangeTab,
  onOpenSettings,
  currentMaterial,
  isKnowledgeBaseReady,
  turns,
}) => {
  const navItems: Array<{ id: TabType; label: string; icon: React.ElementType }> = [
    { id: 'upload', label: '教材上传', icon: UploadCloud },
    { id: 'quiz', label: '智能测验', icon: CheckSquare },
    { id: 'report', label: '学习报告', icon: BarChart2 },
    { id: 'chat', label: 'AI 助教', icon: MessageCircle },
  ];

  return (
    <aside className="w-72 h-[calc(100vh-6rem)] sticky top-8 hidden lg:flex flex-col glass-panel border border-white/60 rounded-3xl ml-6 my-6">
      <div className="p-6 border-b border-white/50">
        <div className="flex items-center gap-3 text-indigo-600">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Cpu size={18} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 leading-tight">MLTutor</h1>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">学习工作台</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 scrollbar-hide">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">主导航</p>
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
            onClick={onOpenSettings}
          >
            <SettingsIcon size={14} /> 设置
          </button>
        </div>
        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                onClick={() => onChangeTab(item.id)}
                className={`group w-full relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 text-sm font-semibold overflow-hidden ${
                  isActive
                    ? 'border-indigo-200 bg-gradient-to-r from-indigo-500/90 to-violet-600/90 text-white shadow-md shadow-indigo-200'
                    : 'border-white/70 hover:border-indigo-200 text-slate-600 hover:text-indigo-700 bg-white/60 backdrop-blur-sm'
                }`}
              >
                <span
                  className={`absolute left-0 top-2 bottom-2 w-1 rounded-full transition-all ${
                    isActive ? 'bg-white' : 'bg-transparent group-hover:bg-indigo-200'
                  }`}
                  aria-hidden
                />
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="glass-panel rounded-2xl p-4 space-y-2 border border-white/70">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isKnowledgeBaseReady ? '#22c55e' : '#cbd5e1' }} />
            知识库管理
          </div>
          <div className="text-sm text-slate-500">当前教材</div>
          <div className="text-base font-semibold text-slate-900 leading-snug">
            {currentMaterial?.name ?? '尚未选择教材'}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${isKnowledgeBaseReady ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
              {isKnowledgeBaseReady ? '引擎 · 就绪' : '引擎 · 待机'}
            </span>
            <span className="text-slate-500">对话轮次 <span className="font-mono text-slate-900">{turns ?? 0}</span></span>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-white/50 bg-white/50 backdrop-blur-xl space-y-4 rounded-br-3xl">
        <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
          系统工具
        </div>
        <div className="h-px bg-slate-200/70" />
        <button
          onClick={clearChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/80 border border-white/70 text-slate-600 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-700 transition-all duration-300"
        >
          <Trash2 size={16} /> 清空对话
        </button>
        <button
          onClick={resetSystem}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-indigo-200 transition-all duration-300"
        >
          <RefreshCw size={16} /> 重置系统
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
