import React, { useState, useEffect, useMemo } from 'react';
import { UploadCloud, Loader2, CheckCircle2 } from 'lucide-react';
import ZenNeuralJellyfish from '../components/ZenNeuralJellyfish';
import type { UploadResponse, MaterialsResponse, Material } from '../types';

interface UploadViewProps {
  isProcessing: boolean;
  onUpload: (file: File) => Promise<UploadResponse | null> | void;
  onLoadDefault: () => void;
  kbReady: boolean;
  errorMessage?: string | null;
  materials?: MaterialsResponse | null;
  selectedMaterialId?: string | null;
  onSelectMaterial?: (id: string | null) => void;
  currentMaterial?: Material | null;
}

const UploadView: React.FC<UploadViewProps> = ({
  isProcessing,
  onUpload,
  onLoadDefault,
  kbReady,
  errorMessage,
  materials,
  selectedMaterialId,
  onSelectMaterial,
  currentMaterial,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        setProgress((prev) => (prev >= 95 ? prev : prev + 5));
      }, 200);
      return () => clearInterval(interval);
    }
    setProgress(0);
  }, [isProcessing]);

  useEffect(() => {
    if (errorMessage) {
      setLocalError(errorMessage);
    }
  }, [errorMessage]);

  const uploadedMaterials = materials?.uploaded ?? [];
  const builtinMaterials = materials?.builtins ?? [];
  const libraryMaterials = useMemo(() => {
    const merged: Material[] = [];
    const seen = new Set<string>();
    [...uploadedMaterials, ...builtinMaterials].forEach((item) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      merged.push(item);
    });
    return merged;
  }, [uploadedMaterials, builtinMaterials]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
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

  const renderUploadBanner = () => (
    <div className="rounded-3xl border border-dashed border-white/70 bg-white/70 backdrop-blur-xl p-6 shadow-[0_18px_48px_-32px_rgba(15,23,42,0.35)] relative overflow-hidden min-h-[320px]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(129,140,248,0.12),transparent_45%),radial-gradient(circle_at_80%_0,rgba(147,197,253,0.1),transparent_35%)]" />
      <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-2">操作区 · 上传教材</p>
      {isProcessing ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner shadow-indigo-100">
              <Loader2 className="animate-spin" size={24} />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">正在解析文档</p>
              <p className="text-sm text-slate-500">上传 → 索引 → 即将就绪</p>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {['上传文件', '构建索引', '准备学习'].map((label, idx) => (
              <div
                key={label}
                className={`rounded-xl px-3 py-2 flex items-center justify-between border ${
                  progress >= (idx + 1) * 30
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                <span>{label}</span>
                {progress >= (idx + 1) * 30 ? <CheckCircle2 size={14} /> : <span>{idx + 1}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer group ${
            dragActive ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50/60'
          }`}
        >
          <input
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            onChange={(e) => e.target.files && void triggerUpload(e.target.files[0])}
            accept=".pdf"
          />
          <div className="relative z-10 pointer-events-none space-y-4">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-white/80 border border-indigo-100 shadow-lg shadow-indigo-100 flex items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-inner shadow-indigo-300">
                <UploadCloud size={30} />
              </div>
            </div>
            <h4 className="text-lg font-bold text-slate-900">拖拽 PDF 到此处，或点击选择文件</h4>
            <p className="text-sm text-slate-500">支持 PDF，单文件 50MB 内，自动切片并构建索引</p>
          </div>
        </div>
      )}
      {(localError || successMessage) && (
        <div className={`mt-4 text-sm font-medium px-4 py-3 rounded-xl border ${localError ? 'text-rose-700 bg-rose-100 border-rose-200' : 'text-emerald-700 bg-emerald-100 border-emerald-200'}`}>
          {localError || successMessage}
        </div>
      )}
    </div>
  );

  const renderContextCard = () => (
    <div className="glass-panel rounded-3xl p-6 space-y-4 min-h-[320px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">学习上下文</p>
          <h4 className="text-lg font-bold text-slate-900">当前教材</h4>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full ${kbReady ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
      </div>
      <p className="text-xs text-slate-500">
        从资料库中选择一份教材，AI 助教将以它为基础生成测验与回答。
      </p>
      <select
        value={selectedMaterialId ?? ''}
        onChange={(e) => onSelectMaterial?.(e.target.value || null)}
        className="w-full rounded-xl border border-white/70 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 shadow-sm"
      >
        <option value="">未选择教材</option>
        {libraryMaterials.map((mat) => (
          <option key={mat.id} value={mat.id}>
            {mat.name}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-slate-400">可切换为自定义上传或系统推荐的内置教材。</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <ZenNeuralJellyfish />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        {renderContextCard()}
        {renderUploadBanner()}
      </div>
    </div>
  );
};

export default UploadView;
