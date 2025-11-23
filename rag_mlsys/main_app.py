import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Literal, Tuple

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_chroma import Chroma
from langchain_core.documents import Document

from rag_service import RAGService
from core_processing import process_single_pdf
from learning_tracker import (
    load_quiz_history,
    summarize_history,
    aggregate_knowledge_tags,
    record_quiz_attempt,   
)
from quiz_module.question_generator import generate_quiz_questions

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

_vector_store: Optional[Chroma] = getattr(rag_service, "vector_store", None)
_embedding_model = getattr(rag_service, "embedding_model", None)

CURRENT_QUIZ_SOURCE: Optional[str] = None


class Material(BaseModel):
    id: str
    name: str
    source: str
    kind: Literal["builtin", "uploaded"]


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

class QuizItem(BaseModel):
    id: int
    stem: str
    options: Optional[List[str]] = None
    correct: Optional[str] = None
    explanation: Optional[str] = None
    qtype: Optional[str] = None  


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


class QuizSubmitRequest(BaseModel):
    difficulty: QuizDifficulty
    questions: List[QuizSubmitQuestion]


class QuizSubmitResponse(BaseModel):
    score_raw: int
    score_total: int
    score_percentage: float

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

        answer, sources = rag_service.answer(
            req.question,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            k=req.k,
            enable_expansion=req.enable_expansion,
            use_fewshot=req.use_fewshot,
            use_multi_turn=req.use_multi_turn,
            history=history_list,
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
    uploaded_dir = Path("./uploaded_pdfs")
    uploaded=_load_uploaded_materials()

    if uploaded_dir.exists():
        for pdf in sorted(uploaded_dir.glob("*.pdf")):
            uploaded.append(
                Material(
                    id=pdf.stem,
                    name=pdf.name,
                    source=str(pdf),
                    kind="uploaded",
                )
            )

    return MaterialsResponse(builtins=BUILTIN_MATERIALS, uploaded=uploaded)


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

    search_kwargs: Dict[str, Any] = {"k": 8}

    if selected_material is not None:
        search_kwargs["filter"] = {"source": selected_material.source}
    elif CURRENT_QUIZ_SOURCE:
        search_kwargs["filter"] = {"source": CURRENT_QUIZ_SOURCE}

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

        correct_value: Optional[str] = None
        idx = q.get("correct_answer_index")
        if isinstance(idx, int) and 0 <= idx < len(options):
            correct_value = options[idx]
        else:
            correct_value = q.get("correct") or q.get("correct_answer")

        explanation = q.get("explanation") or q.get("analysis")

        items.append(
            QuizItem(
                id=i + 1,
                stem=stem,
                options=options,
                correct=correct_value,
                explanation=explanation,
                qtype=qtype,
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

    results: List[Dict[str, Any]] = []

    for q in req.questions:
        qtype = q.qtype or ("choice" if q.options else "boolean")
        user_answer = q.user_answer or ""
        is_correct = bool(q.is_correct)
        is_unanswered = user_answer.strip() == ""

        results.append(
            {
                "question": q.stem,
                "type": qtype,
                "options": q.options,
                "correct_answer": q.correct,
                "user_answer": user_answer,
                "is_correct": is_correct,
                "is_unanswered": is_unanswered,
            }
        )

    score_total = len(results)
    score_raw = sum(1 for r in results if r.get("is_correct"))
    score_percentage = float(score_raw) / score_total * 100.0 if score_total > 0 else 0.0

    report_obj: Dict[str, Any] = {
        "results": results,
        "score_raw": score_raw,
        "score_total": score_total,
        "score_percentage": score_percentage,
    }

    metadata: Dict[str, Any] = {
        "difficulty": req.difficulty,
        "source": CURRENT_QUIZ_SOURCE or "builtin",
        "mode": "upload_only" if CURRENT_QUIZ_SOURCE else "builtin_only",
    }

    try:
        _ = record_quiz_attempt(report_obj, metadata)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"记录测验历史失败: {e}")

    return QuizSubmitResponse(
        score_raw=score_raw,
        score_total=score_total,
        score_percentage=score_percentage,
    )


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
