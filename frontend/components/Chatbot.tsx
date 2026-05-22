"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from "react";
import { useAuth } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  loading?: boolean;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
// Handles: bold, italic, inline code, fenced code blocks, bullet/numbered
// lists, headers (h1-h6), horizontal rules, and blank-line paragraphs.
function renderMarkdown(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let key = 0;

  // ── inline formatter (bold, italic, inline code) ───────────────────────────
  const inline = (s: string): React.ReactNode => {
    const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**"))
        return <strong key={i}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
        return <em key={i}>{p.slice(1, -1)}</em>;
      if (p.startsWith("`") && p.endsWith("`"))
        return <code key={i} className="chat-inline-code">{p.slice(1, -1)}</code>;
      return p;
    });
  };

  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── fenced code block ────────────────────────────────────────────────────
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      result.push(
        <pre key={key++} className="chat-code-block">
          {lang && <span className="chat-code-lang">{lang}</span>}
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // ── heading ──────────────────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const Tag = `h${Math.min(level + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
      result.push(
        <Tag key={key++} className={`chat-md-heading chat-md-h${level}`}>
          {inline(headingMatch[2])}
        </Tag>
      );
      i++;
      continue;
    }

    // ── horizontal rule ──────────────────────────────────────────────────────
    if (/^---+$/.test(line.trim())) {
      result.push(<hr key={key++} className="chat-md-hr" />);
      i++;
      continue;
    }

    // ── bullet list ──────────────────────────────────────────────────────────
    if (/^[-*•]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].replace(/^[-*•]\s/, ""))}</li>);
        i++;
      }
      result.push(<ul key={key++} className="chat-md-list">{items}</ul>);
      continue;
    }

    // ── numbered list ─────────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].replace(/^\d+\.\s/, ""))}</li>);
        i++;
      }
      result.push(<ol key={key++} className="chat-md-list chat-md-list--ol">{items}</ol>);
      continue;
    }

    // ── blank line → paragraph break ─────────────────────────────────────────
    if (!line.trim()) {
      // Collect consecutive blank lines and emit a single spacer
      while (i < lines.length && !lines[i].trim()) i++;
      // Only add spacer if there's more content coming
      if (i < lines.length) {
        result.push(<div key={key++} className="chat-md-spacer" />);
      }
      continue;
    }

    // ── paragraph ────────────────────────────────────────────────────────────
    // Collect consecutive non-blank, non-special lines into one paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|[-*•]\s|\d+\.\s|---+$|```)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      result.push(
        <p key={key++} className="chat-md-p">
          {paraLines.map((l, idx) => (
            idx < paraLines.length - 1
              ? <>{inline(l)}<br /></>
              : inline(l)
          ))}
        </p>
      );
    }
  }

  return result;
}

// ── Suggestion chips ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Who are my top 5 candidates?",
  "Which candidates are missing Python?",
  "Compare my strong matches",
  "What is the average score?",
  "Who has the most matching tools?",
  "Summarise my latest analysis",
  "Which candidates went to IIT?",
  "Who should I interview first?",
];

// ── Main component ────────────────────────────────────────────────────────────
export default function Chatbot() {
  const { session, user } = useAuth();

  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [thinking, setThinking] = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  // Welcome message on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      const welcome = user
        ? `Hi! I'm your **ResumeAI assistant**. I have access to your candidate database and can answer questions about your screening results, compare candidates, identify skill gaps, and give hiring recommendations.\n\nWhat would you like to know?`
        : `Hi! I'm your **ResumeAI assistant**. Sign in to unlock database-aware answers about your candidates.\n\nI can still answer general HR and recruitment questions — what's on your mind?`;

      setMessages([{
        id:      "welcome",
        role:    "assistant",
        content: welcome,
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    const userMsg: Message = {
      id:      crypto.randomUUID(),
      role:    "user",
      content: trimmed,
    };

    const assistantMsg: Message = {
      id:      crypto.randomUUID(),
      role:    "assistant",
      content: "",
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setThinking(true);

    const history = [...messages, userMsg]
      .filter((m) => m.id !== "welcome" && !m.loading)
      .map((m) => ({ role: m.role, content: m.content }));

    abortRef.current = new AbortController();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${BASE}/chat`, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ messages: history }),
        signal:  abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   full    = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          // Slice off "data: " prefix — do NOT trim() the rest or spaces get eaten
          const raw = line.slice(6);
          if (raw.trim() === "[DONE]") break;

          // Unescape newlines we escaped on the server
          const chunk = raw.replace(/\\n/g, "\n");
          full += chunk;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: full, loading: false }
                : m
            )
          );
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: full || "Sorry, I didn't get a response.", loading: false }
            : m
        )
      );

    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: "❌ Something went wrong. Check your Gemini API key.", loading: false }
            : m
        )
      );
    } finally {
      setThinking(false);
      abortRef.current = null;
    }
  }, [messages, session, thinking]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setThinking(false);
    setMessages((prev) =>
      prev.map((m) => m.loading ? { ...m, loading: false } : m)
    );
  };

  const clearChat = () => {
    setMessages([]);
    setTimeout(() => setMessages([]), 50);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating bubble ── */}
      <button
        className={`chat-bubble ${open ? "chat-bubble--open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Open AI assistant"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        {!open && <span className="chat-bubble-label">AI Assistant</span>}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div className="chat-panel">

          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-left">
              <span className="chat-header-icon">🤖</span>
              <div>
                <p className="chat-header-title">ResumeAI Assistant</p>
                <p className="chat-header-sub">
                  {user ? "Connected to your database" : "General HR assistant"}
                </p>
              </div>
            </div>
            <div className="chat-header-actions">
              <button
                className="chat-icon-btn"
                onClick={clearChat}
                title="Clear chat"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-5.27" />
                </svg>
              </button>
              <button
                className="chat-icon-btn"
                onClick={() => setOpen(false)}
                title="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-msg chat-msg--${msg.role}`}
              >
                {msg.role === "assistant" && (
                  <span className="chat-msg-avatar">🤖</span>
                )}
                <div className="chat-msg-bubble">
                  {msg.loading ? (
                    <span className="chat-typing">
                      <span /><span /><span />
                    </span>
                  ) : msg.role === "assistant" ? (
                    <div className="chat-md">
                      {renderMarkdown(msg.content)}
                    </div>
                  ) : (
                    <p style={{ margin: 0 }}>{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Suggestion chips — show only when just welcome message */}
          {messages.length <= 1 && (
            <div className="chat-suggestions">
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <button
                  key={s}
                  className="chat-suggestion"
                  onClick={() => sendMessage(s)}
                  disabled={thinking}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Ask about your candidates…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={thinking}
            />
            {thinking ? (
              <button
                className="chat-send-btn chat-send-btn--stop"
                onClick={stopGeneration}
                title="Stop generating"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                className="chat-send-btn"
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                title="Send (Enter)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </div>

          <p className="chat-footer">
            Shift+Enter for new line · powered by Gemini
          </p>
        </div>
      )}
    </>
  );
}