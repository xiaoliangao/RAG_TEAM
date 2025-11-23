import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle2, Database, Loader2, BookOpen, Zap, ArrowRight, FileCheck, Sparkles } from 'lucide-react';
import type { UploadResponse } from '../types';

interface UploadViewProps {
  isProcessing: boolean;
  onUpload: (file: File) => Promise<UploadResponse | null> | void;
  onLoadDefault: () => void;
  kbReady: boolean;
  errorMessage?: string | null;
}

const StepItem = ({ 
  title, 
  status, 
  index
}: { 
  title: string; 
  status: 'pending' | 'active' | 'completed';
  index: number;
}) => {
  const styles = {
    pending: "bg-slate-100 text-slate-400 border-slate-200",
    active: "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200",
    completed: "bg-emerald-500 text-white border-emerald-500"
  };

  return (
    <div className="flex flex-col items-center relative z-10">
      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-500 ${styles[status]}`}>
        {status === 'completed' ? <CheckCircle2 size={18} /> : (status === 'active' ? <Loader2 size={18} className="animate-spin" /> : index)}
      </div>
      <span className={`text-xs font-bold mt-2 uppercase tracking-wide ${status === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>{title}</span>
    </div>
  );
};

const UploadView: React.FC<UploadViewProps> = ({ isProcessing, onUpload, onLoadDefault, kbReady, errorMessage }) => {
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) return prev;
          return prev + 5;
        });
      }, 200);
      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [isProcessing]);

  useEffect(() => {
    if (errorMessage) {
      setLocalError(errorMessage);
    }
  }, [errorMessage]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void triggerUpload(e.dataTransfer.files[0]);
    }
  };

  const triggerUpload = async (file: File) => {
    if (!file || isProcessing) return;
    setLocalError(null);
    setSuccessMessage(null);
    const res = await onUpload(file);
    if (res) {
      setSuccessMessage(`上传成功：${res.filename}（生成 ${res.chunk_count} 个切片）`);
    }
  };

  // Logic for pipeline visualization
  const step1Status = isProcessing ? 'completed' : (kbReady ? 'completed' : 'active'); // Upload
  const step2Status = isProcessing ? 'active' : (kbReady ? 'completed' : 'pending'); // Indexing
  const step3Status = kbReady ? 'completed' : 'pending'; // Ready

  return (
    <div className="space-y-8">
      {/* Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Database, title: "双模知识库", desc: "向量 + 关键词混合检索，精准定位" },
          { icon: Zap, title: "智能测验流", desc: "自适应难度，支持选择与判断题" },
          { icon: BookOpen, title: "AI 深度诊断", desc: "分析错题模式，生成个性化建议" },
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-all group">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <item.icon size={20} />
            </div>
            <h3 className="font-bold text-slate-900">{item.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Upload Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-900">上传新的教材</h3>
              <p className="text-slate-500 text-sm">支持 PDF 格式，文件大小限制 50MB。</p>
            </div>
          </div>

          {isProcessing ? (
            <div className="bg-white border border-indigo-100 rounded-[2rem] p-12 text-center shadow-lg shadow-indigo-100/50 relative overflow-hidden">
              <div className="absolute inset-0 bg-indigo-50/50"></div>
              <div className="absolute bottom-0 left-0 h-1.5 bg-indigo-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 bg-white rounded-full shadow-md flex items-center justify-center mb-6">
                  <Loader2 className="animate-spin text-indigo-600" size={32} strokeWidth={2.5} />
                </div>
                <h4 className="text-xl font-bold text-indigo-950">正在解析文档</h4>
                <p className="text-indigo-600/80 font-medium mt-2">提取文本并构建向量索引 ({progress}%)</p>
              </div>
            </div>
          ) : (
            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-[2rem] p-12 text-center transition-all duration-300 cursor-pointer group
                ${dragActive ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/50 bg-white'}`}
            >
              <input 
                type="file" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" 
                onChange={(e) => e.target.files && void triggerUpload(e.target.files[0])}
                accept=".pdf"
              />
              <div className="relative z-10 pointer-events-none">
                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-sm">
                  <UploadCloud size={40} strokeWidth={1.5} />
                </div>
                <h4 className="text-lg font-bold text-slate-900">将 PDF 拖放到此处</h4>
                <p className="text-slate-500 mt-2 mb-6">或点击选择文件</p>
                <button className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl shadow-sm group-hover:border-indigo-200 group-hover:text-indigo-700 transition-colors">
                  选择文件
                </button>
              </div>
            </div>
          )}

          {/* Pipeline Visualization */}
          <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm">
            <div className="relative flex justify-between">
              <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-100 -z-0"></div>
              <StepItem title="上传教材" status={step1Status} index={1} />
              <StepItem title="构建索引" status={step2Status} index={2} />
              <StepItem title="开始学习" status={step3Status} index={3} />
            </div>
            {(localError || successMessage) && (
              <div className={`mt-6 text-sm font-medium px-4 py-3 rounded-xl border ${localError ? 'text-red-600 bg-red-50 border-red-100' : 'text-emerald-700 bg-emerald-50 border-emerald-100'}`}>
                {localError || successMessage}
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Start */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-[1.5rem] border border-slate-200/60 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" fill="currentColor" /> 快速开始
            </h3>
            
            <div className="group p-5 bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer shadow-sm hover:shadow-md" onClick={!isProcessing ? onLoadDefault : undefined}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                  <BookOpen size={20} />
                </div>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide">演示</span>
              </div>
              <h4 className="font-bold text-slate-900">机器学习基础</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">包含神经网络、反向传播及优化算法等核心理论。</p>
              
              <div className="mt-4 flex items-center text-indigo-600 text-sm font-bold group-hover:translate-x-1 transition-transform">
                加载教材 <ArrowRight size={16} className="ml-1" />
              </div>
            </div>
          </div>

          {kbReady && (
            <div className="bg-emerald-50/50 border border-emerald-100 p-6 rounded-[1.5rem]">
               <div className="flex items-center gap-3 text-emerald-800 font-bold mb-2">
                 <FileCheck size={20} /> 知识库已就绪
               </div>
               <p className="text-xs text-emerald-700/80 leading-relaxed">
                 您的专属知识库已激活。现在可以开始生成测验或与 AI 助教对话了。
               </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadView;
