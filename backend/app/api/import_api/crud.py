"""批量导入 — 工具函数层（ISBN 清洗、文件解析、列识别）

纯函数，无数据库依赖，无副作用。
"""

import io, re
from typing import Optional, List
import pandas as pd


# ═══════════════════════════════════════════
# ISBN 清洗与校验
# ═══════════════════════════════════════════

def clean_and_validate_isbn(raw: str) -> Optional[str]:
    """清洗并校验 ISBN，返回有效的 13 位 ISBN 或 None"""
    cleaned = re.sub(r'[-\s]', '', str(raw).strip())
    cleaned = re.sub(r'[^\dXx]', '', cleaned).upper()
    if not cleaned:
        return None

    if len(cleaned) == 10:
        try:
            weighted_sum = sum(
                (i + 1) * (10 if char == 'X' else int(char))
                for i, char in enumerate(cleaned)
            )
            if weighted_sum % 11 != 0:
                return None
        except (ValueError, TypeError):
            return None
        prefix = "978"
        base = prefix + cleaned[:9]
        digits = [int(c) for c in base]
        checksum = (10 - (sum(digits[0:12:2]) + sum(digits[1:12:2]) * 3) % 10) % 10
        return base + str(checksum)

    if len(cleaned) == 13:
        try:
            digits = [int(c) for c in cleaned]
            checksum = (10 - (sum(digits[0:12:2]) + sum(digits[1:12:2]) * 3) % 10) % 10
            if checksum == digits[12]:
                return cleaned
        except (ValueError, TypeError):
            pass
    return None


# ═══════════════════════════════════════════
# 文件解析
# ═══════════════════════════════════════════

SUPPORTED_EXTENSIONS = {"csv", "xlsx", "xls", "txt"}


def parse_file_content(content: bytes, extension: str) -> pd.DataFrame:
    """根据扩展名解析文件内容为 DataFrame"""
    if extension == "csv":
        return pd.read_csv(io.BytesIO(content), dtype=str, encoding="utf-8-sig")
    if extension in ("xlsx", "xls"):
        return pd.read_excel(io.BytesIO(content), dtype=str)
    if extension == "txt":
        text = content.decode("utf-8-sig")
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        if not lines:
            raise ValueError("文件内容为空")
        first_line = lines[0]
        if "\t" in first_line:
            return pd.read_csv(io.StringIO("\n".join(lines)), sep="\t", dtype=str)
        elif "," in first_line:
            return pd.read_csv(io.StringIO("\n".join(lines)), sep=",", dtype=str)
        else:
            isbns, notes = [], []
            for line in lines:
                parts = re.split(r'[\t,;|]', line, maxsplit=1)
                isbns.append(parts[0].strip())
                notes.append(parts[1].strip() if len(parts) > 1 else "")
            return pd.DataFrame({"isbn": isbns, "note": notes})
    raise ValueError(f"不支持的文件格式: .{extension}")


def find_isbn_column(df: pd.DataFrame) -> str:
    """自动识别 DataFrame 中的 ISBN 列"""
    isbn_keywords = ("isbn", "书号", "isbn13", "isbn10")
    for col in df.columns:
        col_lower = str(col).lower()
        if any(kw in col_lower for kw in isbn_keywords):
            return col
    return str(df.columns[0]) if len(df.columns) > 0 else ""
