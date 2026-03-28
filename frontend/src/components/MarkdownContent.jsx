import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownContent({ content, className = '', compact = false }) {
  if (typeof content !== 'string' || !content.trim()) {
    return null;
  }

  const paragraphClass = compact
    ? 'my-0 whitespace-pre-wrap leading-relaxed'
    : 'my-1 whitespace-pre-wrap leading-relaxed';

  const listClass = compact ? 'my-1 list-disc pl-5 space-y-0.5' : 'my-2 list-disc pl-5 space-y-1';
  const orderedListClass = compact
    ? 'my-1 list-decimal pl-5 space-y-0.5'
    : 'my-2 list-decimal pl-5 space-y-1';

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, ...props }) => (
            <p className={paragraphClass} {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className={listClass} {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className={orderedListClass} {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="my-2 border-l-2 border-slate-300 pl-3 italic text-slate-600"
              {...props}
            />
          ),
          code: ({ node, inline, className: codeClassName, children, ...props }) => {
            const codeValue = String(children).replace(/\n$/, '');

            if (inline) {
              return (
                <code
                  className="ff-code rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[0.85em] text-slate-800"
                  {...props}
                >
                  {codeValue}
                </code>
              );
            }

            return (
              <pre className="my-2 overflow-x-auto rounded-lg border border-slate-300 bg-slate-100 p-3 text-xs text-slate-800 ff-code">
                <code className={codeClassName} {...props}>
                  {codeValue}
                </code>
              </pre>
            );
          },
          a: ({ node, ...props }) => (
            <a
              className="text-sky-700 underline underline-offset-2 hover:text-sky-900"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
