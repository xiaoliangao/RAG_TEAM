import axios from 'axios';
import type {
  ChatRequest,
  ChatResponse,
  MaterialsResponse,
  QuizGenerateRequest,
  QuizGenerateResponse,
  StudyReportOverview,
  UploadResponse,
} from '../types';

export const api = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  timeout: 60000,
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

export async function generateQuiz(
  req: QuizGenerateRequest,
): Promise<QuizGenerateResponse> {
  const { data } = await api.post<QuizGenerateResponse>('/api/quiz/generate', req);
  return data;
}

export async function fetchReportOverview(): Promise<StudyReportOverview> {
  const { data } = await api.get<StudyReportOverview>('/api/report/overview');
  return data;
}

export default api;
