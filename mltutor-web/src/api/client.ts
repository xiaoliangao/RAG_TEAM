import axios from 'axios';
import type {
  Chapter,
  ChatRequest,
  ChatResponse,
  MaterialsResponse,
  QuizGenerateRequest,
  QuizGenerateResponse,
  QuizSubmitRequestPayload,
  QuizSubmitResponsePayload,
  ScorePoint,
  StudyDiagnosticResponse,
  StudyReportOverview,
  UploadResponse,
  WrongQuestion,
} from '../types';

export const api = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  timeout: 120000,
});

export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>('/api/chat', request);
  return data;
}

export async function uploadMaterial(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<UploadResponse>('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function fetchMaterials(): Promise<MaterialsResponse> {
  const { data } = await api.get<MaterialsResponse>('/api/materials');
  return data;
}

export async function fetchChapters(materialId: string): Promise<Chapter[]> {
  const { data } = await api.get<Chapter[]>(`/api/materials/${materialId}/chapters`);
  return data;
}

export async function generateQuiz(
  req: QuizGenerateRequest,
): Promise<QuizGenerateResponse> {
  const { data } = await api.post<QuizGenerateResponse>('/api/quiz/generate', req);
  return data;
}

export async function submitQuizAnswers(
  payload: QuizSubmitRequestPayload,
): Promise<QuizSubmitResponsePayload> {
  const { data } = await api.post<QuizSubmitResponsePayload>('/api/quiz/submit', payload);
  return data;
}

export async function fetchWrongQuestions(params: {
  limit?: number;
  material_id?: string | null;
}): Promise<WrongQuestion[]> {
  const { data } = await api.get<WrongQuestion[]>('/api/quiz/wrong', {
    params,
  });
  return data;
}

export async function fetchReportOverview(): Promise<StudyReportOverview> {
  const { data } = await api.get<StudyReportOverview>('/api/report/overview');
  return data;
}

export async function fetchStudyDiagnostic(params?: {
  limit?: number;
  material_id?: string | null;
}): Promise<StudyDiagnosticResponse> {
  const queryParams: Record<string, string | number | null | undefined> = {};
  if (typeof params?.limit === 'number') {
    queryParams.limit = params.limit;
  }
  if (params?.material_id) {
    queryParams.material_id = params.material_id;
  }
  const { data } = await api.get<StudyDiagnosticResponse>('/api/report/diagnostic', {
    params: queryParams,
  });
  return data;
}

export async function fetchScoreTimeline(limit = 50): Promise<ScorePoint[]> {
  const { data } = await api.get<ScorePoint[]>('/api/report/timeline', {
    params: { limit },
  });
  return data;
}

export default api;
