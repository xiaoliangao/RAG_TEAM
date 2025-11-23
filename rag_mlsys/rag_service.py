# rag_service.py
from __future__ import annotations
import torch
import os
import hashlib
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.retrievers import BM25Retriever

from llm_client import chat_completion, LLMClientError  


VECTOR_DB_PATH = "./vector_db"
EMBEDDING_MODEL_NAME = "./models/bge-large-zh-v1.5"


@dataclass
class RetrievedChunk:
    content: str
    source: str
    page: Optional[int] = None


class EnsembleRetriever:
    def __init__(self, db: Chroma, k: int = 6):
        self.k = k
        self.vector_retriever = db.as_retriever(
            search_type="similarity",
            search_kwargs={"k": k},
        )

        # 构建 BM25
        all_data = db.get()
        self.bm25_retriever: Optional[BM25Retriever] = None
        if all_data and all_data.get("documents"):
            docs = [
                Document(page_content=doc, metadata=meta)
                for doc, meta in zip(
                    all_data["documents"],
                    all_data.get("metadatas", [{}] * len(all_data["documents"])),
                )
            ]
            self.bm25_retriever = BM25Retriever.from_documents(docs)
            self.bm25_retriever.k = k
    def _call_retriever(self, retriever, query: str) -> List[Document]:
        if hasattr(retriever, "invoke"):
            res = retriever.invoke(query)
        # 老版本接口
        elif hasattr(retriever, "get_relevant_documents"):
            res = retriever.get_relevant_documents(query)
        else:
            raise RuntimeError(
                f"检索器对象 {type(retriever)} 不支持 invoke 或 get_relevant_documents 方法"
            )

        if isinstance(res, dict) and "documents" in res:
            return res["documents"]
        return res
    
    def retrieve(self, query: str) -> List[Document]:
        docs: List[Document] = []

        docs.extend(self._call_retriever(self.vector_retriever, query))

        if self.bm25_retriever:
            docs.extend(self._call_retriever(self.bm25_retriever, query))

        unique: Dict[str, Document] = {}
        for d in docs:
            key = d.page_content.strip()
            if key and key not in unique:
                unique[key] = d
        return list(unique.values())[: self.k]


def generate_queries(original_query: str, num_queries: int = 2) -> List[str]:
    """智能查询扩展（从你现有 module_rag_assistant 中提取出来的逻辑）:contentReference[oaicite:4]{index=4}"""
    queries = [original_query]

    if not original_query.startswith(("什么", "如何", "为什么", "请问", "能否", "怎么")):
        queries.append(f"什么是{original_query}")

    if "解释" not in original_query and "介绍" not in original_query:
        queries.append(f"请解释{original_query}")

    domain_keywords = ["机器学习", "深度学习", "神经网络", "算法"]
    has_domain = any(kw in original_query for kw in domain_keywords)
    if not has_domain and len(queries) < num_queries + 1:
        queries.append(f"深度学习中的{original_query}")

    return queries[: num_queries + 1]


def smart_context_selection(docs: List[Document], query: str, max_docs: int = 4) -> List[Document]:
    """智能上下文选择（从 module_rag_assistant 中抽取，去掉 Streamlit）:contentReference[oaicite:5]{index=5}"""
    if len(docs) <= max_docs:
        return docs

    query_terms = set(query.lower().split())
    scored_docs = []

    for doc in docs:
        content_lower = doc.page_content.lower()
        keyword_score = sum(1 for term in query_terms if term in content_lower)
        length_score = min(len(doc.page_content) / 1000, 2.0)
        diversity_score = 1.0
        total_score = keyword_score * 2 + length_score + diversity_score
        scored_docs.append((total_score, doc))

    scored_docs.sort(reverse=True, key=lambda x: x[0])
    return [doc for _, doc in scored_docs[:max_docs]]


def extract_dialogue_context(messages: List[Dict[str, str]], max_history: int = 3) -> Optional[str]:
    """提取多轮对话上下文（纯后端版本）"""
    if len(messages) < 3:
        return None

    recent_messages = messages[-(2 * max_history):]
    context_parts = []
    for i in range(0, len(recent_messages), 2):
        if i + 1 < len(recent_messages):
            user_msg = recent_messages[i]["content"][:150]
            assistant_msg = recent_messages[i + 1]["content"][:150]
            context_parts.append(f"Q: {user_msg}\nA: {assistant_msg}")

    return "\n\n".join(context_parts) if context_parts else None


def build_enhanced_prompt(
    context: str,
    question: str,
    dialogue_history: Optional[str] = None,
    use_fewshot: bool = True,
    use_multi_turn: bool = True,
) -> List[Dict[str, str]]:
    """构建 prompt（从 module_rag_assistant 中复制/调整）:contentReference[oaicite:6]{index=6}"""

    system_prompt = """你是一位经验丰富的机器学习与深度学习专家教师。你的使命是帮助学习者深入理解复杂的技术概念。
（此处省略具体教学原则文本，可以从原文件复制）"""

    fewshot_text = ""

    history_section = ""
    if use_multi_turn and dialogue_history:
        history_section = f"\n\n**之前的对话：**\n{dialogue_history}\n"

    user_message = f"""{fewshot_text}

**参考资料：**
{context}{history_section}

---

**当前问题：** {question}

请基于参考资料，提供一个专业、准确且易于理解的回答。"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
    return messages


class RAGService:
    def __init__(
        self,
        db_path: str = VECTOR_DB_PATH,
        embedding_model_name: str = EMBEDDING_MODEL_NAME,
        k: int = 4,
    ):
        device = "cuda" if torch.cuda.is_available() else "cpu"

        self.embedding_model = HuggingFaceEmbeddings(
            model_name=embedding_model_name,
            model_kwargs={"device": device},
            encode_kwargs={"normalize_embeddings": True},
        )

        self.db = Chroma(
            persist_directory=db_path,
            embedding_function=self.embedding_model,
        )

        self.retriever = EnsembleRetriever(self.db, k=k)

    def retrieve_with_enhancements(
        self, query: str, k: int = 4, enable_expansion: bool = True
    ) -> Tuple[str, List[str], List[Document]]:
        all_docs: List[Document] = []
        seen_content = set()

        queries = generate_queries(query, num_queries=2) if enable_expansion else [query]
        for q in queries:
            docs = self.retriever.retrieve(q)
            for doc in docs:
                content_hash = hashlib.md5(doc.page_content.encode()).hexdigest()
                if content_hash not in seen_content:
                    all_docs.append(doc)
                    seen_content.add(content_hash)

        final_docs = smart_context_selection(all_docs, query, max_docs=k)

        context_parts = []
        sources = []
        for i, doc in enumerate(final_docs, 1):
            source = doc.metadata.get("source", "Unknown")
            page = doc.metadata.get("page", "N/A")
            context_parts.append(f"[文档 {i}]\n{doc.page_content}")
            sources.append(f"{source} (页码: {page})")

        context = "\n\n".join(context_parts)
        return context, sources, final_docs

    def answer(
        self,
        question: str,
        history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        k: int = 4,
        enable_expansion: bool = True,
        use_fewshot: bool = True,
        use_multi_turn: bool = True,
    ) -> Tuple[str, List[str]]:
        context, sources, docs = self.retrieve_with_enhancements(
            question, k=k, enable_expansion=enable_expansion
        )

        dialogue_history = None
        if use_multi_turn and history:
            dialogue_history = extract_dialogue_context(history)

        messages = build_enhanced_prompt(
            context,
            question,
            dialogue_history=dialogue_history,
            use_fewshot=use_fewshot,
            use_multi_turn=use_multi_turn,
        )

        answer = chat_completion(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return answer, sources
