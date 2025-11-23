# MLTutor · 基于 RAG 的机器学习智能学习平台

MLTutor 是一个面向 **机器学习 / 深度学习自学者** 的智能学习平台，基于检索增强生成（RAG, Retrieval-Augmented Generation）方案构建。它将教材 PDF、向量检索、远程大语言模型和可视化学习反馈结合在一起，提供：

- 📚 教材上传与知识库构建  
- 🔍 基于 RAG 的可解释问答（智能助教）  
- 📝 从教材自动生成选择题 / 判断题的「智能测验」  
- 📈 根据测验结果生成的学习报告与知识点诊断  

项目采用**前后端分离**架构：

- 后端：`rag_mlsys/` · FastAPI + LangChain + Chroma，调用本地中文向量模型 + ModelScope DeepSeek Chat API  
- 前端：`mltutor-web/` · Vite + React + TypeScript + Tailwind，提供类似产品级的多 Tab Web 界面  

---

## 功能总览

### 1. 教材上传与知识库构建

- 支持上传 PDF 教材（例如《深度学习》《统计学习方法》《动手学深度学习》等）。
- 通过 `core_processing.py` 将 PDF 切分为语义段落，并做清洗与质量过滤。
- 使用本地中文向量模型 `bge-large-zh-v1.5` 生成向量，存入 `vector_db/`（Chroma）。
- 内置了一组默认教材（见 `knowledge_base/`，实际仓库中为了减小体积已通过 `.gitignore` 排除）。

### 2. 基于 RAG 的智能问答（Chat）

- 前端 `ChatView` 提供类似聊天的界面：
  - 上方：你的问题
  - 中间：助教回答（Markdown 排版）
  - 下方：检索到的文献出处列表（教材页码）
- 后端 `rag_service.py` 负责：
  - 从向量库（内置 + 上传教材）检索相关片段；
  - 将片段拼接为上下文；
  - 调用 `llm_client.py` 封装的 **ModelScope DeepSeek Chat API** 生成回答；
  - 返回回答文本与引用来源列表。
- 支持多轮对话，支持可配置的：
  - Top-K 文档数量
  - 温度（Temperature）
  - 查询扩展（Query Expansion）
  - Few-shot 示例

### 3. 智能测验（Quiz）

- 前端 `QuizView` 提供测验配置与答题界面：
  - 题目数量（滑条）
  - 难度：基础 / 进阶 / 挑战
  - 出题教材：  
    - 自动（最近上传教材优先）  
    - 具体内置教材  
    - 具体上传教材
- 后端：
  - 通过 `/api/quiz/generate` 接口生成题目。
  - 使用 `quiz_module/question_generator.py`：
    - 从当前选中的教材中检索「适合出题」的段落；
    - 调用 DeepSeek 生成 JSON 格式的题目（题干、选项、正确项、解析）；
    - 题目经过多轮过滤（去掉目录/版权页/纯数据/过于细节或无意义的数值题等）。
- 前端对题目进行展示和作答：
  - 选择题/判断题按钮样式高亮；
  - 提交后显示每题对错、高亮正确答案，并显示解析；
  - 底部显示总得分（百分制）。

### 4. 学习报告（Report）

- 前端 `ReportView` 展示学习情况概览：
  - 测验次数、平均分、最高分、最近一次得分；
  - 高频错误知识点/标签列表。
- 后端：
  - 使用 `learning_tracker.py` 记录每次测验的题目与得分（`analytics/quiz_history.json`）。
  - `/api/report/overview` 汇总历史记录，计算统计指标与知识点聚合。

---

## 目录结构

假设项目根目录结构如下（示例）：

```text
Project/
├── rag_mlsys/          # 后端
│   ├── main_app.py     # FastAPI
│   ├── rag_service.py  # RAG 管线封装
│   ├── llm_client.py   # ModelScope DeepSeek API 封装
│   ├── core_processing.py 
│   ├── quiz_module/
│   │   ├── question_generator.py
│   │   ├── evaluator.py
│   │   ├── report_generator.py
│   │   └── topic_clustering.py
│   ├── learning_tracker.py
│   ├── requirements.txt
│   ├── models/         # 本地向量模型（bge-large-zh-v1.5）
│   ├── vector_db/      # Chroma 向量库持久化目录
│   ├── knowledge_base/ # 默认教材 PDF
│   ├── uploaded_pdfs/  # 用户上传的 PDF
│   └── analytics/      # 测验历史等
└── mltutor-web/        # 前端
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── index.tsx
        ├── index.css
        ├── components/
        │   ├── Sidebar.tsx
        │   └── HeroSection.tsx
        └── views/
            ├── UploadView.tsx
            ├── ChatView.tsx
            ├── QuizView.tsx
            └── ReportView.tsx
