# backend/app/services/search_service.py
"""
跨数据库图书搜索服务

双路径策略：
- PostgreSQL: tsvector/tsquery 全文搜索 + ts_rank 排序 + ts_headline 摘要
- SQLite:     n-gram 分词 + ILIKE 匹配（委托 chat_service）

用法:
    from app.services.search_service import SearchService
    result = SearchService.search_books(db, "三体", limit=10)
"""

from typing import Dict, Any, List, Optional
from loguru import logger

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import is_postgresql


class SearchService:
    """
    跨数据库图书搜索服务

    自动检测数据库类型，选择最优搜索策略。
    """

    @staticmethod
    def search_books(
        db: Session,
        query: str,
        limit: int = 10,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        多维度图书检索入口

        根据数据库类型分派：
        - PostgreSQL → _search_postgresql()
        - SQLite → _search_sqlite()
        """
        if not query or not query.strip():
            return {"results": [], "total": 0}

        if is_postgresql:
            return SearchService._search_postgresql(db, query, limit, offset)
        return SearchService._search_sqlite(db, query, limit, offset)

    # ==================== PostgreSQL 全文搜索 ====================

    @staticmethod
    def _search_postgresql(
        db: Session,
        query: str,
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        """
        PostgreSQL tsvector 全文搜索

        使用 plainto_tsquery 将用户输入转换为 tsquery，
        通过 ts_rank 按相关性排序，ts_headline 生成高亮摘要。
        """
        sql = text("""
            SELECT
                book_id, isbn, title, author, publisher, cover_url,
                rating, series, summary, source,
                ts_rank(
                    to_tsvector('simple',
                        coalesce(title,'') || ' ' ||
                        coalesce(author,'') || ' ' ||
                        coalesce(publisher,'') || ' ' ||
                        coalesce(series,'') || ' ' ||
                        coalesce(summary,'') || ' ' ||
                        coalesce(original_title,'')
                    ),
                    plainto_tsquery('simple', :query)
                ) AS relevance,
                ts_headline('simple',
                    coalesce(summary, ''),
                    plainto_tsquery('simple', :query),
                    'MaxWords=30, MinWords=15, ShortWord=2'
                ) AS headline
            FROM book_metadata
            WHERE
                to_tsvector('simple',
                    coalesce(title,'') || ' ' ||
                    coalesce(author,'') || ' ' ||
                    coalesce(publisher,'') || ' ' ||
                    coalesce(series,'') || ' ' ||
                    coalesce(summary,'') || ' ' ||
                    coalesce(original_title,'')
                ) @@ plainto_tsquery('simple', :query)
            ORDER BY relevance DESC
            LIMIT :limit OFFSET :offset
        """)

        result = db.execute(sql, {
            "query": query.strip(),
            "limit": limit,
            "offset": offset,
        })

        rows = result.fetchall()
        results = []
        for row in rows:
            results.append({
                "book_id": row.book_id,
                "isbn": row.isbn,
                "title": row.title,
                "author": row.author,
                "publisher": row.publisher,
                "cover_url": row.cover_url,
                "rating": row.rating,
                "series": row.series,
                "summary": row.headline or (row.summary or "")[:200],
                "source": row.source,
                "relevance_score": round(float(row.relevance), 1) if row.relevance else 0,
            })

        return {
            "results": results,
            "total": len(results),
            "search_engine": "postgresql_tsvector",
        }

    # ==================== SQLite 回退 ====================

    @staticmethod
    def _search_sqlite(
        db: Session,
        query: str,
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        """
        SQLite n-gram + ILIKE 搜索（委托 chat_service）

        保留现有应用层搜索逻辑不变。
        """
        from app.services.chat_service import search_local_books
        result = search_local_books(db, query, limit)
        if "results" in result and offset > 0:
            result["results"] = result["results"][offset : offset + limit]
        result["search_engine"] = "sqlite_ngram"
        return result

    # ==================== 混合搜索（PostgreSQL ILIKE 回退） ====================

    @staticmethod
    def search_books_flexible(
        db: Session,
        query: str,
        limit: int = 10,
    ) -> Dict[str, Any]:
        """
        混合搜索：tsvector 优先，无结果时回退 ILIKE

        适用于用户查询可能包含特殊字符或简写场景。
        """
        # 先尝试全文搜索
        result = SearchService.search_books(db, query, limit)
        if result["results"]:
            return result

        # 无结果时回退到 PostgreSQL ILIKE（已有 trigram 索引加速）
        if is_postgresql:
            return SearchService._search_pg_fallback(db, query, limit)

        return result

    @staticmethod
    def _search_pg_fallback(
        db: Session,
        query: str,
        limit: int,
    ) -> Dict[str, Any]:
        """PostgreSQL ILIKE 回退搜索（利用 pg_trgm GIN 索引）"""
        pattern = f"%{query.strip()}%"
        sql = text("""
            SELECT
                book_id, isbn, title, author, publisher, cover_url,
                rating, COALESCE(summary, '') AS summary
            FROM book_metadata
            WHERE
                title ILIKE :q OR author ILIKE :q OR
                publisher ILIKE :q OR series ILIKE :q OR
                summary ILIKE :q
            LIMIT :limit
        """)
        result = db.execute(sql, {"q": pattern, "limit": limit})
        rows = result.fetchall()

        results = []
        for row in rows:
            results.append({
                "book_id": row.book_id,
                "isbn": row.isbn,
                "title": row.title,
                "author": row.author,
                "publisher": row.publisher,
                "cover_url": row.cover_url,
                "rating": row.rating,
                "summary": (row.summary or "")[:200],
                "relevance_score": 0,
            })

        return {
            "results": results,
            "total": len(results),
            "search_engine": "postgresql_ilike_fallback",
        }
