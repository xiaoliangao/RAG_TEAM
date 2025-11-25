import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Literal, Tuple

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_chroma import Chroma
from langchain_core.documents import Document

from rag_service import RAGService
from core_processing import process_single_pdf, extract_chapter_title
from learning_tracker import (
    load_quiz_history,
    summarize_history,
    aggregate_knowledge_tags,
    record_quiz_attempt,
    collect_wrong_questions,
    build_score_timeline,
    derive_concept_key,
)
from quiz_module.question_generator import (
    generate_quiz_questions,
    regenerate_question_from_concept,
)
from quiz_module.report_generator import generate_diagnostic_report

app = FastAPI(
    title="MLTutor RAG Backend",
    description="基于 RAG + DeepSeek 的机器学习学习助教后端",
    version="0.4.0",
)

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://127.0.0.1:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rag_service = RAGService()

class Material(BaseModel):
    id: str
    name: str
    source: str
    kind: Literal["builtin", "uploaded"]


class Chapter(BaseModel):
    id: str
    title: str
    material_id: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None


_vector_store: Optional[Chroma] = getattr(rag_service, "vector_store", None)
_embedding_model = getattr(rag_service, "embedding_model", None)

CURRENT_QUIZ_SOURCE: Optional[str] = None
_CHAPTER_CACHE: Dict[str, List[Chapter]] = {}


BUILTIN_MATERIALS: List[Material] = [
    Material(
        id="DL_cn",
        name="深度学习（花书中文版）",
        source="knowledge_base/DL_cn.pdf",
        kind="builtin",
    ),
    Material(
        id="hands_on_dl_pytorch",
        name="动手深度学习（PyTorch 第二版）",
        source="knowledge_base/动手深度学习-PyTorch(第二)  .pdf",
        kind="builtin",
    ),
    Material(
        id="dl_python_intro",
        name="深度学习入门：基于Python的理论与实现",
        source="knowledge_base/深度学习入门：基于Python的理论与实现.pdf",
        kind="builtin",
    ),
    Material(
        id="stat_learning",
        name="统计学习方法",
        source="knowledge_base/统计学习方法.pdf",
        kind="builtin",
    ),
    Material(
        id="ml_foundations",
        name="AAAMLP",
        source="knowledge_base/AAAMLP.pdf",
        kind="builtin",
    ),
]

def _load_uploaded_materials() -> List[Material]:
    """扫描 ./uploaded_pdfs 目录，生成上传教材列表。"""
    uploaded_dir = Path("./uploaded_pdfs")
    mats: List[Material] = []
    if uploaded_dir.exists():
        for pdf in sorted(uploaded_dir.glob("*.pdf")):
            mats.append(
                Material(
                    id=pdf.stem,
                    name=pdf.name,
                    source=str(pdf),
                    kind="uploaded",
                )
            )
    return mats


def _find_material_by_id(material_id: str) -> Optional[Material]:
    """在内置教材 + 上传教材中按 id 查找。"""
    for m in BUILTIN_MATERIALS:
        if m.id == material_id:
            return m
    for m in _load_uploaded_materials():
        if m.id == material_id:
            return m
    return None


def _safe_page(meta: Dict[str, Any]) -> Optional[int]:
    for key in ("page", "page_number", "page_index"):
        if key in meta:
            try:
                return int(meta[key])
            except (TypeError, ValueError):
                continue
    return None


def _slugify_title(text: str) -> str:
    normalized = re.sub(r"\s+", "-", text.strip())
    normalized = re.sub(r"[^A-Za-z0-9\-]+", "", normalized)
    return normalized.lower().strip("-")


def _infer_chapter_title(text: str) -> Optional[str]:
    title = extract_chapter_title(text)
    if not title:
        return None
    return re.sub(r"\s+", " ", title).strip()


def _normalize_detected_title(title: Optional[str]) -> Optional[str]:
    if not title:
        return None
    return re.sub(r"\s+", " ", title).strip()


def _build_chapter_index(
    material: Material, docs: List[str], metas: List[Dict[str, Any]]
) -> List[Chapter]:
    chapters: List[Chapter] = []
    chapter_map: Dict[str, Chapter] = {}
    current_id: Optional[str] = None

    for content, meta in zip(docs, metas):
        chapter_id = meta.get("chapter_id")
        title = _normalize_detected_title(meta.get("chapter_title"))
        if not title:
            title = _normalize_detected_title(_infer_chapter_title(content))
        if chapter_id and not title:
            title = chapter_id
        if title and not chapter_id:
            slug = _slugify_title(title) or f"ch{len(chapters) + 1}"
            chapter_id = f"{material.id}-{slug}"

        if chapter_id:
            chapter = chapter_map.get(chapter_id)
            if chapter is None:
                page = _safe_page(meta)
                chapter = Chapter(
                    id=chapter_id,
                    title=title or chapter_id,
                    material_id=material.id,
                    page_start=page,
                    page_end=page,
                )
                chapter_map[chapter_id] = chapter
                chapters.append(chapter)
            else:
                page = _safe_page(meta)
                if page is not None:
                    if chapter.page_start is None or page < chapter.page_start:
                        chapter.page_start = page
                    if chapter.page_end is None or page > chapter.page_end:
                        chapter.page_end = page
            current_id = chapter_id
        elif current_id:
            chapter = chapter_map.get(current_id)
            if chapter:
                page = _safe_page(meta)
                if page is not None and (chapter.page_end is None or page > chapter.page_end):
                    chapter.page_end = page

    chapters.sort(key=lambda ch: ((ch.page_start or 0), ch.title))
    return chapters


def _load_chapters_for_material(material: Material) -> List[Chapter]:
    if material.id in _CHAPTER_CACHE:
        return _CHAPTER_CACHE[material.id]

    try:
        vs = _get_or_create_vector_store()
    except RuntimeError:
        return []

    try:
        data = vs.get(where={"source": material.source})
    except Exception:
        _CHAPTER_CACHE[material.id] = []
        return []

    docs = data.get("documents", [])
    metas = data.get("metadatas", [])
    chapters = _build_chapter_index(material, docs, metas)
    _CHAPTER_CACHE[material.id] = chapters
    return chapters


def _build_retrieval_filter(
    material: Optional[Material]
) -> Optional[Dict[str, Any]]:
    filters: Dict[str, Any] = {}
    if material:
        filters["source"] = material.source
    return filters or None


def _next_chapter(material_id: Optional[str], chapter_id: Optional[str]) -> Optional[Chapter]:
    if not material_id or not chapter_id:
        return None
    material = _find_material_by_id(material_id)
    if not material:
        return None
    chapters = _load_chapters_for_material(material)
    for idx, chapter in enumerate(chapters):
        if chapter.id == chapter_id and idx + 1 < len(chapters):
            return chapters[idx + 1]
    return None


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str
    temperature: float = 0.7
    max_tokens: int = 1024
    k: int = 4
    enable_expansion: bool = True
    use_fewshot: bool = True
    use_multi_turn: bool = False
    history: Optional[List[ChatHistoryItem]] = None
    material_id: Optional[str] = None
    chapter_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[str]


class UploadResponse(BaseModel):
    filename: str
    chunk_count: int


class MaterialsResponse(BaseModel):
    builtins: List[Material]
    uploaded: List[Material]


QuizDifficulty = Literal["easy", "medium", "hard"]


class QuizGenerateRequest(BaseModel):
    num_choice: int = 3
    num_boolean: int = 2
    difficulty: QuizDifficulty = "medium"
    material_id: Optional[str] = None
    chapter_id: Optional[str] = None

class QuizItem(BaseModel):
    id: int
    stem: str
    options: Optional[List[str]] = None
    correct: Optional[str] = None
    explanation: Optional[str] = None
    qtype: Optional[str] = None
    source: Optional[str] = None
    page: Optional[int] = None
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    snippet: Optional[str] = None
    material_id: Optional[str] = None
    concept_key: Optional[str] = None


class QuizGenerateResponse(BaseModel):
    questions: List[QuizItem]


class QuizSubmitQuestion(BaseModel):
    id: int
    stem: str
    options: Optional[List[str]] = None
    correct: Optional[str] = None
    user_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    qtype: Optional[str] = None  # "choice" / "boolean"
    source: Optional[str] = None
    page: Optional[int] = None
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    snippet: Optional[str] = None
    explanation: Optional[str] = None
    concept_key: Optional[str] = None
    material_id: Optional[str] = None


class QuizSubmitRequest(BaseModel):
    difficulty: QuizDifficulty
    questions: List[QuizSubmitQuestion]
    material_id: Optional[str] = None
    chapter_id: Optional[str] = None
    num_choice: Optional[int] = None
    num_boolean: Optional[int] = None
    mode: Literal["standard", "review"] = "standard"


class QuizSubmitResponse(BaseModel):
    score_raw: int
    score_total: int
    score_percentage: float
    next_chapter: Optional[Chapter] = None


class WrongQuestion(BaseModel):
    id: int
    stem: str
    options: List[str]
    correct: Optional[str]
    qtype: Optional[str] = None
    explanation: Optional[str] = None
    source: Optional[str] = None
    page: Optional[int] = None
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    snippet: Optional[str] = None
    concept_key: Optional[str] = None
    material_id: Optional[str] = None


class StudyDiagnosticResponse(BaseModel):
    markdown: str


class ScorePoint(BaseModel):
    ts: Optional[str]
    score: float

class StudyOverview(BaseModel):
    attempts: int
    average_score: float
    best_score: float
    recent_score: float


class StudyReportOverview(BaseModel):
    overview: StudyOverview
    focus_topics: List[str]

def _get_or_create_vector_store() -> Chroma:
    """
    获取当前使用的向量库实例：
    - 优先使用 rag_service.vector_store
    - 否则从 ./vector_db 加载
    """
    global _vector_store, _embedding_model

    if _vector_store is not None:
        return _vector_store

    if _embedding_model is None:
        _embedding_model = getattr(rag_service, "embedding_model", None)
        if _embedding_model is None:
            raise RuntimeError("RAGService 未暴露 embedding_model，无法构建 Chroma。")

    db_path = "./vector_db"
    if not Path(db_path).exists():
        raise RuntimeError(f"向量库目录不存在: {db_path}")

    _vector_store = Chroma(
        persist_directory=db_path,
        embedding_function=_embedding_model,
        collection_metadata={"hnsw:space": "cosine"},
    )
    if hasattr(rag_service, "vector_store"):
        setattr(rag_service, "vector_store", _vector_store)

    return _vector_store


def _doc_list_to_sources(docs: List[Document]) -> List[str]:
    """根据文档 metadata 提取去重后的 source 列表"""
    sources: List[str] = []
    for d in docs:
        src = d.metadata.get("source") or d.metadata.get("original_path")
        if src and src not in sources:
            sources.append(str(src))
    return sources


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {"status": "ok", "message": "MLTutor backend is running."}



@app.post("/api/chat", response_model=ChatResponse)
def api_chat(req: ChatRequest) -> ChatResponse:
    try:
        history_list: Optional[List[Dict[str, str]]] = None
        if req.history:
            history_list = [h.model_dump() for h in req.history]

        material: Optional[Material] = None
        if req.material_id:
            material = _find_material_by_id(req.material_id)
            if material is None:
                raise HTTPException(status_code=400, detail=f"未知教材: {req.material_id}")

        filters = _build_retrieval_filter(material)

        answer, sources = rag_service.answer(
            req.question,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            k=req.k,
            enable_expansion=req.enable_expansion,
            use_fewshot=req.use_fewshot,
            use_multi_turn=req.use_multi_turn,
            history=history_list,
            filters=filters,
        )
        return ChatResponse(answer=answer, sources=sources)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG 问答失败: {e}")


@app.post("/api/upload", response_model=UploadResponse)
async def api_upload(file: UploadFile = File(...)) -> UploadResponse:
    """
    上传 PDF 教材，并将其切片后写入主向量库：
    - 文件保存到 ./uploaded_pdfs
    - 切片逻辑使用 core_processing.process_single_pdf
    - 写入当前向量库
    - 同时把该 PDF 记为 CURRENT_QUIZ_SOURCE（之后测验只用这本）
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件上传。")

    upload_dir = Path("./uploaded_pdfs")
    upload_dir.mkdir(exist_ok=True)

    # 简单清洗文件名（去空格、防止路径问题）
    safe_name = file.filename.replace(" ", "_")
    save_path = upload_dir / safe_name

    try:
        # 保存文件
        with save_path.open("wb") as f:
            content = await file.read()
            f.write(content)

        # 文本处理与切片
        chunks: List[Document] = process_single_pdf(
            str(save_path),
            source_name=str(save_path),
        )
        chunk_count = len(chunks)

        # 写入向量库
        if chunk_count > 0:
            vs = _get_or_create_vector_store()
            vs.add_documents(chunks)

        # 记录为当前测验教材
        global CURRENT_QUIZ_SOURCE
        CURRENT_QUIZ_SOURCE = str(save_path)
        _CHAPTER_CACHE.clear()

        return UploadResponse(filename=file.filename, chunk_count=chunk_count)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传或索引构建失败: {e}")


@app.get("/api/materials", response_model=MaterialsResponse)
def api_materials() -> MaterialsResponse:
    """
    返回内置教材 + 已上传教材列表。
    """
    uploaded = _load_uploaded_materials()
    return MaterialsResponse(builtins=BUILTIN_MATERIALS, uploaded=uploaded)


@app.get("/api/materials/{material_id}/chapters", response_model=List[Chapter])
def api_get_chapters(material_id: str) -> List[Chapter]:
    material = _find_material_by_id(material_id)
    if material is None:
        raise HTTPException(status_code=404, detail=f"未知教材: {material_id}")
    return _load_chapters_for_material(material)


@app.post("/api/quiz/generate", response_model=QuizGenerateResponse)
def api_generate_quiz(req: QuizGenerateRequest) -> QuizGenerateResponse:
    """
    根据当前知识库生成测验题：
    - 如果前端显式传入 material_id：只使用该教材出题
    - 否则：若 CURRENT_QUIZ_SOURCE 非空，优先最近上传教材
           再否则：使用全体内置知识库（即向量库不加 filter）
    """
    # 1. 向量库
    vs = _get_or_create_vector_store()

    # 2. 根据 material_id / CURRENT_QUIZ_SOURCE 决定过滤条件
    selected_material: Optional[Material] = None
    if req.material_id:
        selected_material = _find_material_by_id(req.material_id)
        if selected_material is None:
            raise HTTPException(status_code=400, detail=f"未知教材: {req.material_id}")

    search_filters: Dict[str, Any] = {}
    if selected_material is not None:
        search_filters["source"] = selected_material.source
    elif CURRENT_QUIZ_SOURCE:
        search_filters["source"] = CURRENT_QUIZ_SOURCE

    search_kwargs: Dict[str, Any] = {"k": 8}
    if search_filters:
        search_kwargs["filter"] = search_filters

    quiz_retriever = vs.as_retriever(search_kwargs=search_kwargs)

    try:
        raw_questions = generate_quiz_questions(
            retriever=quiz_retriever,
            tokenizer=None,
            model=None,
            device="cpu",
            num_choice=req.num_choice,
            num_boolean=req.num_boolean,
            difficulty=req.difficulty,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成测验题失败: {e}")

    # 4. 映射到前端字段（你当前那段保持不变即可）
    items: List[QuizItem] = []
    for i, q in enumerate(raw_questions):
        stem = q.get("stem") or q.get("question") or ""
        options = q.get("options") or []
        qtype = q.get("type") or "choice"
        material_id = q.get("material_id") or (selected_material.id if selected_material else req.material_id)

        correct_value: Optional[str] = None
        idx = q.get("correct_answer_index")
        if isinstance(idx, int) and 0 <= idx < len(options):
            correct_value = options[idx]
        else:
            correct_value = q.get("correct") or q.get("correct_answer")

        explanation = q.get("explanation") or q.get("analysis")
        concept_key = derive_concept_key(
            {
                "concept_key": q.get("concept_key"),
                "stem": stem,
                "question": stem,
                "source": q.get("source"),
                "page": q.get("page"),
                "chapter_id": q.get("chapter_id"),
                "snippet": q.get("snippet"),
            }
        )

        items.append(
            QuizItem(
                id=i + 1,
                stem=stem,
                options=options,
                correct=correct_value,
                explanation=explanation,
                qtype=qtype,
                source=q.get("source"),
                page=q.get("page"),
                chapter_id=q.get("chapter_id"),
                chapter_title=q.get("chapter_title"),
                snippet=q.get("snippet"),
                material_id=material_id,
                concept_key=concept_key,
            )
        )

    return QuizGenerateResponse(questions=items)


@app.post("/api/quiz/submit", response_model=QuizSubmitResponse)
def api_quiz_submit(req: QuizSubmitRequest) -> QuizSubmitResponse:
    """
    前端在用户点击“提交并查看解析”后调用：
    - 统计本次得分
    - 写入 analytics/quiz_history.json（通过 learning_tracker.record_quiz_attempt）
    """
    if not req.questions:
        raise HTTPException(status_code=400, detail="没有题目，无法记录测验。")

    material: Optional[Material] = None
    if req.material_id:
        material = _find_material_by_id(req.material_id)
    base_material_id = material.id if material else req.material_id

    results: List[Dict[str, Any]] = []
    score_raw = 0

    for q in req.questions:
        qtype = q.qtype or ("choice" if q.options else "boolean")
        user_answer = (q.user_answer or "").strip()
        correct_answer = (q.correct or "").strip()
        is_unanswered = user_answer == ""
        is_correct = bool(user_answer and correct_answer and user_answer.lower() == correct_answer.lower())
        if is_correct:
            score_raw += 1

        results.append(
            {
                "id": q.id,
                "question": q.stem,
                "type": qtype,
                "options": q.options or [],
                "correct_answer": q.correct,
                "user_answer": q.user_answer,
                "is_correct": is_correct,
                "is_unanswered": is_unanswered,
                "explanation": q.explanation,
                "source": q.source,
                "page": q.page,
                "chapter_id": q.chapter_id,
                "chapter_title": q.chapter_title,
                "snippet": q.snippet,
                "concept_key": q.concept_key,
                "material_id": q.material_id or base_material_id,
            }
        )

    score_total = len(results)
    score_percentage = float(score_raw) / score_total * 100.0 if score_total > 0 else 0.0

    report_obj: Dict[str, Any] = {
        "results": results,
        "score_raw": score_raw,
        "score_total": score_total,
        "score_percentage": score_percentage,
    }

    metadata: Dict[str, Any] = {
        "difficulty": req.difficulty,
        "source": (material.source if material else CURRENT_QUIZ_SOURCE or "builtin"),
        "mode": req.mode,
        "material_id": material.id if material else req.material_id,
        "material_name": material.name if material else None,
        "chapter_id": results[0].get("chapter_id") if results else None,
        "chapter_title": results[0].get("chapter_title") if results else None,
        "num_choice": req.num_choice,
        "num_boolean": req.num_boolean,
    }

    try:
        _ = record_quiz_attempt(report_obj, metadata)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"记录测验历史失败: {e}")

    next_chapter = _next_chapter(metadata.get("material_id"), metadata.get("chapter_id"))

    return QuizSubmitResponse(
        score_raw=score_raw,
        score_total=score_total,
        score_percentage=score_percentage,
        next_chapter=next_chapter,
    )


@app.get("/api/quiz/wrong", response_model=List[WrongQuestion])
def api_get_wrong_questions(
    limit: int = 50,
    material_id: Optional[str] = None,
    chapter_id: Optional[str] = None,
) -> List[WrongQuestion]:
    history = load_quiz_history(limit=200)
    wrong_items = collect_wrong_questions(
        history,
        limit=limit,
        material_id=material_id,
        chapter_id=chapter_id,
    )
    response: List[WrongQuestion] = []
    for idx, item in enumerate(wrong_items):
        concept_seed = item.get("snippet") or item.get("stem") or ""
        qtype = item.get("type") or ("boolean" if len(item.get("options") or []) == 2 else "choice")
        meta = {
            "source": item.get("source"),
            "page": item.get("page"),
            "chapter_id": item.get("chapter_id"),
            "chapter_title": item.get("chapter_title"),
            "material_id": item.get("material_id") or material_id,
        }
        regenerated = regenerate_question_from_concept(
            concept_seed,
            metadata=meta,
            difficulty="medium",
            q_type=qtype or "choice",
            avoid_question=item.get("previous_question") or item.get("stem"),
        )

        stem = item.get("stem") or ""
        options = item.get("options") or []
        correct_value = item.get("correct")
        explanation = item.get("explanation")
        snippet = item.get("snippet")
        material_value = meta.get("material_id")

        if regenerated:
            stem = regenerated.get("question") or regenerated.get("stem") or stem
            options = regenerated.get("options") or options
            idx_answer = regenerated.get("correct_answer_index")
            if isinstance(idx_answer, int) and 0 <= idx_answer < len(options):
                correct_value = options[idx_answer]
            explanation = regenerated.get("explanation") or explanation
            snippet = regenerated.get("snippet") or snippet
            material_value = regenerated.get("material_id") or material_value
            qtype = regenerated.get("type") or qtype

        concept_key = item.get("concept_key") or derive_concept_key(
            {
                "stem": stem,
                "question": stem,
                "source": item.get("source"),
                "page": item.get("page"),
                "chapter_id": item.get("chapter_id"),
                "snippet": snippet,
            }
        )

        response.append(
            WrongQuestion(
                id=idx + 1,
                stem=stem,
                options=options,
                correct=correct_value,
                explanation=explanation,
                source=item.get("source"),
                page=item.get("page"),
                chapter_id=item.get("chapter_id"),
                chapter_title=item.get("chapter_title"),
                snippet=snippet,
                qtype=qtype,
                concept_key=concept_key,
                material_id=material_value,
            )
        )
    return response


@app.get("/api/report/overview", response_model=StudyReportOverview)
def api_report_overview() -> StudyReportOverview:
    """
    学习报告概览：
    - 使用 learning_tracker 的历史统计
    """
    history = load_quiz_history(limit=50)
    summary = summarize_history(history)
    tag_counts: List[Tuple[str, int]] = aggregate_knowledge_tags(history, topk=6)

    overview = StudyOverview(
        attempts=summary["attempts"],
        average_score=summary["average_score"],
        best_score=summary["best_score"],
        recent_score=summary["recent_score"],
    )
    focus_topics = [tag for tag, _ in tag_counts]

    return StudyReportOverview(overview=overview, focus_topics=focus_topics)


@app.get("/api/report/diagnostic", response_model=StudyDiagnosticResponse)
def api_report_diagnostic(
    limit: int = 10,
    material_id: Optional[str] = None,
) -> StudyDiagnosticResponse:
    history = load_quiz_history(limit=limit)
    if material_id:
        history = [h for h in history if h.get("material_id") == material_id]
    md = generate_diagnostic_report(history)
    return StudyDiagnosticResponse(markdown=md)


@app.get("/api/report/timeline", response_model=List[ScorePoint])
def api_report_timeline(limit: int = 50) -> List[ScorePoint]:
    history = load_quiz_history(limit=limit)
    timeline = build_score_timeline(history)
    return [ScorePoint(ts=item.get("ts"), score=float(item.get("score", 0.0))) for item in timeline]
