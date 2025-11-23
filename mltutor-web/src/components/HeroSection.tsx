import React from 'react';
import type { AppState } from '../types';
import { Database, MessageSquare, Zap, Sparkles } from 'lucide-react';

interface HeroProps {
  state: AppState;
  turns: number;
}

const StatCard = ({ icon: Icon, label, value, active }: { icon: any, label: string, value: string | number, active?: boolean }) => (
  <div className="flex-1 min-w-[140px] bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-2xl hover:bg-white/15 transition-colors group">
    <div className="text-xs text-indigo-100/80 mb-2 flex items-center gap-1.5 font-medium uppercase tracking-wide">
      <Icon size={12} className="group-hover:text-white transition-colors" /> {label}
    </div>
    <div className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
      {active !== undefined && (
        <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-slate-400'}`} />
      )}
      {value}
    </div>
  </div>
);

const HeroSection: React.FC<HeroProps> = ({ state, turns }) => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 rounded-[2rem] p-8 md:p-10 text-white shadow-2xl shadow-indigo-200/50 mb-10">
      {/* Decorative Shapes */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-500/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div className="max-w-xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/30 border border-white/10 text-xs font-bold text-indigo-50 backdrop-blur-md shadow-sm">
            <Sparkles size={12} className="text-yellow-300" /> 
            AI-Powered Learning Workbench
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            构建您的专属 <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-200">AI 智能导师</span>
          </h2>
          
          <p className="text-indigo-100/90 text-base leading-relaxed font-medium max-w-lg">
            基于 RAG 技术的个性化学习系统。上传教材，即刻生成测验、错题分析与智能答疑。
          </p>
        </div>

        <div className="flex gap-4 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
          <StatCard 
            icon={Database} 
            label="当前知识库" 
            value={state.isKnowledgeBaseReady ? '自定义教材' : '未加载'} 
          />
          <StatCard 
            icon={Zap} 
            label="出题引擎" 
            value={state.isKnowledgeBaseReady ? '已就绪' : '待命'} 
            active={state.isKnowledgeBaseReady}
          />
          <StatCard 
            icon={MessageSquare} 
            label="对话轮次" 
            value={turns} 
          />
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
