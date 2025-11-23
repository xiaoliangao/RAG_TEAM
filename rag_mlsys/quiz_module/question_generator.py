# quiz_module/question_generator.py

from __future__ import annotations

import json
import random
import re
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever

from llm_client import chat_completion

GENERATION_CONFIG: Dict[str, Any] = {
    "max_new_tokens": 1024,
    "temperature": 0.2,  
    "top_p": 0.85,
    "do_sample": True,
}


def _is_valid_content_chunk(content: str) -> bool:
    """
    第一层过滤：避免从目录、版权页、索引等位置出题。
    """
    if not content or len(content.strip()) < 30:
        return False

    meta_patterns = [
        r"版权",
        r"版权所有",
        r"作者简历",
        r"封面",
        r"扉页",
        r"目录",
        r"前言",
        r"致谢",
        r"勘误",
        r"索引",
        r"参考文献",
        r"附录",
        r"谢辞",
        r"鸣谢",
        r"序言",
        r"封底",
        r"http[s]?://",
        r"www\.",
        r"第\s*\d+\s*章\s*$",
        r"第\s*\d+\s*节\s*$",
        r"图\s*\d+[-．.]\d+",
        r"表\s*\d+[-．.]\d+",
        r"例\s*\d+[-．.]\d+",
    ]

    hit_count = 0
    for pat in meta_patterns:
        if re.search(pat, content):
            hit_count += 1

    if hit_count >= 2:
        return False

    digit_count = sum(c.isdigit() for c in content)
    if len(content) > 0 and (digit_count / len(content)) > 0.15:
        return False

    if len(content) < 150:  
        return False

    return True



def _build_question_gen_prompt(
    context: str,
    q_type: str,
    difficulty: str,
    target_truth: Optional[str] = None,  
) -> List[Dict[str, str]]:
    """构造给 LLM 的出题 Prompt（DeepSeek 使用 OpenAI 格式）"""

    if q_type == "choice":
        task_desc = "设计一道四选一的选择题"
        json_template = """{
    "valid": true,
    "question": "题目内容",
    "type": "choice",
    "options": ["选项1", "选项2", "选项3", "选项4"],
    "correct_answer_index": 0,
    "explanation": "解析"
}"""
        truth_hint = ""
    else:
        task_desc = "设计一道判断题"
        json_template = """{
    "valid": true,
    "question": "题目内容",
    "type": "boolean",
    "options": ["正确", "错误"],
    "correct_answer_index": 0,
    "explanation": "解析"
}"""

        if target_truth == "true":
            truth_hint = (
                "\n- 本题的陈述必须是**真实命题**，使得根据教材内容判断时，标准答案为“正确”（即 correct_answer_index 必须为 0）。"
            )
        elif target_truth == "false":
            truth_hint = (
                "\n- 本题的陈述必须是**错误命题**，使得根据教材内容判断时，标准答案为“错误”（即 correct_answer_index 必须为 1）。"
                "\n  你可以在教材中的某个正确结论基础上做适度改动，使其变为错误（例如混淆条件、范围、顺序等），但不要凭空编造与教材完全无关的内容。"
            )
        else:
            truth_hint = ""

    system_prompt = f"""你是一位严苛的计算机科学考试出题专家。

目标：基于给定的教材片段，{task_desc}（机器学习 / 深度学习 / 统计学习 相关）。

【重要出题原则】：
1. **必须与教材内容强相关**，不要凭空编造知识点。
2. 避免出“过于细枝末节”的题目（例如只问某个具体数字/百分比）。
3. 避免出“纯记忆型”的题目（例如：某人是谁、在哪一年提出）。
4. 尽量考察「概念理解」「原理机制」「优缺点对比」「适用场景」等。
5. 题干要清晰完整，语言简洁，避免多重否定。
6. 若文本只包含版权信息、纯实验数据、公式堆砌、目录等，判定为不适合出题。

【难度要求】：
- 如果 difficulty = "easy"：偏基础概念，题目直白。
- 如果 difficulty = "medium"：适度考察理解与推理。
- 如果 difficulty = "hard"：可以结合多个概念，同步考察「理解 + 应用」。

【判断题特殊要求】：{truth_hint}

【输出要求】：
- 必须输出 **JSON 格式**，符合以下字段定义：
{json_template}

- 其中：
  - "valid": 当文本不适合出题时，必须返回 false。
  - "question": 用中文描述题干，不要超过 80 字。
  - "options": 对于 choice 题，保证只有 4 个选项；对于 boolean 题，必须为 ["正确","错误"]。
  - "correct_answer_index": 对应 options 中的正确项下标（0-based）。
  - "explanation": 给出 1-3 句简明解析。
"""

    user_message = f"""**参考文本：**
{context[:1500]}

---

请执行任务。如果你认为这段文本不包含有价值的考点（例如只是版权信息或纯实验数据），请务必返回 `{{ "valid": false }}`。"""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def _parse_llm_json_output(raw_text: str) -> Optional[Dict[str, Any]]:
    """
    尝试从模型回复中提取 JSON。
    如果模型判断不适合出题，应返回 {"valid": false}
    """
    if not raw_text:
        return None

    try:
        start_obj = raw_text.find("{")
        start_arr = raw_text.find("[")
        start = -1
        if start_obj != -1 and (start_arr == -1 or start_obj < start_arr):
            start = start_obj
        elif start_arr != -1:
            start = start_arr

        end = raw_text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None

        json_str = raw_text[start : end + 1]
        data = json.loads(json_str)
    except Exception:
        return None

    if isinstance(data, list):
        if not data:
            return None
        data = data[0]

    if not isinstance(data, dict):
        return None

    if not data.get("valid", True):
        return None

    question = str(data.get("question", "")).strip()
    qtype = data.get("type", "choice")
    options = data.get("options", [])

    if not isinstance(options, list) or len(options) < 2:
        return None

    idx = data.get("correct_answer_index", None)
    if not isinstance(idx, int) or not (0 <= idx < len(options)):
        return None

    def _clean_opt(opt: Any) -> str:
        text = str(opt).strip()
        text = re.sub(r"^[A-DＡ-Ｄ]\s*[\.．、]\s*", "", text)
        return text.strip()

    cleaned_options = [_clean_opt(o) for o in options]

    q = {
        "question": question,
        "type": qtype,
        "options": cleaned_options,
        "correct_answer_index": idx,
        "explanation": str(data.get("explanation", "")).strip(),
    }
    return q


def _validate_question_quality(question: Dict[str, Any]) -> (bool, str):
    """
    第二层过滤：题干长度、是否纯数字选项、是否过于水。
    """
    q_text = question["question"]
    if len(q_text) < 8:
        return False, "题干太短"

    semantic_blacklist = [
        "MNIST",
        "CIFAR",
        "ImageNet",
        "实验",
        "实验结果",
        "准确率达到",
        "多少%",
        "具体数值",
    ]
    for w in semantic_blacklist:
        if w in q_text:
            return False, f"包含禁止词汇 '{w}'"

    if question["type"] == "choice":
        opts = question["options"]
        if not isinstance(opts, list) or len(opts) < 2:
            return False, "选项数量不足"
        digit_opts = sum(1 for o in opts if re.match(r"^[\d\.\%]+$", str(o).strip()))
        if digit_opts >= 3:
            return False, "选项全是纯数字，疑似无意义数值题"

    return True, "OK"



def generate_quiz_questions(
    retriever: BaseRetriever,
    tokenizer: Any, 
    model: Any,      
    device: str,    
    num_choice: int = 3,
    num_boolean: int = 2,
    difficulty: str = "medium",
    max_retries: int = 3,
) -> List[Dict[str, Any]]:
    """
    使用检索到的教材片段 + DeepSeek (llm_client.chat_completion) 生成选择题/判断题。
    判断题里强制混入一部分“错误命题”，避免全部都是“正确”。
    """

    all_docs: List[Document] = []
    try:
        if hasattr(retriever, "retrievers") and len(getattr(retriever, "retrievers", [])) > 1:
            bm25 = retriever.retrievers[1]
            if hasattr(bm25, "documents"):
                all_docs = bm25.documents

        if not all_docs:
            queries = ["概念定义", "核心原理", "算法机制", "优缺点"]
            for q in queries:
                try:
                    docs = retriever.invoke(q)
                except Exception:
                    docs = retriever.get_relevant_documents(q)
                all_docs.extend(docs)

        seen = set()
        unique_docs: List[Document] = []
        for d in all_docs:
            if d.page_content in seen:
                continue
            if _is_valid_content_chunk(d.page_content):
                unique_docs.append(d)
            seen.add(d.page_content)
        all_docs = unique_docs

        if not all_docs:
            print("❌ 有效知识库为空（已过滤掉版权页等低质内容）")
            return []

    except Exception as e:
        print(f"检索失败: {e}")
        return []


    def _generate_batch(
        target_count: int,
        q_type: str,
        truth_schedule: Optional[List[str]] = None,  
    ) -> List[Dict[str, Any]]:
        batch_questions: List[Dict[str, Any]] = []
        attempts = 0
        max_total_attempts = target_count * 6  

        while len(batch_questions) < target_count and attempts < max_total_attempts:
            attempts += 1

            doc = random.choice(all_docs)
            content = doc.page_content

            target_truth = None
            if q_type == "boolean" and truth_schedule:
                if len(batch_questions) < len(truth_schedule):
                    target_truth = truth_schedule[len(batch_questions)]

            messages = _build_question_gen_prompt(
                content,
                q_type,
                difficulty,
                target_truth=target_truth,
            )

            try:
                response = chat_completion(
                    messages=messages,
                    temperature=GENERATION_CONFIG.get("temperature", 0.2),
                    max_tokens=GENERATION_CONFIG.get("max_new_tokens", 1024),
                )

                parsed = _parse_llm_json_output(response)

                if parsed:
                    if q_type == "boolean" and target_truth is not None:
                        idx = parsed.get("correct_answer_index", None)
                        expected_idx = 0 if target_truth == "true" else 1
                        if not isinstance(idx, int) or idx != expected_idx:
                            print(
                                f"Skip boolean Q: truth mismatch (expected {expected_idx}, got {idx})"
                            )
                            continue

                    is_valid, msg = _validate_question_quality(parsed)
                    if is_valid:
                        q = parsed.copy()

                        if q.get("type") == "choice":
                            opts = q.get("options", [])
                            idx = q.get("correct_answer_index", 0)
                            if isinstance(idx, int) and 0 <= idx < len(opts):
                                correct_opt = opts[idx]
                                random.shuffle(opts)
                                new_idx = opts.index(correct_opt)
                                q["options"] = opts
                                q["correct_answer_index"] = new_idx

                        batch_questions.append(q)
                    else:
                        print(f"Skipped (Validation): {msg}")
                else:
                    print("Skipped (Model Refused or Parse Failed)")

            except Exception as e:
                print(f"Gen Error: {e}")
                continue

        return batch_questions

    choice_qs = _generate_batch(num_choice, "choice") if num_choice > 0 else []

    bool_qs: List[Dict[str, Any]] = []
    if num_boolean > 0:
        num_false = max(1, num_boolean // 2)
        num_true = num_boolean - num_false
        truth_schedule = ["false"] * num_false + ["true"] * num_true
        random.shuffle(truth_schedule)

        bool_qs = _generate_batch(num_boolean, "boolean", truth_schedule=truth_schedule)

    questions = choice_qs + bool_qs

    if len(questions) < (num_choice + num_boolean):
        print(f"⚠️ 经过严格质量过滤，仅生成了 {len(questions)} 道题目")
    else:
        print(f"✅ 成功生成 {len(questions)} 道题目")

    return questions
