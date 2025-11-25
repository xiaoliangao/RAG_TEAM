// src/constants.ts
import type { AppSettings, AppState, TabId } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  queryExpansion: true,
  useFewShot: true,
  kDocuments: 4,
  temperature: 0.7,
};

export const INITIAL_APP_STATE: AppState = {
  activeTab: 'upload',
  settings: DEFAULT_SETTINGS,
  isKnowledgeBaseReady: false,
  isProcessing: false,
  selectedMaterialId: null,
};

export const TABS: { id: TabId; label: string }[] = [
  { id: 'chat', label: '智能问答' },
  { id: 'quiz', label: '智能测验' },
  { id: 'report', label: '学习报告' },
  { id: 'upload', label: '教材上传' },
];
