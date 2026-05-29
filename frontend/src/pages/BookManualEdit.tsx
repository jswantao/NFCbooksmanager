// frontend/src/pages/BookManualEdit.tsx
/**
 * 旧版图书编辑页面 - 兼容路由 /books/edit/:id
 *
 * 路由已迁移到 BookEditor，此页面作为薄包装重定向。
 */

import React, { useEffect, type FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Spin } from "antd";

const BookManualEdit: FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    useEffect(() => {
        if (id) {
            navigate(`/books/${id}/edit`, { replace: true });
        }
    }, [id, navigate]);

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
            <Spin tip="跳转到新版编辑器..." />
        </div>
    );
};

export default BookManualEdit;
