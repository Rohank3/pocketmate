"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bot, User, Sparkles, ArrowRight, Paperclip } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ActionConfirmCard, ActionCardData } from "../cards/ActionConfirmCard";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionCard?: ActionCardData;
  toolBadges?: string[];
}

interface ChatPanelProps {
  messages: ChatMessageItem[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onUploadReceipt: (file: File) => void;
  onConfirmAction: (cardData: ActionCardData) => Promise<void>;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSendMessage,
  onUploadReceipt,
  onConfirmAction,
}) => {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const msg = inputText;
    setInputText("");
    onSendMessage(msg);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("Receipt file must be under 10MB.");
        e.target.value = "";
        return;
      }
      onUploadReceipt(file);
      e.target.value = "";
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Hidden file picker for real receipt audits */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,application/pdf"
        className="hidden"
      />

      {/* Header with Autonomous Agent Status */}
      <div className="px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
              PocketMate <span className="text-[10px] text-zinc-400 font-normal">v1.0</span>
            </h1>
            <p className="text-[11px] text-zinc-400">Autonomous Financial Orchestrator</p>
          </div>
        </div>

        {/* Dynamic Internal AI Status Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active Agent</span>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 text-sm ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed ${
                m.role === "user"
                  ? "bg-emerald-600 text-zinc-50 rounded-tr-sm shadow-md"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-sm shadow-sm"
              }`}
            >
              {/* Tool Execution Badges if any */}
              {m.toolBadges && m.toolBadges.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {m.toolBadges.map((badge, bIdx) => (
                    <span
                      key={bIdx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300 rounded font-mono"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                      {badge}
                    </span>
                  ))}
                </div>
              )}

              {m.role === "user" ? (
                <div className="whitespace-pre-line text-xs md:text-sm">{m.content}</div>
              ) : (
                <div className="text-xs md:text-sm text-zinc-200">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-base font-bold text-zinc-100 my-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold text-zinc-100 my-1.5">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-xs md:text-sm font-bold text-emerald-400 my-1">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-xs font-semibold text-zinc-200 mt-2 mb-0.5">{children}</h4>,
                      p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li className="text-zinc-300">{children}</li>,
                      strong: ({ children }) => <strong className="font-bold text-zinc-100">{children}</strong>,
                      hr: () => <hr className="border-zinc-800 my-2.5" />,
                      code: ({ children }) => (
                        <code className="bg-zinc-800/90 px-1 py-0.5 rounded text-[11px] font-mono text-emerald-300 border border-zinc-700/60">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* Render Action Preview Card (Layer D) if pending confirmation */}
              {m.actionCard && (
                <ActionConfirmCard
                  cardData={m.actionCard}
                  onConfirm={onConfirmAction}
                  onCancel={() => {}}
                />
              )}
            </div>

            {m.role === "user" && (
              <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 text-sm justify-start">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-zinc-400 text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-zinc-300">Orchestrating financial tools...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-3 bg-zinc-900/90 border-t border-zinc-800">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            maxLength={2000}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a financial request (e.g. 'split dinner $120 with Dave and Sam', 'did I overspend on dining?')..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-4 pr-24 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
          />

          <div className="absolute right-2 flex items-center gap-1.5">
            {/* Upload Receipt / Document Image */}
            <button
              type="button"
              title="Upload receipt or bill image for Gemini Vision audit"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 text-zinc-950 font-medium rounded-lg transition-colors flex items-center gap-1 text-xs shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <span>Send</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
