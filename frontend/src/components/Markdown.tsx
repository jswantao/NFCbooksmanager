// frontend/src/components/Markdown.tsx
/**
 * AI 对话 Markdown 渲染组件
 *
 * 基于 react-markdown，原生安全（不经过 dangerouslySetInnerHTML），
 * 样式通过 CSS 类名控制，与对话气泡风格协调。
 *
 * 使用规范：所有 AI 对话回复内容必须通过此组件渲染。
 */

import React, { useMemo, type FC } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const MARKDOWN_COMPONENTS: Components = {
    h1: ({ children, ...props }) => <h1 className="md-h1" {...props}>{children}</h1>,
    h2: ({ children, ...props }) => <h2 className="md-h2" {...props}>{children}</h2>,
    h3: ({ children, ...props }) => <h3 className="md-h3" {...props}>{children}</h3>,
    h4: ({ children, ...props }) => <h4 className="md-h4" {...props}>{children}</h4>,
    table: ({ children, ...props }) => (
        <div className="md-table-wrap">
            <table className="md-table" {...props}>{children}</table>
        </div>
    ),
    blockquote: ({ children, ...props }) => <blockquote className="md-blockquote" {...props}>{children}</blockquote>,
    ul: ({ children, ...props }) => <ul className="md-ul" {...props}>{children}</ul>,
    ol: ({ children, ...props }) => <ol className="md-ol" {...props}>{children}</ol>,
    code: ({ className, children, ...props }: any) => {
        const isInline = !className;
        if (isInline) {
            return <code className="md-code-inline" {...props}>{children}</code>;
        }
        return <code className={`md-code-block ${className || ''}`} {...props}>{children}</code>;
    },
    pre: ({ children, ...props }) => <pre className="md-pre" {...props}>{children}</pre>,
    a: ({ children, href, ...props }) => (
        <a className="md-link" href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
    ),
    img: ({ src, alt, ...props }: any) => (
        <img className="md-img" src={src} alt={alt || ''} loading="lazy" {...props} />
    ),
    strong: ({ children, ...props }) => <strong className="md-strong" {...props}>{children}</strong>,
    em: ({ children, ...props }) => <em className="md-em" {...props}>{children}</em>,
    hr: (props) => <hr className="md-hr" {...props} />,
    p: ({ children, ...props }) => <p className="md-p" {...props}>{children}</p>,
};

interface MarkdownProps {
    content: string;
    /** 是否为助手消息（深色气泡用浅色样式） */
    isAssistant?: boolean;
}

const Markdown: FC<MarkdownProps> = ({ content, isAssistant = true }) => {
    const className = useMemo(
        () => `md-content ${isAssistant ? 'md-assistant' : 'md-user'}`,
        [isAssistant],
    );

    return (
        <div className={className}>
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default Markdown;
