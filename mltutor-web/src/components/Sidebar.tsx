import React from 'react';
import { Settings, Trash2, RefreshCw, Cpu, Sparkles } from 'lucide-react';
import type { AppState } from '../types';

interface SidebarProps {
  state: AppState;
  updateSettings: (key: keyof AppState['settings'], value: any) => void;
  resetSystem: () => void;
  clearChat: () => void;
}

const Toggle = ({ checked, onChange }: { checked: boolean, onChange: (v: boolean) => void }) => (
  <button 
    onClick={() => onChange(!checked)}
    className={`w-11 h-6 rounded-full relative transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`}
  >
    <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 shadow-sm ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
);

const Sidebar: React.FC<SidebarProps> = ({ state, updateSettings, resetSystem, clearChat }) => {
  const { settings } = state;

  return (
    <aside className="w-80 bg-white border-r border-slate-200/60 h-screen sticky top-0 flex flex-col hidden lg:flex shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-40">
      <div className="p-8 pb-6">
        <div className="flex items-center gap-3 text-indigo-600 mb-1.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
            <Cpu size={18} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">MLTutor</h1>
        </div>
        <p className="text-xs text-slate-500 font-medium pl-[44px]">智能学习工作台</p>
      </div>

      <div className="px-6 py-2 flex-1 overflow-y-auto space-y-8 scrollbar-hide">
        {/* Status */}
        <div className="bg-gradient-to-br from-slate-50 to-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm mb-4">
            <Sparkles size={14} className="text-amber-500" fill="currentColor" /> 系统状态
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-medium">出题引擎</span>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${state.isKnowledgeBaseReady ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-300'}`}></span>
                <span className={`text-xs font-bold ${state.isKnowledgeBaseReady ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {state.isKnowledgeBaseReady ? '已就绪' : '未加载'}
                </span>
              </div>
            </div>
            <div className="h-px bg-slate-100 w-full" />
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 font-medium">问答大脑</span>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${state.isKnowledgeBaseReady ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-300'}`}></span>
                <span className={`text-xs font-bold ${state.isKnowledgeBaseReady ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {state.isKnowledgeBaseReady ? '已索引' : '空闲中'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wider opacity-80">
            <Settings size={14} /> 高级配置
          </div>
          
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-semibold text-slate-700 block">启用查询扩展</label>
                <p className="text-[10px] text-slate-400">自动生成相关问题提升覆盖率</p>
              </div>
              <Toggle checked={settings.queryExpansion} onChange={(v) => updateSettings('queryExpansion', v)} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                 <label className="text-sm font-semibold text-slate-700 block">Few-shot 示例</label>
                 <p className="text-[10px] text-slate-400">参考标准答案以优化输出</p>
              </div>
              <Toggle checked={settings.useFewShot} onChange={(v) => updateSettings('useFewShot', v)} />
            </div>

            <div className="pt-4 space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold text-slate-700">检索文档数 (Top-K)</span>
                  <span className="text-indigo-600 font-bold bg-indigo-50 px-2 rounded text-xs flex items-center">{settings.kDocuments} 篇</span>
                </div>
                <input 
                  type="range" 
                  min="2" max="8" 
                  value={settings.kDocuments}
                  onChange={(e) => updateSettings('kDocuments', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold text-slate-700">随机性 (Temperature)</span>
                  <span className="text-indigo-600 font-bold bg-indigo-50 px-2 rounded text-xs flex items-center">{settings.temperature}</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" max="1.5" step="0.1"
                  value={settings.temperature}
                  onChange={(e) => updateSettings('temperature', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-slate-100 bg-slate-50/50 space-y-3">
        <button 
          onClick={clearChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:border-slate-300 hover:text-slate-900 hover:shadow-sm transition-all"
        >
          <Trash2 size={16} /> 清空对话历史
        </button>
        <button 
          onClick={resetSystem}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-100 hover:border-indigo-200 transition-all"
        >
          <RefreshCw size={16} /> 重置系统
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
