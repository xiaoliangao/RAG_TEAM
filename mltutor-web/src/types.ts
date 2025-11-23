export type TabId = 'upload' | 'quiz' | 'report' | 'chat';
export type TabType = TabId;

export interface AppSettings {
  queryExpansion: boolean;
  useFewShot: boolean;
  kDocuments: number;
  temperature: number;
}

export interface AppState {
  isKnowledgeBaseReady: boolean;
  isProcessing: boolean;
  activeTab: TabId;
  settings: AppSettings;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: Date;
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  question: string;
  temperature?: number;
  max_tokens?: number;
  k?: number;
  enable_expansion?: boolean;
  use_fewshot?: boolean;
  use_multi_turn?: boolean;
  history?: ChatHistoryItem[];
}

export interface ChatResponse {
  answer: string;
  sources: string[];
}

export interface UploadResponse {
  filename: string;
  chunk_count: number;
}

export interface Material {
  id: string;
  name: string;
  source: string;
  kind: 'builtin' | 'uploaded';
}

export interface MaterialsResponse {
  builtins: Material[];
  uploaded: Material[];
}

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type QuizStage = 'config' | 'answering' | 'result';

export interface QuizGenerateRequest {
  num_choice: number;
  num_boolean: number;
  difficulty: QuizDifficulty;
  material_id?: string | null;
}

export interface QuizQuestion {
  id: number;
  stem?: string;
  question?: string;
  options?: string[];
  correct?: string;
  explanation?: string;
  qtype?: 'choice' | 'boolean' | string;
  type?: 'choice' | 'boolean' | string;
}

export interface QuizGenerateResponse {
  questions: QuizQuestion[];
}

export interface QuizResult {
  total: number;
  correct: number;
  wrong: number;
  scorePercentage: number;
  results: {
    questionId: number;
    isCorrect: boolean;
    userAnswer: string | null;
    correctAnswer?: string;
    questionText?: string;
  }[];
}

export interface QuizSessionState {
  stage: QuizStage;
  questions: QuizQuestion[];
  answers: Record<number, string>;
  config: {
    choice: number;
    boolean: number;
    difficulty: QuizDifficulty;
  };
  selectedMaterial: string;
  result: QuizResult | null;
}

export interface QuizHistoryEntry {
  id: string;
  score: number;
  timestamp: number;
  label: string;
}

export interface StudyOverview {
  attempts: number;
  average_score: number;
  best_score: number;
  recent_score: number;
}

export interface StudyReportOverview {
  overview: StudyOverview;
  focus_topics: string[];
}
