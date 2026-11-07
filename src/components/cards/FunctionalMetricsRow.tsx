"use client";

import React, { useState, useRef, useEffect, useSyncExternalStore } from "react";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";
import type { TransactionRow } from "@/components/grid/TransactionGrid";
import type { ScheduledEvent } from "@/components/scheduler/BudgetScheduler";
import type { UserAccount } from "@/types/sandboxUser";

export interface FunctionalMetricsRowProps {
  categories: CategoryItem[];
  transactions: TransactionRow[];
  events: ScheduledEvent[];
  currentUser: UserAccount | null;
  activeScope: "personal" | "all";
  onNavigateTab: (tab: "transactions" | "insights" | "upcoming") => void;
  onFilterLedger: (debtorName?: string, categoryName?: string) => void;
  onSendChatMessage: (prompt: string) => void;
}

export const FunctionalMetricsRow: React.FC<FunctionalMetricsRowProps> = ({
  categories: _categories,
  transactions: _transactions,
  events: _events,
  currentUser: _currentUser,
  activeScope: _activeScope,
  onNavigateTab: _onNavigateTab,
  onFilterLedger: _onFilterLedger,
  onSendChatMessage: _onSendChatMessage,
}) => {
  const [activeFlyout, setActiveFlyout] = useState<number | null>(null);
  const [pinnedFlyout, setPinnedFlyout] = useState<number | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const _isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Close flyouts on Escape key or outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveFlyout(null);
        setPinnedFlyout(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveFlyout(null);
        setPinnedFlyout(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const _handleMouseEnter = (cardIndex: number) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setActiveFlyout(cardIndex);
  };

  const _handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      if (pinnedFlyout === null) {
        setActiveFlyout(null);
      }
    }, 220);
  };

  const _handleCardClick = (cardIndex: number) => {
    if (pinnedFlyout === cardIndex) {
      setPinnedFlyout(null);
      setActiveFlyout(null);
    } else {
      setPinnedFlyout(cardIndex);
      setActiveFlyout(cardIndex);
    }
  };

  const _isFlyoutOpen = (cardIndex: number) => {
    return pinnedFlyout === cardIndex || activeFlyout === cardIndex;
  };

  return (
    <div ref={containerRef} className="relative mb-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric cards container */}
      </section>
    </div>
  );
};
