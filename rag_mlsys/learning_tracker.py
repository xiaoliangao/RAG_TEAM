# learning_tracker.py
"""
学习行为追踪模块
记录测验历史并提供聚合所需的数据
"""

from __future__ import annotations

import json
import re
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ANALYTICS_DIR = Path("./analytics")
QUIZ_HISTORY_FILE = ANALYTICS_DIR / "quiz_history.json"
MAX_HISTORY = 200


def derive_concept_key(question: Dict[str, Any]) -> str:
    """
    Build a stable concept identifier so we can map multiple attempts
    to the same underlying knowledge point even if the question text changes.
    """
    if question.get("concept_key"):
        return str(question["concept_key"])

    source = str(question.get("source") or "unknown_source")
    chapter = str(question.get("chapter_id") or "")
    page = str(question.get("page") or "")
    snippet = (
        question.get("concept_snippet")
        or question.get("snippet")
        or question.get("stem")
        or question.get("question")
        or ""
    )
    snippet_norm = re.sub(r"\s+", " ", snippet).strip().lower()[:160]
    if not snippet_norm:
        snippet_norm = "no_snippet"
    return "|".join([source, chapter, page, snippet_norm])


def _ensure_dir() -> None:
    ANALYTICS_DIR.mkdir(parents=True, exist_ok=True)


def load_quiz_history(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """加载测验历史，按时间升序返回"""
    _ensure_dir()
    if not QUIZ_HISTORY_FILE.exists():
        return []
    
    try:
        with open(QUIZ_HISTORY_FILE, "r", encoding="utf-8") as f:
            history = json.load(f)
            if not isinstance(history, list):
                history = []
    except Exception:
        history = []
    
    history.sort(key=lambda x: x.get("timestamp", ""))
    if limit:
        return history[-limit:]
    return history


def _save_history(history: List[Dict[str, Any]]) -> None:
    _ensure_dir()
    with open(QUIZ_HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def record_quiz_attempt(report: Dict[str, Any], metadata: Dict[str, Any]) -> Dict[str, Any]:
    """记录一次测验结果，包含题目级别信息。"""
    history = load_quiz_history()
    results = report.get("results", [])
    total = len(results)
    correct = sum(1 for item in results if item.get("is_correct"))
    unanswered = sum(1 for item in results if item.get("is_unanswered"))
    wrong = total - correct - unanswered

    questions = []
    for item in results:
        concept_key = derive_concept_key(item)
        questions.append(
            {
                "id": item.get("id") or str(uuid.uuid4()),
                "stem": item.get("question"),
                "options": item.get("options"),
                "correct": item.get("correct_answer"),
                "user_answer": item.get("user_answer"),
                "is_correct": bool(item.get("is_correct")),
                "is_unanswered": bool(item.get("is_unanswered")),
                "explanation": item.get("explanation"),
                "source": item.get("source"),
                "page": item.get("page"),
                "chapter_id": item.get("chapter_id"),
                "chapter_title": item.get("chapter_title"),
                "snippet": item.get("snippet"),
                "tags": item.get("tags"),
                "type": item.get("type"),
                "concept_key": concept_key,
                "material_id": metadata.get("material_id"),
            }
        )

    entry = {
        "attempt_id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "score_percentage": float(report.get("score_percentage", 0.0)),
        "score_raw": int(report.get("score_raw", correct)),
        "score_total": int(report.get("score_total", total)),
        "correct": int(correct),
        "wrong": int(wrong),
        "unanswered": int(unanswered),
        "total": int(total),
        "difficulty": metadata.get("difficulty", "medium"),
        "num_choice": metadata.get("num_choice", 0),
        "num_boolean": metadata.get("num_boolean", 0),
        "material_id": metadata.get("material_id"),
        "material_name": metadata.get("material_name"),
        "chapter_id": metadata.get("chapter_id"),
        "chapter_title": metadata.get("chapter_title"),
        "knowledge_tags": metadata.get("knowledge_tags") or _extract_keywords(report),
        "type_breakdown": _type_breakdown(report),
        "questions": questions,
    }
    history.append(entry)
    history = history[-MAX_HISTORY:]
    _save_history(history)
    return entry


def summarize_history(history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """给前端提供的汇总指标"""
    if not history:
        return {
            "attempts": 0,
            "average_score": 0.0,
            "best_score": 0.0,
            "recent_score": 0.0,
        }
    
    scores = [h.get("score_percentage", 0.0) for h in history]
    return {
        "attempts": len(history),
        "average_score": sum(scores) / len(scores),
        "best_score": max(scores),
        "recent_score": scores[-1],
    }


def aggregate_knowledge_tags(history: List[Dict[str, Any]], topk: int = 6) -> List[tuple[str, int]]:
    """统计最常出现的薄弱知识点标签"""
    counter: Counter = Counter()
    for entry in history:
        for tag in entry.get("knowledge_tags", []):
            if tag:
                counter[tag] += 1
    return counter.most_common(topk)


def aggregate_difficulty_performance(history: List[Dict[str, Any]]) -> Dict[str, float]:
    """按难度统计平均得分"""
    buckets: Dict[str, List[float]] = {}
    for entry in history:
        difficulty = entry.get("difficulty", "unknown")
        buckets.setdefault(difficulty, []).append(entry.get("score_percentage", 0.0))
    
    return {
        diff: (sum(scores) / len(scores)) if scores else 0.0
        for diff, scores in buckets.items()
    }


def _extract_keywords(report: Dict[str, Any], max_terms: int = 6) -> List[str]:
    """从错题题干中提取关键概念"""
    wrong_questions = [
        item for item in report.get("results", [])
        if not item.get("is_correct") and not item.get("is_unanswered")
    ]
    tokens: Counter = Counter()
    for item in wrong_questions:
        text = item.get("question", "")
        zh_terms = re.findall(r"[\u4e00-\u9fff]{2,}", text)
        en_terms = re.findall(r"[A-Za-z]{3,}", text)
        for term in zh_terms + en_terms:
            tokens[term] += 1
    most_common = [term for term, _ in tokens.most_common(max_terms)]
    return most_common


def _type_breakdown(report: Dict[str, Any]) -> Dict[str, Dict[str, int]]:
    """统计不同题型的正确数量"""
    stats: Dict[str, Dict[str, int]] = {}
    for item in report.get("results", []):
        q_type = item.get("type", "unknown")
        stats.setdefault(q_type, {"total": 0, "correct": 0})
        stats[q_type]["total"] += 1
        if item.get("is_correct"):
            stats[q_type]["correct"] += 1
    return stats


def collect_wrong_questions(
    history: List[Dict[str, Any]],
    limit: int = 50,
    material_id: Optional[str] = None,
    chapter_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    聚合错题，支持按教材/章节过滤。
    规则：对同一道题只看最近一次作答；只有最近一次仍然做错的题才算“错题”。

    题目标识 key = (stem/question 文本, source, page)。
    """

    # key -> 最近一次是否答对
    latest_status: Dict[str, bool] = {}
    # key -> 最近一次作答的完整题目数据（用于返回）
    latest_detail: Dict[str, Dict[str, Any]] = {}

    # 假设 load_quiz_history 返回的 history 是按时间顺序排列（最早在前，最近在后）
    # 这样后面的记录会覆盖前面的记录，最终保留“最近一次”的状态
    for attempt in history:
        # 教材过滤
        if material_id and attempt.get("material_id") != material_id:
            continue

        for q in attempt.get("questions", []):
            if chapter_id and q.get("chapter_id") != chapter_id:
                continue

            stem = q.get("stem") or q.get("question") or ""
            source = q.get("source")
            page = q.get("page")

            key = derive_concept_key(q)
            is_correct = bool(q.get("is_correct"))

            latest_status[key] = is_correct
            latest_detail[key] = q

    wrong_items: List[Dict[str, Any]] = []
    for key, is_correct in latest_status.items():
        if is_correct:
            continue  

        q = latest_detail[key].copy()
        wrong_items.append(
            {
                "concept_key": q.get("concept_key") or key,
                "stem": q.get("stem") or q.get("question"),
                "options": q.get("options") or [],
                "correct": q.get("correct"),
                "explanation": q.get("explanation"),
                "source": q.get("source"),
                "page": q.get("page"),
                "chapter_id": q.get("chapter_id"),
                "chapter_title": q.get("chapter_title"),
                "snippet": q.get("snippet"),
                "tags": q.get("tags") or [],
                "type": q.get("type"),
                "material_id": q.get("material_id"),
                "previous_question": q.get("stem") or q.get("question"),
            }
        )
        if len(wrong_items) >= limit:
            break

    return wrong_items


def build_score_timeline(history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """返回时间序列数据"""
    timeline: List[Dict[str, Any]] = []
    for entry in history[-100:]:
        timeline.append(
            {
                "ts": entry.get("timestamp"),
                "score": entry.get("score_percentage", 0.0),
            }
        )
    return timeline
