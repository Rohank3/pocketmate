"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  User,
  Sparkles,
  ArrowRight,
  Paperclip,
  Plus,
  History,
  X,
  Pencil,
  Trash2,
  Check,
  MessageSquare,
  Clock,
  ChevronDown,
  Mic,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ActionConfirmCard, ActionCardData } from "../cards/ActionConfirmCard";
import type { ChatThreadItem } from "@/types/chat";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionCard?: ActionCardData;
  toolBadges?: string[];
  createdAt?: string;
}

interface ChatPanelProps {
  messages: ChatMessageItem[];
  isLoading: boolean;
  threads?: ChatThreadItem[];
  activeThreadId?: string | null;
  onSendMessage: (text: string) => void;
  onUploadReceipt: (file: File) => void;
  onConfirmAction: (cardData: ActionCardData) => Promise<void>;
  onCancelAction?: (messageId: string) => void;
  onAssignCategory?: (
    transactionId: string,
    merchantName: string,
    targetCategory: string,
    scope: "single" | "merchant" | "similar"
  ) => Promise<{ success: boolean; message: string; updatedTransactionIds?: string[] }>;
  onNewChat?: () => void;
  onSelectThread?: (threadId: string) => void;
  onRenameThread?: (threadId: string, newTitle: string) => Promise<void> | void;
  onDeleteThread?: (threadId: string) => Promise<void> | void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  threads = [],
  activeThreadId = null,
  onSendMessage,
  onUploadReceipt,
  onConfirmAction,
  onCancelAction,
  onAssignCategory,
  onNewChat,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
}) => {
  const [inputText, setInputText] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [showScrollBottomButton, setShowScrollBottomButton] = useState(false);

  // Web Speech API Voice Recognition State
  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const feedContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Initialize Speech Recognition on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript.trim()) {
            setInputText((prev) => {
              const prefix = prev.trim() ? `${prev.trim()} ` : "";
              return `${prefix}${transcript.trim()}`;
            });
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onerror = (event: any) => {
          console.warn("[Speech Recognition Error]", event?.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!speechSupported || !recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn("[Voice Start Error]", err);
        setIsListening(false);
      }
    }
  };

  const handleFeedScroll = () => {
    if (!feedContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedContainerRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const scrolledUp = distanceFromBottom > 80;
    isUserScrolledUp.current = scrolledUp;
    setShowScrollBottomButton(scrolledUp);
  };

  const scrollToBottom = (force = false) => {
    if (!feedContainerRef.current) return;
    if (force || !isUserScrolledUp.current) {
      feedContainerRef.current.scrollTo({
        top: feedContainerRef.current.scrollHeight,
        behavior: force ? "auto" : "smooth",
      });
    }
  };

  useEffect(() => {
    if (!isHistoryOpen) {
      scrollToBottom();
    }
  }, [messages, isLoading, isHistoryOpen]);

  useEffect(() => {
    if (editingThreadId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingThreadId]);

  // Handle escape to close drawer or cancel rename
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingThreadId) {
          setEditingThreadId(null);
        } else if (isHistoryOpen) {
          setIsHistoryOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingThreadId, isHistoryOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const msg = inputText;
    setInputText("");
    isUserScrolledUp.current = false;
    setShowScrollBottomButton(false);
    onSendMessage(msg);
    setTimeout(() => scrollToBottom(true), 50);
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

  const handleStartRename = (thread: ChatThreadItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditTitleValue(thread.title);
  };

  const handleSaveRename = async (threadId: string, e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.stopPropagation();
    const clean = editTitleValue.trim();
    if (clean && onRenameThread) {
      await onRenameThread(threadId, clean);
    }
    setEditingThreadId(null);
  };

  const handleDeleteClick = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteThread) {
      setIsDeletingId(threadId);
      try {
        await onDeleteThread(threadId);
      } finally {
        setIsDeletingId(null);
      }
    }
  };

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 2) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Hidden file picker for real receipt audits */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,application/pdf"
        className="hidden"
      />

      {/* Header with Autonomous Agent Status & Controls */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5 truncate">
              PocketMate <span className="text-[10px] text-zinc-400 font-normal">v1.0</span>
            </h1>
            <p className="text-[11px] text-zinc-400 truncate">Autonomous Financial Orchestrator</p>
          </div>
        </div>

        {/* Action Controls: History Drawer, New Chat, Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* History Drawer Toggle Button */}
          <button
            type="button"
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            aria-label="Toggle Conversation History Drawer"
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isHistoryOpen
                ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border-zinc-700 text-zinc-300 hover:text-zinc-100"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
            {threads.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-400 font-mono">
                {threads.length}
              </span>
            )}
          </button>

          {/* + New Chat Button */}
          {onNewChat && (
            <button
              type="button"
              onClick={() => {
                onNewChat();
                setIsHistoryOpen(false);
              }}
              aria-label="Start a new chat session"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 active:bg-emerald-600/40 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}

          {/* Dynamic Internal AI Status Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active</span>
          </div>
        </div>
      </div>

      {/* Multi-Thread History Drawer (Slide-Over / Overlay) */}
      {isHistoryOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Conversation History"
          className="absolute inset-0 z-30 bg-zinc-950/95 backdrop-blur-md flex flex-col animate-in fade-in duration-150"
        >
          {/* Drawer Header */}
          <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Conversation History</h2>
              <span className="text-[11px] text-zinc-400 font-mono">({threads.length})</span>
            </div>

            <div className="flex items-center gap-2">
              {onNewChat && (
                <button
                  type="button"
                  onClick={() => {
                    onNewChat();
                    setIsHistoryOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-zinc-950 text-xs font-semibold shadow-sm transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Chat</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                aria-label="Close conversation history"
                className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-700 rounded-lg transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drawer Body - Thread List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                <Clock className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-xs font-medium text-zinc-300">No saved conversations yet</p>
                <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                  Your chat threads and financial queries will automatically appear here.
                </p>
                {onNewChat && (
                  <button
                    type="button"
                    onClick={() => {
                      onNewChat();
                      setIsHistoryOpen(false);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Start First Chat</span>
                  </button>
                )}
              </div>
            ) : (
              threads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                const isEditing = editingThreadId === thread.id;
                const isDeleting = isDeletingId === thread.id;

                return (
                  <div
                    key={thread.id}
                    onClick={() => {
                      if (!isEditing && onSelectThread) {
                        onSelectThread(thread.id);
                        setIsHistoryOpen(false);
                      }
                    }}
                    className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? "bg-emerald-950/30 border-emerald-500/40 shadow-sm"
                        : "bg-zinc-900/60 hover:bg-zinc-900 active:bg-zinc-850 border-zinc-800/80 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              ref={renameInputRef}
                              type="text"
                              value={editTitleValue}
                              maxLength={60}
                              onChange={(e) => setEditTitleValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleSaveRename(thread.id);
                                }
                              }}
                              className="w-full bg-zinc-950 border border-emerald-500/50 rounded-lg px-2 py-1 text-xs text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={(e) => void handleSaveRename(thread.id, e)}
                              aria-label="Save title"
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingThreadId(null);
                              }}
                              aria-label="Cancel rename"
                              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-xs font-semibold truncate ${
                                isActive ? "text-emerald-300" : "text-zinc-200"
                              }`}
                            >
                              {thread.title}
                            </p>
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                                Active
                              </span>
                            )}
                          </div>
                        )}

                        {thread.lastMessageSnippet && !isEditing && (
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {thread.lastMessageSnippet}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-500">
                          <span>{thread.messageCount} msg{thread.messageCount === 1 ? "" : "s"}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(thread.updatedAt)}</span>
                        </div>
                      </div>

                      {/* Action buttons (Edit & Delete) */}
                      {!isEditing && (
                        <div
                          className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {onRenameThread && (
                            <button
                              type="button"
                              onClick={(e) => handleStartRename(thread, e)}
                              aria-label={`Rename ${thread.title}`}
                              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 rounded transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {onDeleteThread && (
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={(e) => void handleDeleteClick(thread.id, e)}
                              aria-label={`Delete ${thread.title}`}
                              className="p-1 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 active:bg-zinc-700 rounded transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div
        ref={feedContainerRef}
        onScroll={handleFeedScroll}
        className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 relative"
      >
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
                  onCancel={() => onCancelAction?.(m.id)}
                  onAssignCategory={onAssignCategory}
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

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottomButton && (
        <button
          type="button"
          onClick={() => {
            isUserScrolledUp.current = false;
            setShowScrollBottomButton(false);
            scrollToBottom(true);
          }}
          aria-label="Scroll to newest messages"
          className="absolute bottom-20 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/95 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 hover:text-white border border-zinc-700 text-xs shadow-xl backdrop-blur-sm transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
          <span>Latest</span>
        </button>
      )}

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-3 bg-zinc-900/90 border-t border-zinc-800">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            maxLength={2000}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isListening
                ? "🎙️ Listening... speak your request (tap mic again to pause & review before sending)..."
                : "Type or speak a request (e.g. 'split ₹2000 dinner with Alex', 'add rent $1200 due on 1st')..."
            }
            className={`w-full bg-zinc-950 border rounded-xl pl-4 pr-32 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all ${
              isListening
                ? "border-rose-500/70 ring-2 ring-rose-500/30 animate-pulse bg-rose-950/10 placeholder-rose-400/80"
                : "border-zinc-800 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            }`}
          />

          <div className="absolute right-2 flex items-center gap-1.5">
            {/* Voice Input (Web Speech API) */}
            <button
              type="button"
              title={
                !speechSupported
                  ? "Speech recognition is not supported in this browser"
                  : isListening
                  ? "Stop listening & review message"
                  : "Voice input: speak your expense or request"
              }
              onClick={toggleVoiceInput}
              disabled={!speechSupported}
              className={`p-1.5 rounded-lg transition-all cursor-pointer relative focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isListening
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/50 shadow-md shadow-rose-500/20"
                  : "text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-40"
              }`}
            >
              {isListening && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
              <Mic className={`w-4 h-4 ${isListening ? "animate-pulse text-rose-400" : ""}`} />
            </button>

            {/* Upload Receipt / Document Image */}
            <button
              type="button"
              title="Upload receipt or bill image for Gemini Vision audit"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 active:bg-zinc-700 rounded-lg transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 text-zinc-950 font-medium rounded-lg transition-colors flex items-center gap-1 text-xs shadow-md shadow-emerald-500/20 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400"
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
