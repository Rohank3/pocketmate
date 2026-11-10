"use client";

import React, { useState, useMemo, useRef, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ChevronLeft,
  ChevronRight,
  Settings2,
  DollarSign,
  X,
  Tag,
  MoreVertical,
  Edit2,
  Trash2,
  Palette,
} from "lucide-react";
import { TransactionRow } from "@/components/grid/TransactionGrid";
import { DISTINCT_CATEGORY_PALETTE } from "@/lib/utils/categoryColors";

gsap.registerPlugin(useGSAP);

export interface CategoryItem {
  id: string;
  name: string;
  monthlyCap: number;
  color: string;
  isCustom?: boolean;
  alertThreshold?: number | null;
  softCap?: number | null;
}

interface CategoryControlBarProps {
  categories: CategoryItem[];
  selectedCategory: string; // "all" or specific category name
  transactions: TransactionRow[];
  onSelectCategory: (categoryName: string) => void;
  onAddCategory: (category: Omit<CategoryItem, "id">) => void;
  onEditCategory: (
    categoryId: string,
    updatedCap: number,
    updatedName?: string,
    updatedColor?: string,
    reinitialize?: boolean
  ) => void;
  onDeleteCategory: (categoryId: string) => void;
}

export const PRESET_COLORS = [...DISTINCT_CATEGORY_PALETTE];

export const CategoryControlBar: React.FC<CategoryControlBarProps> = ({
  categories,
  selectedCategory,
  transactions,
  onSelectCategory,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"add" | "manage">("manage");

  // Form states for adding category
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("300");

  const nextAvailableColor = useMemo(() => {
    const used = new Set(categories.map((c) => c.color?.toLowerCase()));
    return DISTINCT_CATEGORY_PALETTE.find((c) => !used.has(c.toLowerCase())) || DISTINCT_CATEGORY_PALETTE[0];
  }, [categories]);

  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const newColor = selectedColor || nextAvailableColor;
  const setNewColor = (color: string) => setSelectedColor(color);

  // Editing state inside Manage tab
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editNameDraft, setEditNameDraft] = useState("");
  const [editCapDraft, setEditCapDraft] = useState("");
  const [editColorDraft, setEditColorDraft] = useState("");
  const [editReinitializeDraft, setEditReinitializeDraft] = useState(false);

  // Pill context menu dropdown state (portalled outside overflow-x-auto strip)
  const [activeMenu, setActiveMenu] = useState<{
    cat: CategoryItem;
    top: number;
    left: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      if (!activeMenu?.cat.id || !menuRef.current) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          menuRef.current,
          { y: -6, scale: 0.97, opacity: 0 },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.18,
            ease: "power2.out",
            clearProps: "transform,opacity",
          }
        );
      });
      return () => mm.revert();
    },
    { scope: barRef, dependencies: [activeMenu?.cat.id], revertOnUpdate: true }
  );

  // Quick single category edit modal state (when opened directly from pill context menu)
  const [quickEditCategory, setQuickEditCategory] = useState<CategoryItem | null>(null);

  // Delete confirmation modal state
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<CategoryItem | null>(null);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  // Close dropdown on outside click or scroll & close modals on Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }
    function handleScroll() {
      setActiveMenu(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveMenu(null);
        setIsModalOpen(false);
        setQuickEditCategory(null);
        setCategoryPendingDelete(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Compute spent amount per category dynamically from transactions
  const categoryStats = useMemo(() => {
    const stats: Record<string, { spent: number; count: number }> = {};
    for (const cat of categories) {
      stats[cat.name.toLowerCase()] = { spent: 0, count: 0 };
    }

    let totalSpent = 0;
    let totalCount = 0;

    for (const tx of transactions) {
      const catKey = tx.category.toLowerCase();
      totalSpent += tx.amount;
      totalCount += 1;

      const matched = categories.find(
        (c) =>
          c.name.toLowerCase() === catKey ||
          c.name.toLowerCase().includes(catKey) ||
          catKey.includes(c.name.toLowerCase())
      );

      if (matched) {
        const key = matched.name.toLowerCase();
        if (!stats[key]) stats[key] = { spent: 0, count: 0 };
        stats[key].spent += tx.amount;
        stats[key].count += 1;
      }
    }

    return {
      byCategory: stats,
      totalSpent,
      totalCount,
    };
  }, [categories, transactions]);

  // Roundabout navigation options: ["All", ...categories]
  const options = useMemo(() => ["All", ...categories.map((c) => c.name)], [categories]);
  const totalOptions = options.length;

  const currentIndex = useMemo(() => {
    const idx = options.findIndex((opt) => opt.toLowerCase() === selectedCategory.toLowerCase());
    return idx === -1 ? 0 : idx;
  }, [options, selectedCategory]);

  const handlePrevRoundabout = () => {
    const prevIdx = (currentIndex - 1 + totalOptions) % totalOptions;
    onSelectCategory(options[prevIdx]);
  };

  const handleNextRoundabout = () => {
    const nextIdx = (currentIndex + 1) % totalOptions;
    onSelectCategory(options[nextIdx]);
  };

  const activeCategoryObj = useMemo(() => {
    if (selectedCategory.toLowerCase() === "all") return null;
    return categories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase()) || null;
  }, [categories, selectedCategory]);

  const activeStats = useMemo(() => {
    if (!activeCategoryObj) {
      return {
        spent: categoryStats.totalSpent,
        cap: categories.reduce((sum, c) => sum + c.monthlyCap, 0),
        count: categoryStats.totalCount,
      };
    }
    const stat = categoryStats.byCategory[activeCategoryObj.name.toLowerCase()] || { spent: 0, count: 0 };
    return {
      spent: stat.spent,
      cap: activeCategoryObj.monthlyCap,
      count: stat.count,
    };
  }, [activeCategoryObj, categories, categoryStats]);

  const isOverCap = activeStats.spent > activeStats.cap && activeCategoryObj !== null;
  const percentUsed = Math.min(100, Math.round((activeStats.spent / (activeStats.cap || 1)) * 100));

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const capNum = Math.max(0, parseFloat(newCap) || 200);
    onAddCategory({
      name: newName.trim(),
      monthlyCap: capNum,
      color: newColor,
      isCustom: true,
    });
    setNewName("");
    setNewCap("300");
    setSelectedColor(null);
    setIsModalOpen(false);
    onSelectCategory(newName.trim());
  };

  const handleStartInlineEdit = (cat: CategoryItem) => {
    setEditingCategoryId(cat.id);
    setEditNameDraft(cat.name);
    setEditCapDraft(cat.monthlyCap.toString());
    setEditColorDraft(cat.color);
    setEditReinitializeDraft(false);
  };

  const handleSaveInlineEdit = (catId: string) => {
    const cap = Math.max(0, parseFloat(editCapDraft) || 100);
    const name = editNameDraft.trim() || undefined;
    onEditCategory(catId, cap, name, editColorDraft, editReinitializeDraft);
    setEditingCategoryId(null);
  };

  const handleConfirmDelete = () => {
    if (categoryPendingDelete) {
      onDeleteCategory(categoryPendingDelete.id);
      setCategoryPendingDelete(null);
      setActiveMenu(null);
    }
  };

  const handleQuickEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditCategory) return;
    const cap = Math.max(0, parseFloat(editCapDraft) || quickEditCategory.monthlyCap);
    const name = editNameDraft.trim() || quickEditCategory.name;
    onEditCategory(quickEditCategory.id, cap, name, editColorDraft, editReinitializeDraft);
    setQuickEditCategory(null);
    if (selectedCategory.toLowerCase() === quickEditCategory.name.toLowerCase()) {
      onSelectCategory(name);
    }
  };

  return (
    <div ref={barRef} className="relative glass-strip rounded-2xl p-3 flex flex-col gap-2.5 text-[var(--fg-primary)]">
      {/* Top Bar: Roundabout Carousel + Budget Cap Meter + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Roundabout Category Navigator */}
        <div className="flex items-center gap-2 bg-[var(--surface-elevated)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] shadow-2xs">
          <span
            className="w-3 h-3 rounded-sm shrink-0 shadow-xs"
            style={{
              backgroundColor: activeCategoryObj ? activeCategoryObj.color : "#0070ba",
            }}
          />

          <span className="text-xs font-bold text-[var(--fg-primary)] min-w-[75px]">
            {selectedCategory.toLowerCase() === "all" ? "All Categories" : selectedCategory}
          </span>

          <div className="flex items-center gap-1 ml-1.5 border-l border-[var(--border-subtle)] pl-1.5">
            <button
              onClick={handlePrevRoundabout}
              className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              title="Previous category"
              aria-label="Previous category"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono tabular-nums text-[11px] text-[var(--fg-secondary)] px-1 font-semibold select-none">
              {currentIndex + 1} / {totalOptions}
            </span>

            <button
              onClick={handleNextRoundabout}
              className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              title="Next category"
              aria-label="Next category"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Budget Cap Indicator */}
        <div className="hidden sm:flex items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-mono tabular-nums">
            <span className="text-[var(--fg-muted)]">Spent:</span>
            <span className="font-bold text-[var(--fg-primary)]">${activeStats.spent.toFixed(2)}</span>
            <span className="text-[var(--fg-muted)]">/</span>
            <span className="text-[var(--fg-secondary)] font-semibold">${activeStats.cap.toFixed(2)} Cap</span>
          </div>

          {activeCategoryObj && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isOverCap
                  ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]"
                  : "bg-[var(--status-success-bg)] text-[var(--status-success-text)] border-[var(--status-success-border)]"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isOverCap ? "bg-rose-500" : "bg-emerald-500"}`} />
              {isOverCap ? (
                <span>+${(activeStats.spent - activeStats.cap).toFixed(2)} Over</span>
              ) : (
                <span>${(activeStats.cap - activeStats.spent).toFixed(2)} Left</span>
              )}
            </div>
          )}
        </div>

        {/* Category Actions: Single Manage Button */}
        <div className="flex items-center ml-auto">
          <button
            onClick={() => {
              setModalTab("manage");
              setEditingCategoryId(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl theme-btn-secondary border hover:border-[var(--accent-border)] active:scale-[0.98] text-xs font-semibold cursor-pointer shadow-2xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
            title="Manage categories"
          >
            <Settings2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
            <span>Manage Categories</span>
          </button>
        </div>
      </div>

      {/* Category Pills with 3-Dot Context Action Menu */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin relative">
        {options.map((optName) => {
          const isSelected = selectedCategory.toLowerCase() === optName.toLowerCase();
          const isAll = optName.toLowerCase() === "all";
          const catObj = isAll ? null : categories.find((c) => c.name.toLowerCase() === optName.toLowerCase());
          const stat = isAll
            ? { spent: categoryStats.totalSpent, count: categoryStats.totalCount }
            : categoryStats.byCategory[optName.toLowerCase()] || { spent: 0, count: 0 };
          const catOverCap = catObj ? stat.spent > catObj.monthlyCap : false;

          return (
            <div key={optName} className="relative group/pill flex items-center shrink-0">
              <button
                onClick={() => onSelectCategory(optName)}
                className={`flex items-center gap-1.5 pl-3 pr-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba] ${
                  isSelected
                    ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent-border)] shadow-2xs font-semibold"
                    : "bg-[var(--surface-elevated)] text-[var(--fg-secondary)] border-[var(--border-subtle)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-subtle)] hover:text-[var(--fg-primary)]"
                }`}
              >
                {!isAll && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: catObj?.color || "#0070ba" }}
                  />
                )}
                <span>{optName}</span>
                <span
                  className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full font-semibold ${
                    isSelected
                      ? "bg-[var(--accent-subtle-hover)] text-[var(--accent-text)]"
                      : catOverCap
                      ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border border-[var(--status-danger-border)]"
                      : "bg-[var(--surface-subtle)] text-[var(--fg-secondary)]"
                  }`}
                >
                  ${stat.spent.toFixed(0)}
                  {catOverCap && " !"}
                </span>

                {/* 3-dots trigger inside custom category pills */}
                {!isAll && catObj && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeMenu?.cat.id === catObj.id) {
                        setActiveMenu(null);
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      const menuWidth = 176;
                      const clampedLeft = Math.max(
                        8,
                        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
                      );
                      const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
                      setActiveMenu({ cat: catObj, top, left: clampedLeft });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (activeMenu?.cat.id === catObj.id) {
                          setActiveMenu(null);
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const menuWidth = 176;
                        const clampedLeft = Math.max(
                          8,
                          Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
                        );
                        const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
                        setActiveMenu({ cat: catObj, top, left: clampedLeft });
                      }
                    }}
                    className={`ml-0.5 p-0.5 rounded hover:bg-[var(--surface-hover)] transition-opacity cursor-pointer ${
                      isSelected ? "text-[var(--accent-text)]" : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                    } ${activeMenu?.cat.id === catObj.id ? "opacity-100" : "opacity-70 group-hover/pill:opacity-100"}`}
                    title={`Options for ${catObj.name}`}
                    aria-label={`Options for ${catObj.name}`}
                  >
                    <MoreVertical className="w-3 h-3" />
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Portalled 3-Dot Category Context Dropdown Menu */}
      {activeMenu && mounted && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{ top: activeMenu.top, left: activeMenu.left }}
          className="fixed z-[210] w-44 rounded-xl glass-dropdown py-1 text-xs"
        >
          <div className="px-3 py-1 text-[10px] font-bold text-[var(--fg-muted)] border-b border-[var(--border-subtle)] uppercase tracking-wider">
            {activeMenu.cat.name}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const cat = activeMenu.cat;
              setQuickEditCategory(cat);
              setEditNameDraft(cat.name);
              setEditCapDraft(cat.monthlyCap.toString());
              setEditColorDraft(cat.color);
              setEditReinitializeDraft(false);
              setActiveMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--accent-subtle)] text-left text-[var(--fg-primary)] cursor-pointer transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
            <span>Edit Category</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCategoryPendingDelete(activeMenu.cat);
              setActiveMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--status-danger-bg)] text-left text-[var(--status-danger-text)] cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Category</span>
          </button>
        </div>,
        document.body
      )}

      {/* Progress Bar for Selected Category */}
      <div className="w-full bg-[var(--surface-subtle)] rounded-full h-1.5 overflow-hidden border border-[var(--border-subtle)]">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isOverCap
              ? "bg-rose-500"
              : percentUsed > 80
              ? "bg-sky-500"
              : "bg-gradient-to-r from-[#0070ba] to-sky-400"
          }`}
          style={{ width: `${percentUsed}%` }}
        />
      </div>

      {/* Comprehensive Manage Categories & Add Category Modal */}
      {isModalOpen && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="theme-modal border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b theme-modal-header">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[var(--accent-text)]" />
                <h3 className="text-sm font-bold text-[var(--fg-primary)]">Categories</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Close modal"
                className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-1 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div className="flex border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 pt-2">
              <button
                onClick={() => setModalTab("manage")}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                  modalTab === "manage"
                    ? "border-[#0070ba] text-[var(--accent-text)]"
                    : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                }`}
              >
                Manage ({categories.length})
              </button>
              <button
                onClick={() => setModalTab("add")}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                  modalTab === "add"
                    ? "border-[#0070ba] text-[var(--accent-text)]"
                    : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                }`}
              >
                + Add Category
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5">
              {modalTab === "manage" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {categories.map((cat) => {
                      const stat = categoryStats.byCategory[cat.name.toLowerCase()] || { spent: 0, count: 0 };
                      const isEditing = editingCategoryId === cat.id;
                      const isOver = stat.spent > cat.monthlyCap;

                      if (isEditing) {
                        return (
                          <div
                            key={cat.id}
                            className="p-3 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex flex-col gap-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[var(--accent-text)]">Edit Category</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(cat.id)}
                                  className="px-2.5 py-1 rounded theme-btn-primary text-xs font-semibold cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCategoryId(null)}
                                  className="px-2 py-1 rounded theme-btn-secondary border text-xs cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-[var(--fg-secondary)] font-medium block mb-1">Name</label>
                                <input
                                  type="text"
                                  value={editNameDraft}
                                  onChange={(e) => setEditNameDraft(e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] focus:outline-none focus:border-[#0070ba]"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-[var(--fg-secondary)] font-medium block mb-1">Monthly Cap ($)</label>
                                <input
                                  type="number"
                                  min="10"
                                  step="10"
                                  value={editCapDraft}
                                  onChange={(e) => setEditCapDraft(e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] font-mono focus:outline-none focus:border-[#0070ba]"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] text-[var(--fg-secondary)] font-medium block mb-1">Color</label>
                              <div className="flex items-center gap-1.5">
                                {PRESET_COLORS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setEditColorDraft(c)}
                                    className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                                      editColorDraft === c ? "scale-125 ring-2 ring-[#0070ba]" : "hover:scale-110"
                                    }`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            </div>

                            {/* In-form Reinitialize & Reclassify Toggle */}
                            <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)]">
                              <span className="text-[11px] font-medium text-[var(--fg-primary)] pr-2">
                                Reclassify transactions with AI
                              </span>
                              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={editReinitializeDraft}
                                  onChange={(e) => setEditReinitializeDraft(e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-8 h-4.5 bg-slate-400/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#0070ba]"></div>
                              </label>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between p-2.5 rounded-xl theme-card-inset border hover:border-[var(--accent-border)] transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <div>
                              <p className="text-xs font-bold text-[var(--fg-primary)] flex items-center gap-1.5">
                                {cat.name}
                                {isOver && (
                                  <span className="text-[10px] text-[var(--status-danger-text)] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] px-1 rounded font-medium">
                                    Over
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-[var(--fg-muted)] font-mono tabular-nums">
                                ${stat.spent.toFixed(2)} / ${cat.monthlyCap.toFixed(0)} · {stat.count} tx
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartInlineEdit(cat)}
                              className="p-1.5 rounded-lg theme-btn-secondary border transition-colors cursor-pointer"
                              title={`Edit ${cat.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setCategoryPendingDelete(cat)}
                              className="p-1.5 rounded-lg theme-btn-secondary border hover:border-[var(--status-danger-border)] hover:text-[var(--status-danger-text)] transition-colors cursor-pointer"
                              title={`Delete ${cat.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--fg-muted)]">
                    <span>{categories.length} active</span>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-1.5 rounded-lg theme-btn-secondary border text-xs font-semibold cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateCategory} className="flex flex-col gap-3.5">
                  <div>
                    <label htmlFor="new-category-name" className="text-xs font-semibold text-[var(--fg-primary)] block mb-1">
                      Name
                    </label>
                    <input
                      id="new-category-name"
                      name="categoryName"
                      type="text"
                      placeholder="e.g. Travel, Utilities"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[#0070ba]"
                    />
                  </div>

                  <div>
                    <label htmlFor="new-category-cap" className="text-xs font-semibold text-[var(--fg-primary)] block mb-1">
                      Monthly Cap ($)
                    </label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-[var(--fg-muted)]" />
                      <input
                        id="new-category-cap"
                        name="monthlyCap"
                        type="number"
                        min="10"
                        step="10"
                        placeholder="300"
                        value={newCap}
                        onChange={(e) => setNewCap(e.target.value)}
                        required
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[#0070ba]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--fg-primary)] block mb-1.5">
                      Color
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewColor(c)}
                          className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                            newColor === c ? "scale-125 ring-2 ring-[#0070ba]" : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg theme-btn-primary text-xs font-semibold cursor-pointer"
                    >
                      Save Category
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Edit Single Category Modal */}
      {quickEditCategory && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setQuickEditCategory(null)}
        >
          <div
            className="theme-modal border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b theme-modal-header">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[var(--accent-text)]" />
                <h3 className="text-sm font-bold text-[var(--fg-primary)]">Edit {quickEditCategory.name}</h3>
              </div>
              <button
                onClick={() => setQuickEditCategory(null)}
                aria-label="Close modal"
                className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-1 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickEditSave} className="p-5 flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-[var(--fg-primary)] block mb-1">Name</label>
                <input
                  type="text"
                  value={editNameDraft}
                  onChange={(e) => setEditNameDraft(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-sm text-[var(--fg-primary)] focus:outline-none focus:border-[#0070ba]"
                />
              </div>

              <div>
                <label htmlFor="quick-edit-category-cap" className="text-xs font-semibold text-[var(--fg-primary)] block mb-1">Monthly Cap ($)</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-[var(--fg-muted)]" />
                  <input
                    id="quick-edit-category-cap"
                    name="quickEditCap"
                    type="number"
                    min="10"
                    step="10"
                    value={editCapDraft}
                    onChange={(e) => setEditCapDraft(e.target.value)}
                    required
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-sm text-[var(--fg-primary)] font-mono focus:outline-none focus:border-[#0070ba]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--fg-primary)] block mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
                  <span>Color</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColorDraft(c)}
                      className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                        editColorDraft === c ? "scale-125 ring-2 ring-[#0070ba]" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* In-form Reinitialize & Reclassify Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl theme-card-inset border">
                <span className="text-xs font-semibold text-[var(--fg-primary)] pr-2">
                  Reclassify with AI
                </span>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={editReinitializeDraft}
                    onChange={(e) => setEditReinitializeDraft(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-400/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0070ba]"></div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setQuickEditCategory(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg theme-btn-primary text-xs font-semibold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Safeguard Modal */}
      {categoryPendingDelete && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setCategoryPendingDelete(null)}
        >
          <div
            className="theme-modal border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] flex items-center justify-center text-[var(--status-danger-text)] shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--fg-primary)]">
                  Delete &ldquo;{categoryPendingDelete.name}&rdquo;?
                </h3>
                <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                  Transactions will move to Uncategorized.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCategoryPendingDelete(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium theme-btn-secondary border cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
