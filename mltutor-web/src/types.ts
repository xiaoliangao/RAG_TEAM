export type TabId = 'upload' | 'quiz' | 'report' | 'chat';
export type TabType = TabId;

export interface AppSettings {
  queryExpansion: boolean;
  useFewShot: boolean;
  kDocuments: number;
  temperature: number;
}

export interface Chapter {
  id: string;
  title: string;
  material_id: string;
  page_start?: number | null;
  page_end?: number | null;
}

export interface AppState {
  isKnowledgeBaseReady: boolean;
  isProcessing: boolean;
  activeTab: TabId;
  settings: AppSettings;
  selectedMaterialId: string | null;
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
  material_id?: string | null;
  chapter_id?: string | null;
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
  chapter_id?: string | null;
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
  source?: string | null;
  page?: number | null;
  chapter_id?: string | null;
  chapter_title?: string | null;
  snippet?: string | null;
  material_id?: string | null;
  concept_key?: string | null;
}

export interface QuizSubmitQuestionPayload extends QuizQuestion {
  user_answer?: string | null;
}

export interface QuizSubmitRequestPayload {
  difficulty: QuizDifficulty;
  questions: QuizSubmitQuestionPayload[];
  material_id?: string | null;
  chapter_id?: string | null;
  num_choice?: number;
  num_boolean?: number;
  mode?: 'standard' | 'review';
}

export interface QuizSubmitResponsePayload {
  score_raw: number;
  score_total: number;
  score_percentage: number;
  next_chapter?: Chapter | null;
}

export interface QuizGenerateResponse {
  questions: QuizQuestion[];
}

export interface QuizResult {
  total: number;
  correct: number;
  wrong: number;
  scorePercentage: number;
  nextChapter?: Chapter | null;
  results: {
    questionId: number;
    isCorrect: boolean;
    userAnswer: string | null;
    correctAnswer?: string;
    questionText?: string;
    source?: string | null;
    page?: number | null;
    chapter_id?: string | null;
    chapter_title?: string | null;
    snippet?: string | null;
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
  mode: 'standard' | 'review';
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

export interface WrongQuestion extends QuizQuestion {
  id: number;
}

export interface StudyDiagnosticResponse {
  markdown: string;
}

export interface ScorePoint {
  ts?: string | null;
  score: number;
}
