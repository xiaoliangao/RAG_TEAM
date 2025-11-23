# llm_client.py
import os
import requests
from typing import List, Dict, Any

from dotenv import load_dotenv  

load_dotenv()  

LLM_API_BASE = os.getenv("LLM_API_BASE", "https://api.deepseek.com/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY")  
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")


class LLMClientError(RuntimeError):
    pass


def _get_headers() -> Dict[str, str]:
    if not LLM_API_KEY:
        raise LLMClientError("未配置环境变量 LLM_API_KEY（请在根目录 .env 中设置你的 ModelScope Token）")
    return {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }


def chat_completion(
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 1024,
    extra_params: Dict[str, Any] | None = None,
) -> str:
    payload: Dict[str, Any] = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
    }
    if extra_params:
        payload.update(extra_params)

    url = f"{LLM_API_BASE}/chat/completions"
    resp = requests.post(url, headers=_get_headers(), json=payload, timeout=60)
    if resp.status_code != 200:
        raise LLMClientError(f"LLM API 调用失败: {resp.status_code} {resp.text}")

    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        raise LLMClientError(f"解析 LLM 返回数据失败: {e}, 原始返回: {data}")
