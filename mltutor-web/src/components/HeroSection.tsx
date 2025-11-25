import React from 'react';
import type { Material } from '../types';
import { Sparkles, Zap, MessageSquare, Settings } from 'lucide-react';

interface HeroProps {
  isKnowledgeBaseReady: boolean;
  turns: number;
  currentMaterial?: Material | null;
  onOpenSettings?: () => void;
}

const StatPill = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) => (
  <div className="px-4 py-2 rounded-2xl border border-white/70 bg-white/70 backdrop-blur-xl flex items-center gap-2 text-sm font-semibold text-slate-700 shadow-sm">
    <Icon size={14} className="text-indigo-500" />
    <span>{label}</span>
    <span className="text-slate-900 font-mono">{value}</span>
  </div>
);

const HeroSection: React.FC<HeroProps> = ({ isKnowledgeBaseReady, turns, currentMaterial, onOpenSettings }) => {
  return (
    <div className="glass-panel border border-white/60 rounded-3xl px-6 py-5 mb-6 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          <Sparkles size={12} className="text-amber-400" /> 知识库管理
        </div>
        <h2 className="text-xl font-semibold text-slate-900">{currentMaterial?.name ?? '尚未选择教材'}</h2>
        <p className="text-sm text-slate-500">
          {isKnowledgeBaseReady ? '系统已加载完成，可开始测验与问答。' : '上传或选择教材以激活知识库。'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StatPill icon={Zap} label="引擎状态" value={isKnowledgeBaseReady ? '就绪' : '待机'} />
        <StatPill icon={MessageSquare} label="对话轮次" value={turns} />
        <button
          onClick={onOpenSettings}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-200 transition-all duration-300"
        >
          <Settings size={16} /> 系统设置
        </button>
      </div>
    </div>
  );
};

export default HeroSection;
