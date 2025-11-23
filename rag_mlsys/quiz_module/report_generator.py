import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from llm_client import chat_completion
from typing import List, Dict, Any
import pandas as pd
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from io import BytesIO
import os
import re


GENERATION_CONFIG = {
    "max_new_tokens": 2048,
    "temperature": 0.6,
    "top_p": 0.9,
    "do_sample": True,
    "repetition_penalty": 1.1,
}


FONT_PATH = os.path.join(os.path.dirname(__file__), "assets", "msyh.ttf")
if os.path.exists(FONT_PATH):
    try:
        pdfmetrics.registerFont(TTFont("CustomChineseFont", FONT_PATH))
    except Exception:
        pass


def _draw_header(canvas, doc):
    """绘制 PDF 页眉"""
    canvas.saveState()
    # 顶部蓝色装饰条
    canvas.setFillColor(colors.HexColor("#4F46E5"))
    canvas.rect(0, A4[1] - 2 * cm, A4[0], 2 * cm, fill=1, stroke=0)

    # 标题
    canvas.setFont("CustomChineseFont", 16)
    canvas.setFillColor(colors.white)
    canvas.drawString(2 * cm, A4[1] - 1.3 * cm, "AI 导师智能诊断报告")

    # 日期
    canvas.setFont("CustomChineseFont", 10)
    canvas.drawRightString(
        A4[0] - 2 * cm, A4[1] - 1.3 * cm, datetime.now().strftime("%Y-%m-%d")
    )
    canvas.restoreState()


@torch.no_grad()
def generate_study_feedback(
    tokenizer: AutoTokenizer,  
    model: AutoModelForCausalLM,
    device: str,
    report_data: Dict[str, Any],
) -> str:
    """
    使用 DeepSeek（llm_client.chat_completion）生成学习诊断反馈。
    """
    wrong_answers = [r for r in report_data["results"] if not r["is_correct"]]
    if not wrong_answers:
        return generate_perfect_score_feedback(report_data)

    context = _prepare_wrong_answers_context(wrong_answers[:5], report_data)

    system_prompt = """你是一位高级教学顾问。请生成一份排版清晰的学习诊断报告。

必须包含以下4个部分（严格保留标题）：

### 1. 整体评价
(简明扼要地评价学生的当前水平，100字以内)

### 2. 整体薄弱点
(列出2个最关键的知识漏洞)

### 3. 针对性建议
(给出2条具体可执行的学习建议)

### 4. 下一步行动
(推荐3个值得向AI助教提问的问题，用双引号包裹)
"""

    user_message = f"""{context}

请根据以上信息生成诊断报告，注意语言简洁、结构清晰。"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    try:
        response = chat_completion(
            messages=messages,
            temperature=GENERATION_CONFIG.get("temperature", 0.6),
            max_tokens=GENERATION_CONFIG.get("max_new_tokens", 2048),
        )
        return response
    except Exception:
        return generate_fallback_feedback(report_data)

def _prepare_wrong_answers_context(wrong_answers, report_data):
    context = f"概况：得分{report_data['score_percentage']:.1f}%，错{report_data['wrong']}题。下面是部分错题：\n\n"
    for i, item in enumerate(wrong_answers, 1):
        context += f"【题目{i}】{item['question']}\n"
        if item.get("options"):
            opts_str = "\n".join(
                [f"  - {opt}" for opt in item["options"]]
            )
            context += f"{opts_str}\n"
        context += f"学生作答：{item.get('user_answer','未作答')}\n"
        context += f"正确答案：{item.get('correct_answer','未知')}\n"
        if item.get("explanation"):
            context += f"解析：{item['explanation']}\n"
        context += "\n"
    return context

def generate_perfect_score_feedback(report_data):
    return f"""### 1. 整体评价
本次测验你取得了 {report_data['score_percentage']:.1f}% 的高分，说明你对当前章节的理解非常扎实。

### 2. 核心薄弱点
在统计的范围内，没有明显的薄弱知识点。不过仍建议保持适度练习，巩固已有优势。

### 3. 针对性建议
- 继续按照当前的节奏进行复习和刷题，保持状态。
- 可以尝试做一些综合性更强的题目，模拟真实考试情境。

### 4. 下一步行动
- "请帮我出几道综合难度稍高的练习题"
- "如何检查自己在模型泛化能力上的理解是否深入？"
- "在现有水平下，如何规划未来两周的复习安排？"
"""

def generate_fallback_feedback(report_data):
    return "### 1. 整体评价\n请复习错题。\n### 2. 核心薄弱点\n基础概念。\n### 3. 针对性建议\n多看书。\n### 4. 下一步行动\n无。"


def prepare_chart_data(report_data):
    data = {
        "类别": ["✅ 答对", "❌ 答错"],
        "数量": [report_data["correct"], report_data["wrong"]],
    }
    if report_data.get("unanswered", 0) > 0:
        data["类别"].append("⭕ 未答")
        data["数量"].append(report_data["unanswered"])
    return pd.DataFrame(data)

def prepare_type_accuracy_data(report_data):
    results = report_data.get("results", [])
    if not results:
        return None
    choice_c = sum(
        1
        for r in results
        if r.get("type") == "choice" and r["is_correct"]
    )
    choice_t = sum(1 for r in results if r.get("type") == "choice")
    bool_c = sum(
        1
        for r in results
        if r.get("type") == "boolean" and r["is_correct"]
    )
    bool_t = sum(1 for r in results if r.get("type") == "boolean")
    data = {"题型": [], "准确率": []}
    if choice_t > 0:
        data["题型"].append("选择题")
        data["准确率"].append(choice_c / choice_t * 100)
    if bool_t > 0:
        data["题型"].append("判断题")
        data["准确率"].append(bool_c / bool_t * 100)
    return pd.DataFrame(data) if data["题型"] else None

def export_report_to_text(report_data, feedback: str) -> str:
    return f"报告\n得分: {report_data['score_percentage']}%\n\n{feedback}"


def export_report_to_pdf(report_data: Dict[str, Any], feedback: str) -> BytesIO:
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=3 * cm,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Heading",
            parent=styles["Heading1"],
            fontName="CustomChineseFont",
            fontSize=14,
            leading=18,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="NormalCN",
            parent=styles["Normal"],
            fontName="CustomChineseFont",
            fontSize=10,
            leading=14,
        )
    )

    story: List[Any] = []

    story.append(
        Paragraph("AI 导师智能诊断报告", styles["Heading"])
    )
    story.append(Spacer(1, 0.2 * cm))
    story.append(
        Paragraph(
            f"测验时间：{report_data.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M'))}",
            styles["NormalCN"],
        )
    )
    story.append(Spacer(1, 0.5 * cm))

    table_data = [
        ["总题数", str(report_data.get("total", 0))],
        ["答对题数", str(report_data.get("correct", 0))],
        ["答错题数", str(report_data.get("wrong", 0))],
        [
            "得分",
            f"{report_data.get('score_percentage', 0):.1f}%",
        ],
    ]
    table = Table(table_data, colWidths=[3 * cm, 3 * cm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF2FF")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#4F46E5")),
                ("FONTNAME", (0, 0), (-1, -1), "CustomChineseFont"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ]
        )
    )
    story.append(table)

    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph("📌 诊断建议", styles["Heading"]))

    clean_feedback = re.split(r'["“](.*?)["”]', feedback)[0]
    clean_feedback = re.sub(
        r"(###\s*4\.|4\.)\s*下一步行动.*",
        "",
        clean_feedback,
        flags=re.DOTALL,
    ).strip()

    for line in clean_feedback.split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.startswith("### ") or line.startswith("## "):
            icon = "📌 "
            if "整体" in line:
                icon = "📝 "
            elif "薄弱" in line:
                icon = "🔍 "
            elif "建议" in line:
                icon = "💡 "
            story.append(
                Paragraph(
                    f"{icon}{line.replace('#', '').strip()}",
                    styles["NormalCN"],
                )
            )
        elif line.startswith("- ") or line.startswith("* "):
            txt = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", line[2:])
            story.append(
                Paragraph(f"• {txt}", styles["NormalCN"])
            )
        else:
            txt = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", line)
            story.append(
                Paragraph(txt, styles["NormalCN"])
            )
            story.append(Spacer(1, 0.2 * cm))

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("📕 重点错题回顾", styles["Heading"]))
    wrong_answers = [r for r in report_data["results"] if not r["is_correct"]]
    if not wrong_answers:
        story.append(
            Paragraph("本次测验没有错题，保持良好状态。", styles["NormalCN"])
        )
    else:
        for i, item in enumerate(wrong_answers, 1):
            story.append(
                Paragraph(f"{i}. {item['question']}", styles["NormalCN"])
            )
            if item.get("options"):
                opts_str = "<br/>".join(
                    [f"{opt}" for opt in item["options"]]
                )
                story.append(
                    Paragraph(
                        f"&nbsp;&nbsp;选项：<br/>{opts_str}",
                        styles["NormalCN"],
                    )
                )
            try:
                u_ans = item.get("user_answer", "未作答")
                c_ans = item.get("correct_answer", "未知")
                story.append(
                    Paragraph(
                        f"&nbsp;&nbsp;你的作答：{u_ans}",
                        styles["NormalCN"],
                    )
                )
                story.append(
                    Paragraph(
                        f"&nbsp;&nbsp;<font color='#10B981'>正确答案：{c_ans}</font>",
                        styles["NormalCN"],
                    )
                )
            except Exception:
                pass
            if item.get("explanation"):
                story.append(
                    Paragraph(
                        f"<font color='#64748B' size=9>解析：{item['explanation']}</font>",
                        styles["NormalCN"],
                    )
                )
            story.append(Spacer(1, 0.6 * cm))

    try:
        doc.build(story, onFirstPage=_draw_header, onLaterPages=_draw_header)
    except Exception as e:
        print(f"PDF 生成出错: {e}")
        return BytesIO()

    buffer.seek(0)
    return buffer
