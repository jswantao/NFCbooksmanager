# backend/app/utils/helpers.py
"""通用工具函数"""


def clean_isbn(raw: str) -> str:
    """清洗 ISBN 字符串：去连字符、去空格"""
    return raw.strip().replace("-", "").replace(" ", "")
