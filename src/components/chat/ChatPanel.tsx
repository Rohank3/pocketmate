"use client";

import React, { useState, useRef, useEffect, useSyncExternalStore } from "react";
import {
  Bot,
  User,
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
import { LiquidGlassContainer } from "@/components/ui/LiquidGlassContainer";
import { ElasticChatBubble } from "./ElasticChatBubble";
import { useTheme } from "@/components/theme/ThemeContext";

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
  categories?: Array<{ id?: string; name: string; color?: string }>;
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
  ) => Promise<{ success: boolean; message: string; warning?: string; updatedTransactionIds?: string[] }>;
  onRequestCreateCategory?: (initialName: string) => Promise<string | null>;
  onNewChat?: () => void;
  onSelectThread?: (threadId: string) => void;
  onRenameThread?: (threadId: string, newTitle: string) => Promise<void> | void;
  onDeleteThread?: (threadId: string) => Promise<void> | void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  categories = [],
  threads = [],
  activeThreadId = null,
  onSendMessage,
  onUploadReceipt,
  onConfirmAction,
  onCancelAction,
  onAssignCategory,
  onRequestCreateCategory,
  onNewChat,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
}) => {
  const { accentColor, tintColor, isDark } = useTheme();
  const [inputText, setInputText] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [showScrollBottomButton, setShowScrollBottomButton] = useState(false);

  // Web Speech API Voice Recognition State (Hydration-safe via useSyncExternalStore)
  const [isListening, setIsListening] = useState(false);
  const speechSupported = useSyncExternalStore(
    () => () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    () => false
  );
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

  const chatRootRef = useRef<HTMLDivElement>(null);

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
    <div ref={chatRootRef} className="h-full w-full">
      <LiquidGlassContainer
      className="h-full w-full"
      contentClassName="relative flex flex-col h-full p-2.5 sm:p-3 overflow-hidden"
      borderRadius={28}
      glass={{
        blur: 24,
        opacity: 0.82,
        saturation: 1.8,
        tint: tintColor,
        edge: 0.9,
        distortion: 26,
      }}
      accent={accentColor}
      intensity={1}
    >
      {/* Hidden file picker for real receipt audits */}
      <input
        id="receipt-file-upload"
        name="receiptFile"
        aria-label="Upload receipt image or PDF"
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,application/pdf"
        className="hidden"
      />

      {/* Floating Inset Header with Controls */}
      <div className="relative px-3 py-2.5 glass-strip flex items-center justify-between gap-2 shrink-0 rounded-2xl">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <h1 className="text-sm font-bold text-[var(--fg-primary)] whitespace-nowrap">
            PocketMate
          </h1>
        </div>

        {/* Action Controls: History Drawer, New Chat */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* History Drawer Toggle Button */}
          <button
            type="button"
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            aria-label="Toggle Conversation History Drawer"
            className={`flex items-center gap-1 px-2 xl:px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba] ${
              isHistoryOpen
                ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] shadow-2xs"
                : "theme-btn-secondary hover:border-[var(--accent-border)]"
            }`}
          >
            <History className="w-3.5 h-3.5 opacity-80" />
            <span className="hidden sm:inline">History</span>
            {threads.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[var(--surface-subtle)] text-[10px] text-[var(--fg-secondary)] font-mono border border-[var(--border-subtle)]">
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
              className="flex items-center gap-1 px-2 xl:px-2.5 py-1.5 rounded-xl bg-[var(--accent-subtle)] hover:bg-[var(--accent-subtle-hover)] text-[var(--accent-text)] text-xs font-bold border border-[var(--accent-border)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline whitespace-nowrap">New Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-Thread History Drawer (Slide-Over / Overlay) */}
      {isHistoryOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Conversation History"
          className="absolute inset-0 z-30 bg-[var(--surface-modal)]/95 backdrop-blur-xl rounded-[28px] flex flex-col animate-in fade-in duration-150 text-[var(--fg-primary)]"
        >
          {/* Drawer Header */}
          <div className="px-4 py-3 theme-modal-header border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--accent-text)]" />
              <h2 className="text-sm font-bold text-[var(--fg-primary)]">History</h2>
              <span className="text-[11px] text-[var(--fg-muted)] font-mono">({threads.length})</span>
            </div>

            <div className="flex items-center gap-2">
              {onNewChat && (
                <button
                  type="button"
                  onClick={() => {
                    onNewChat();
                    setIsHistoryOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg theme-btn-primary text-xs font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Chat</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                aria-label="Close conversation history"
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drawer Body - Thread List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                <Clock className="w-8 h-8 text-[var(--accent-text)] opacity-60 mb-2" />
                <p className="text-xs font-semibold text-[var(--fg-primary)]">No conversations yet</p>
                {onNewChat && (
                  <button
                    type="button"
                    onClick={() => {
                      onNewChat();
                      setIsHistoryOpen(false);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg theme-btn-primary text-xs font-bold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Chat</span>
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
                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] shadow-xs ring-1 ring-[#0070ba]/30"
                        : "bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-[var(--accent-border)]"
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
                              className="w-full bg-[var(--surface-card)] border border-[var(--accent-border)] rounded-lg px-2.5 py-1 text-xs text-[var(--fg-primary)] focus:outline-none focus:ring-1 focus:ring-[#0070ba] font-medium"
                            />
                            <button
                              type="button"
                              onClick={(e) => void handleSaveRename(thread.id, e)}
                              aria-label="Save title"
                              className="p-1 rounded theme-btn-primary cursor-pointer"
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
                              className="p-1 rounded theme-btn-secondary border cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-xs font-bold truncate ${
                                isActive ? "text-[var(--accent-text)]" : "text-[var(--fg-primary)]"
                              }`}
                            >
                              {thread.title}
                            </p>
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--accent-subtle-hover)] text-[var(--accent-text)] border border-[var(--accent-border)] font-bold">
                                Active
                              </span>
                            )}
                          </div>
                        )}

                        {thread.lastMessageSnippet && !isEditing && (
                          <p className="text-[11px] text-[var(--fg-muted)] truncate mt-0.5">
                            {thread.lastMessageSnippet}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--fg-muted)] font-medium">
                          <span>{thread.messageCount} msg{thread.messageCount === 1 ? "" : "s"}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(thread.updatedAt)}</span>
                        </div>
                      </div>

                      {/* Action buttons (Edit & Delete) */}
                      {!isEditing && (
                        <div
                          className="flex items-center gap-1 opacity-75 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {onRenameThread && (
                            <button
                              type="button"
                              onClick={(e) => handleStartRename(thread, e)}
                              aria-label={`Rename ${thread.title}`}
                              className="p-1 text-[var(--fg-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--accent-subtle)] rounded transition-colors cursor-pointer"
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
                              className="p-1 text-[var(--fg-muted)] hover:text-[var(--status-danger-text)] hover:bg-[var(--status-danger-bg)] rounded transition-colors cursor-pointer disabled:opacity-40"
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
        className="flex-1 my-2 overflow-y-auto space-y-3 relative bg-transparent px-1"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 text-sm ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}

            <ElasticChatBubble
              role={m.role}
              intensity={0.75}
            >
              {m.role === "user" ? (
                <div className="whitespace-pre-line text-xs md:text-sm font-medium text-white">{m.content}</div>
              ) : (
                <div className="text-xs md:text-sm text-[var(--fg-primary)]">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-base font-bold text-[var(--fg-primary)] my-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold text-[var(--fg-primary)] my-1.5">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-xs md:text-sm font-bold text-[var(--accent-text)] my-1">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-xs font-semibold text-[var(--fg-primary)] mt-2 mb-0.5">{children}</h4>,
                      p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed text-[var(--fg-primary)]">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-[var(--fg-secondary)]">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-[var(--fg-secondary)]">{children}</ol>,
                      li: ({ children }) => <li className="text-[var(--fg-secondary)]">{children}</li>,
                      strong: ({ children }) => <strong className="font-bold text-[var(--fg-primary)]">{children}</strong>,
                      hr: () => <hr className="border-[var(--border-subtle)] my-2.5" />,
                      code: ({ children }) => (
                        <code className="bg-[var(--surface-subtle)] px-1 py-0.5 rounded text-[11px] font-mono text-[var(--accent-text)] border border-[var(--border-subtle)]">
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
                  categories={categories}
                  onConfirm={onConfirmAction}
                  onCancel={() => onCancelAction?.(m.id)}
                  onAssignCategory={onAssignCategory}
                  onRequestCreateCategory={onRequestCreateCategory}
                />
              )}
            </ElasticChatBubble>

            {m.role === "user" && (
              <div className="w-7 h-7 rounded-lg bg-[#0070ba] border border-[#005ea6] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-2xs">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 text-sm justify-start">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shrink-0">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="bg-[var(--surface-elevated)] backdrop-blur-md border border-[var(--border-subtle)] rounded-2xl px-4 py-3 text-[var(--fg-secondary)] text-xs flex items-center gap-2 shadow-2xs">
              <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? "bg-sky-400" : "bg-[#0070ba]"}`} />
              <span className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.2s] ${isDark ? "bg-sky-400" : "bg-[#0070ba]"}`} />
              <span className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.4s] ${isDark ? "bg-sky-400" : "bg-[#0070ba]"}`} />
              <span className="ml-1 text-[var(--fg-muted)] font-medium">Thinking...</span>
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
          className="absolute bottom-20 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full theme-btn-secondary border border-[var(--accent-border)] text-[var(--accent-text)] text-xs font-semibold shadow-md backdrop-blur-md transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          <span>Latest</span>
        </button>
      )}

      {/* Liquid Input Area */}
      <div className="relative shrink-0">
        <form onSubmit={handleSubmit} className="p-0 relative">
          <div
            className="relative flex items-center rounded-[30px] bg-[var(--surface-card)] border border-[var(--border-strong)] p-1 transition-all duration-300 hover:border-[var(--accent-border)] focus-within:border-[#0070ba] focus-within:ring-2 focus-within:ring-[#0070ba]/25 shadow-xs"
            style={{
              transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <input
              id="pocketmate-chat-input"
              name="chatMessage"
              aria-label="Message PocketMate"
              type="text"
              value={inputText}
              maxLength={2000}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isListening
                  ? "Listening..."
                  : "Ask PocketMate..."
              }
              className={`w-full bg-transparent border-0 pl-3.5 pr-2 py-2 text-xs md:text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none transition-all ${
                isListening ? "placeholder:text-rose-500 font-medium" : ""
              }`}
            />

            <div className="flex items-center gap-1 shrink-0 pr-1">
              {/* Voice Input (Web Speech API) */}
              <button
                type="button"
                title={
                  !speechSupported
                    ? "Speech recognition unavailable"
                    : isListening
                    ? "Stop listening"
                    : "Voice input"
                }
                onClick={toggleVoiceInput}
                disabled={!speechSupported}
                className={`p-1.5 rounded-full transition-all cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba] ${
                  isListening
                    ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border border-[var(--status-danger-border)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--surface-subtle)] disabled:opacity-40"
                }`}
              >
                {isListening && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                )}
                <Mic className={`w-3.5 h-3.5 ${isListening ? "animate-pulse text-rose-500" : ""}`} />
              </button>

              {/* Upload Receipt / Document Image */}
              <button
                type="button"
                title="Upload receipt"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-[var(--fg-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--surface-subtle)] rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              {/* PayPal Blue Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="h-8 px-3.5 theme-btn-primary active:scale-95 disabled:opacity-40 font-bold rounded-full transition-all flex items-center gap-1 text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              >
                <span>Send</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </LiquidGlassContainer>
  </div>
  );
};
