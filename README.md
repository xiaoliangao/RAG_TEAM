# MLTutor – AI 学习工作台

> 一个面向「机器学习 / 技术课程」的本地化 AI 学习与测评系统。  
> 支持教材上传、RAG 问答、智能出题、错题重做和学习报告。

---

## 功能概览

### 1. 教材与知识库

- 支持上传 PDF（也可扩展到 Word / Markdown）
- 自动切片与向量化，构建检索索引
- 区分：
  - 自定义教材（用户上传）
  - 内置教材（项目预置 Demo）
- 可在前端自由切换当前教材，所有测验与对话都基于当前教材进行

### 2. 智能测验（Quiz Engine）

- 题型支持：
  - 选择题（单选）
  - 判断题（True/False）
- 可配置：
  - 选择题数量
  - 判断题数量
  - 难度等级：基础 / 进阶 / 挑战
  - 测验模式：
    - 标准出题（基于教材自动生成）
    - 错题重做（从历史错题中抽题）
- 自动评卷，支持：
  - 统计总分、正确 / 错误数
  - 展示每题的正确答案与用户作答
  - 展示教材原文片段（页码 + snippet）
  - 错题解析（explanation）

### 3. 学习报告（Study Report）

- 成绩总览与趋势：
  - 累计测验次数
  - 平均得分
  - 历史最高
  - 最近一次成绩
  - 分数时间序列图（学习曲线）
- 知识点掌握度：
  - 基于测验结果推断当前知识点掌握水平
  - 自动提取/聚合重点知识点标签
- AI 诊断报告：
  - 基于测验数据角色扮演「学习顾问」
  - 输出 Markdown 格式的分析与建议
  - 浏览器打印 / 导出 PDF 报告
- 下一步建议：
  - 自动生成若干「下一步可以问 AI 助教的问题」
  - 点击即跳转到 Chat，继续针对性学习

### 4. AI 助教（Chat Assistant）

- 支持围绕当前教材进行问答：
  - 概念解释
  - 知识点总结
  - 例题讲解
- 文本能力：
  - Markdown 渲染（列表 / 标题 / 代码块等）
  - LaTeX 公式渲染（MathJax）
- 检索增强：
  - 支持查询扩展（Query Expansion）  
  - 支持多轮对话（利用历史对话作为上下文）
  - 支持 Few-shot（使用示例规范答案风格）
  - 支持 k-Top 文档数、temperature 等参数设置

---

## 技术架构

### 前端

- 框架：React + TypeScript
- 构建工具：Vite
- UI：
  - Tailwind CSS
  - lucide-react 图标
  - Recharts（成绩走势图）
- Markdown & 数学公式：
  - marked.js（Markdown 渲染）
  - MathJax（LaTeX 渲染）

主文件结构（部分）：

- `index.html`：应用入口，配置字体、MathJax、marked 等依赖
- `src/main.tsx`：挂载 React 根节点
- `src/App.tsx`：全局状态与视图路由（Upload / Quiz / Report / Chat）
- `src/components/Sidebar.tsx`：侧边导航与系统工具
- `src/components/HeroSection.tsx`：顶部状态展示（当前教材、引擎状态、对话轮次）
- `src/views/UploadView.tsx`：教材上传与知识库管理
- `src/views/QuizView.tsx`：测验配置、出题、答题、解析
- `src/views/ReportView.tsx`：学习报告、诊断与 PDF 导出
- `src/views/ChatView.tsx`：AI 助教聊天界面

### 后端

主要模块：

- `main_app.py`：Web 服务入口（FastAPI）
- `rag_service.py`：
  - 文档切片 / 嵌入向量构建
  - 检索接口（Top-K 文档）
  - 索引存储与更新
- `pdf_utils.py`：PDF 解析与文本抽取
- `question_generator.py`：
  - 基于教材内容生成选择题 / 判断题
  - 控制难度 / 题型分布
- `evaluator.py`：
  - 评卷逻辑
  - 错题记录
- `report_generator.py` / `learning_tracker.py` / `topic_clustering.py`：
  - 成绩统计
  - 学习曲线数据聚合
  - 知识点聚类 / 学习建议生成
- `background_processor.py`：
  - 背景任务（例如大文件索引构建）
- `rag_service.py` / `module_rag_assistant.py`：
  - 提供给 Chat / Quiz / Report 的统一检索能力