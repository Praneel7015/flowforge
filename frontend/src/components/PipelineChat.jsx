import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import MarkdownContent from './MarkdownContent';
import { decodeEscapedNewlines } from '../utils/contentFormat';

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Message({ role, content, timestamp }) {
  const isUser = role === 'user';
  const displayContent = decodeEscapedNewlines(content);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  return (
    <div className={`group flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[var(--ff-avatar-bg)] text-[var(--ff-text)] flex-shrink-0 flex items-center justify-center text-xs font-bold">
          FF
        </div>
      )}
      <div className="max-w-[80%]">
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
            ${isUser
              ? 'bg-[var(--ff-accent)] text-white rounded-tr-sm border border-[var(--ff-accent)]'
              : 'bg-[var(--ff-bubble-bot-bg)] text-[var(--ff-text)] rounded-tl-sm border border-[var(--ff-card-border-strong)]'}`}
        >
          <MarkdownContent
            content={displayContent}
            className={isUser ? 'text-white' : 'text-[var(--ff-text)]'}
          />
        </div>
        <div className="flex items-center gap-2 mt-1 px-1">
          {timestamp && (
            <span className="text-[10px] text-[var(--ff-muted)]">{formatTime(timestamp)}</span>
          )}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="text-[10px] text-[var(--ff-muted)] hover:text-[var(--ff-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const SUGGESTION_CATEGORIES = [
  {
    label: 'Optimize',
    items: ['Make the tests run in parallel', 'Add caching to speed up builds'],
  },
  {
    label: 'Debug',
    items: ['Why might this pipeline fail?', 'Explain what this pipeline does'],
  },
  {
    label: 'Improve',
    items: ['Add a security scanning stage', 'Add Docker build and push step'],
  },
];

export default function PipelineChat({ currentYaml, aiProvider, cicdPlatform, aiOptions }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "I can review your current pipeline and help improve it. Choose a suggestion below or type your question.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const yamlLineCount = currentYaml?.trim() ? currentYaml.split('\n').length : 0;

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText) return;

    const newHistory = [
      ...messages.filter((m) => m.role !== 'assistant' || messages.indexOf(m) > 0),
      { role: 'user', content: userText },
    ];

    const apiMessages = newHistory.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: 'user', content: userText, timestamp: new Date() }]);
    setInput('');
    setLoading(true);

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { data } = await axios.post('/api/advisor/chat', {
        messages: apiMessages,
        currentYaml,
        aiProvider,
        cicdPlatform,
        aiOptions,
      }, { signal: controller.signal });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, timestamp: new Date() }]);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please check backend connectivity.', timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([
      {
        role: 'assistant',
        content: 'Conversation cleared. How can I help with your pipeline?',
        timestamp: new Date(),
      },
    ]);
    setLoading(false);
  }, []);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full ff-enter">
      {/* Header */}
      <div className="px-6 py-3 border-b border-[var(--ff-card-border)] flex items-center gap-3 bg-[var(--ff-card-bg)]">
        <div className="w-8 h-8 rounded-full bg-[var(--ff-avatar-bg)] text-[var(--ff-text)] flex items-center justify-center text-xs font-bold">
          FF
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-[var(--ff-text)]">FlowForge Assistant</div>
          <div className="text-xs text-[var(--ff-muted)]">
            Pipeline reasoning and optimization
            {yamlLineCount > 0 && (
              <span className="ml-2 text-[var(--ff-text-secondary)]">
                ({yamlLineCount} lines loaded)
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearChat}
            className="text-xs text-[var(--ff-muted)] hover:text-[var(--ff-text-secondary)] transition-colors"
          >
            Clear
          </button>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--ff-success)]" />
            <span className="text-xs text-[var(--ff-muted)]">online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div role="log" aria-live="polite" aria-label="Chat messages" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-transparent">
        {messages.map((msg, i) => (
          <Message key={i} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
        ))}
        {loading && (
          <div className="flex gap-3" aria-busy="true" aria-label="Assistant is typing">
            <div className="w-7 h-7 rounded-full bg-[var(--ff-avatar-bg)] text-[var(--ff-text)] flex-shrink-0 flex items-center justify-center text-xs font-bold" aria-hidden="true">FF</div>
            <div className="bg-[var(--ff-bubble-bot-bg)] border border-[var(--ff-card-border-strong)] px-4 py-3 rounded-2xl rounded-tl-sm">
              <span className="inline-flex gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--ff-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-[var(--ff-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-[var(--ff-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Categorized suggestions */}
      {messages.length <= 2 && (
        <div className="px-6 pb-3 space-y-2">
          {SUGGESTION_CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ff-muted)] font-medium mb-1">{cat.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {cat.items.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-3 py-1.5 bg-[var(--ff-card-bg)] hover:bg-[var(--ff-card-bg-hover)] border border-[var(--ff-card-border-strong)] rounded-full text-xs text-[var(--ff-text-secondary)] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-[var(--ff-card-border)] bg-[var(--ff-card-bg)]">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your pipeline..."
            rows={1}
            className="ff-input flex-1 rounded-xl px-4 py-3 text-sm resize-none leading-relaxed"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-4 py-3 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity whitespace-nowrap ff-btn-primary"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
