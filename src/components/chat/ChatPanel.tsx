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
import { LiquidGlassContainer } from "@/components/ui/LiquidGlassContainer";

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
  ) => Promise<{ success: boolean; message: string; updatedTransactionIds?: string[] }>;
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
    <LiquidGlassContainer
      className="h-full w-full rounded-[28px]"
      contentClassName="relative flex flex-col h-full overflow-hidden rounded-[28px]"
      borderRadius={28}
      cursorSize={32}
      showCursor={true}
      glass={{
        blur: 24,
        opacity: 0.82,
        saturation: 1.8,
        tint: "#fdfbf7",
        edge: 0.9,
        distortion: 26,
      }}
      accent="#f59e0b"
      intensity={0.85}
      rippleStrength={1}
    >
      {/* Hidden file picker for real receipt audits */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,application/pdf"
        className="hidden"
      />

      {/* Header with Agent Status & Controls */}
      <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-white/45 backdrop-blur-md border-b border-white/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/60 flex items-center justify-center text-amber-800 shrink-0 shadow-2xs backdrop-blur-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5 truncate">
              PocketMate <span className="text-[10px] text-stone-500 font-normal">v1.0</span>
            </h1>
            <p className="text-[11px] text-stone-500 truncate">Assistant</p>
          </div>
        </div>

        {/* Action Controls: History Drawer, New Chat, Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* History Drawer Toggle Button */}
          <button
            type="button"
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            aria-label="Toggle Conversation History Drawer"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400 ${
              isHistoryOpen
                ? "bg-amber-500/20 border-amber-400 text-amber-950 shadow-2xs"
                : "bg-white/60 hover:bg-white/90 text-stone-700 border-white/80 hover:text-zinc-900 shadow-2xs backdrop-blur-xs"
            }`}
          >
            <History className="w-3.5 h-3.5 text-stone-500" />
            <span className="hidden sm:inline">History</span>
            {threads.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-stone-200/80 text-[10px] text-stone-700 font-mono">
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
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/35 text-amber-950 text-xs font-bold border border-amber-400/80 transition-all cursor-pointer shadow-2xs backdrop-blur-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <Plus className="w-3.5 h-3.5 text-amber-700" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}

          {/* Active Status Badge with Liquid Pulse */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-300/80 text-[11px] font-bold text-amber-900 shadow-2xs backdrop-blur-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>Liquid Flow Active</span>
          </div>
        </div>
      </div>

      {/* Multi-Thread History Drawer (Slide-Over / Overlay) */}
      {isHistoryOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Conversation History"
          className="absolute inset-0 z-30 bg-white/92 backdrop-blur-xl rounded-[28px] flex flex-col animate-in fade-in duration-150"
        >
          {/* Drawer Header */}
          <div className="px-4 py-3 bg-white/60 border-b border-stone-200/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-700" />
              <h2 className="text-sm font-bold text-zinc-900">Conversation History</h2>
              <span className="text-[11px] text-stone-500 font-mono">({threads.length})</span>
            </div>

            <div className="flex items-center gap-2">
              {onNewChat && (
                <button
                  type="button"
                  onClick={() => {
                    onNewChat();
                    setIsHistoryOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Chat</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                aria-label="Close conversation history"
                className="p-1 text-stone-400 hover:text-zinc-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drawer Body - Thread List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                <Clock className="w-8 h-8 text-amber-600/50 mb-2" />
                <p className="text-xs font-semibold text-zinc-800">No saved conversations yet</p>
                <p className="text-[11px] text-stone-500 mt-1 max-w-xs">
                  Your chat threads and financial queries will automatically appear here.
                </p>
                {onNewChat && (
                  <button
                    type="button"
                    onClick={() => {
                      onNewChat();
                      setIsHistoryOpen(false);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
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
                        ? "bg-amber-500/10 border-amber-300 shadow-xs ring-1 ring-amber-300/60"
                        : "bg-white/80 hover:bg-amber-50/50 active:bg-amber-100/40 border-stone-200/90 hover:border-amber-300/70"
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
                              className="w-full bg-white border border-amber-400 rounded-lg px-2.5 py-1 text-xs text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-medium"
                            />
                            <button
                              type="button"
                              onClick={(e) => void handleSaveRename(thread.id, e)}
                              aria-label="Save title"
                              className="p-1 rounded bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-2xs"
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
                              className="p-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-xs font-bold truncate ${
                                isActive ? "text-amber-950" : "text-zinc-800"
                              }`}
                            >
                              {thread.title}
                            </p>
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-900 border border-amber-300/80 font-bold">
                                Active
                              </span>
                            )}
                          </div>
                        )}

                        {thread.lastMessageSnippet && !isEditing && (
                          <p className="text-[11px] text-stone-500 truncate mt-0.5">
                            {thread.lastMessageSnippet}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-stone-400 font-medium">
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
                              className="p-1 text-stone-400 hover:text-amber-800 hover:bg-amber-50 active:bg-amber-100 rounded transition-colors cursor-pointer"
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
                              className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 active:bg-rose-100 rounded transition-colors cursor-pointer disabled:opacity-40"
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
        className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 relative bg-transparent"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 text-sm ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-400/50 flex items-center justify-center text-amber-800 shrink-0 mt-0.5 shadow-2xs backdrop-blur-xs">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed ${
                m.role === "user"
                  ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-tr-xs shadow-xs"
                  : "bg-white/80 backdrop-blur-md border border-white/90 text-zinc-900 rounded-tl-xs shadow-[0_4px_16px_rgba(0,0,0,0.03)]"
              }`}
            >
              {/* Tool Execution Badges if any */}
              {m.toolBadges && m.toolBadges.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {m.toolBadges.map((badge, bIdx) => (
                    <span
                      key={bIdx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-300/80 text-[10px] text-amber-900 rounded font-mono font-medium"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                      {badge}
                    </span>
                  ))}
                </div>
              )}

              {m.role === "user" ? (
                <div className="whitespace-pre-line text-xs md:text-sm font-medium text-white">{m.content}</div>
              ) : (
                <div className="text-xs md:text-sm text-zinc-800">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-base font-bold text-zinc-950 my-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold text-zinc-900 my-1.5">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-xs md:text-sm font-bold text-amber-800 my-1">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-xs font-semibold text-zinc-800 mt-2 mb-0.5">{children}</h4>,
                      p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed text-zinc-800">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-zinc-700">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-zinc-700">{children}</ol>,
                      li: ({ children }) => <li className="text-zinc-700">{children}</li>,
                      strong: ({ children }) => <strong className="font-bold text-zinc-950">{children}</strong>,
                      hr: () => <hr className="border-stone-200 my-2.5" />,
                      code: ({ children }) => (
                        <code className="bg-stone-100 px-1 py-0.5 rounded text-[11px] font-mono text-amber-900 border border-stone-200">
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
                />
              )}
            </div>

            {m.role === "user" && (
              <div className="w-7 h-7 rounded-lg bg-amber-600 border border-amber-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-2xs">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 text-sm justify-start">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-400/50 flex items-center justify-center text-amber-800 shrink-0 shadow-2xs backdrop-blur-xs">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="bg-white/80 backdrop-blur-md border border-white/90 rounded-2xl px-4 py-3 text-stone-700 text-xs flex items-center gap-2 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-stone-600 font-medium">Orchestrating financial ledger...</span>
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
          className="absolute bottom-20 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 hover:bg-white text-amber-900 border border-amber-300/80 text-xs font-semibold shadow-md backdrop-blur-md transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <ChevronDown className="w-3.5 h-3.5 text-amber-600" />
          <span>Latest</span>
        </button>
      )}

      {/* Liquid Input Area */}
      <div className="relative">
        <div className="h-[1px] w-full bg-gradient-to-r from-amber-400/10 via-amber-400/60 to-amber-400/10" />
        <form onSubmit={handleSubmit} className="p-3 bg-white/35 backdrop-blur-md border-t border-white/50 relative">
          <div className="relative flex items-center rounded-[30px] bg-white/75 border border-white/90 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06),inset_0_-1px_1px_rgba(255,255,255,0.95),0_2px_8px_rgba(0,0,0,0.03)] p-1 transition-all focus-within:border-amber-400/80 focus-within:ring-2 focus-within:ring-amber-400/25">
            <input
              type="text"
              value={inputText}
              maxLength={2000}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isListening
                  ? "Listening... speak your request"
                  : "Type or speak a request (e.g., 'split $80 dinner with Alex', 'add $1200 rent on 1st')..."
              }
              className={`w-full bg-transparent border-0 pl-3.5 pr-2 py-2 text-xs md:text-sm text-zinc-900 placeholder-stone-400 focus:outline-hidden transition-all ${
                isListening ? "placeholder-rose-500 font-medium" : ""
              }`}
            />

            <div className="flex items-center gap-1 shrink-0 pr-1">
              {/* Voice Input (Web Speech API) */}
              <button
                type="button"
                title={
                  !speechSupported
                    ? "Speech recognition is not supported in this browser"
                    : isListening
                    ? "Stop listening"
                    : "Voice input"
                }
                onClick={toggleVoiceInput}
                disabled={!speechSupported}
                className={`p-1.5 rounded-full transition-all cursor-pointer relative focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  isListening
                    ? "bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs"
                    : "text-stone-400 hover:text-amber-800 hover:bg-stone-200/50 active:bg-stone-200/80 disabled:opacity-40"
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
                title="Upload receipt or bill image"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-stone-400 hover:text-amber-800 hover:bg-stone-200/50 active:bg-stone-200/80 rounded-full transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              {/* Fluid Gold Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="h-8 px-3.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 disabled:opacity-40 text-white font-bold rounded-full transition-all flex items-center gap-1 text-xs shadow-xs cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <span>Send</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </LiquidGlassContainer>
  );
};
