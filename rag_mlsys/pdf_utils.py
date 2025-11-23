# pdf_utils.py
import os
from typing import List
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter


def pdf_to_documents(file_path: str, source_name: str | None = None) -> List[Document]:
    """
    将单个 PDF 文件加载为文档片段列表，并补充 source/page 等元数据。
    """
    loader = PyPDFLoader(file_path)
    pages = loader.load() 

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=200,
    )
    chunks = text_splitter.split_documents(pages)

    for d in chunks:
        meta = d.metadata or {}

        if "source" in meta:
            meta["source_path"] = meta["source"]

        meta["source"] = source_name or os.path.basename(file_path)

        if "page_number" in meta and "page" not in meta:
            meta["page"] = meta["page_number"]

        d.metadata = meta

    return chunks
