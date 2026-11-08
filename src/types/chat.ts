import { ActionCardData } from "@/components/cards/ActionConfirmCard";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionCard?: ActionCardData;
  toolBadges?: string[];
  createdAt?: string;
}

export interface ChatThreadItem {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
  createdAt: string;
  lastMessageSnippet?: string;
}

export interface CreateThreadPayload {
  title?: string;
}

export interface UpdateThreadPayload {
  id: string;
  title: string;
}
