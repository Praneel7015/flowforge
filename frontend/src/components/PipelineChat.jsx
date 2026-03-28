import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import MarkdownContent from './MarkdownContent';
import { decodeEscapedNewlines } from '../utils/contentFormat';

function Message({ role, content }) {
  const isUser = role === 'user';
  const displayContent = decodeEscapedNewlines(content);

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-slate-900 text-slate-100 flex-shrink-0 flex items-center justify-center text-xs font-bold">
          FF
        </div>
      )}
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-slate-900 text-slate-100 rounded-tr-sm border border-slate-900'
            : 'bg-white text-slate-800 rounded-tl-sm border border-slate-300'}`}
      >
        <MarkdownContent
          content={displayContent}
          className={isUser ? 'text-slate-100' : 'text-slate-800'}
        />
      </div>
    </div>
  );
}

export default function PipelineChat({ currentYaml, aiProvider, cicdPlatform, aiOptions }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "I can review your current pipeline and help improve it. Try asking:\n• \"Why might this pipeline be slow?\"\n• \"Add a Docker build stage\"\n• \"What security improvements should I make?\"",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggestions = [
    'Why might this pipeline fail?',
    'Make the tests run in parallel',
    'Add a security scanning stage',
    'Explain what this pipeline does',
  ];

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText) return;

    const newHistory = [
      ...messages.filter((m) => m.role !== 'assistant' || messages.indexOf(m) > 0),
      { role: 'user', content: userText },
    ];

    // Build the messages array for the API (exclude the initial assistant greeting for cleanliness)
    const apiMessages = newHistory.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await axios.post('/api/advisor/chat', {
        messages: apiMessages,
        currentYaml,
        aiProvider,
        cicdPlatform,
        aiOptions,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please check backend connectivity.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full ff-enter">
      {/* Header */}
      <div className="px-6 py-3 border-b border-slate-200 flex items-center gap-3 bg-white/75">
        <div className="w-8 h-8 rounded-full bg-slate-900 text-slate-100 flex items-center justify-center text-xs font-bold">
          FF
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">FlowForge Assistant</div>
          <div className="text-xs text-slate-500">Pipeline reasoning and optimization</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-slate-500">online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50/70">
        {messages.map((msg, i) => (
          <Message key={i} role={msg.role} content={msg.content} />
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-900 text-slate-100 flex-shrink-0 flex items-center justify-center text-xs font-bold">FF</div>
            <div className="bg-white border border-slate-300 px-4 py-3 rounded-2xl rounded-tl-sm">
              <span className="inline-flex gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      {messages.length <= 2 && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-full text-xs text-slate-700 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-slate-200 bg-white/80">
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your pipeline..."
            rows={2}
            className="ff-input flex-1 rounded-xl px-4 py-3 text-sm resize-none leading-relaxed"
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
