"use client";

import React, { useState, useMemo, useRef, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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

  // Pill context menu dropdown state
  const [activeMenuCatId, setActiveMenuCatId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Quick single category edit modal state (when opened directly from pill context menu)
  const [quickEditCategory, setQuickEditCategory] = useState<CategoryItem | null>(null);

  // Delete confirmation modal state
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<CategoryItem | null>(null);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuCatId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      setActiveMenuCatId(null);
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
    <div className="glass-panel rounded-2xl p-3 flex flex-col gap-2.5 text-zinc-900 shadow-md">
      {/* Top Bar: Roundabout Carousel + Budget Cap Meter + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Roundabout Category Navigator */}
        <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200 shadow-2xs">
          <span
            className="w-3 h-3 rounded-sm shrink-0 shadow-xs"
            style={{
              backgroundColor: activeCategoryObj ? activeCategoryObj.color : "#f59e0b",
            }}
          />

          <span className="text-xs font-bold text-zinc-900 min-w-[75px]">
            {selectedCategory.toLowerCase() === "all" ? "All Categories" : selectedCategory}
          </span>

          <div className="flex items-center gap-1 ml-1.5 border-l border-stone-200 pl-1.5">
            <button
              onClick={handlePrevRoundabout}
              className="p-1 rounded hover:bg-stone-200/70 text-stone-500 hover:text-zinc-900 cursor-pointer transition-colors"
              title="Previous category"
              aria-label="Previous category"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono text-[11px] text-stone-600 px-1 font-semibold select-none">
              {currentIndex + 1} / {totalOptions}
            </span>

            <button
              onClick={handleNextRoundabout}
              className="p-1 rounded hover:bg-stone-200/70 text-stone-500 hover:text-zinc-900 cursor-pointer transition-colors"
              title="Next category"
              aria-label="Next category"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Budget Cap Indicator */}
        <div className="hidden sm:flex items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-stone-500">Spent:</span>
            <span className="font-bold text-zinc-900">${activeStats.spent.toFixed(2)}</span>
            <span className="text-stone-400">/</span>
            <span className="text-stone-600 font-semibold">${activeStats.cap.toFixed(2)} Cap</span>
          </div>

          {activeCategoryObj && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isOverCap
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isOverCap ? "bg-rose-500" : "bg-emerald-500"}`} />
              {isOverCap ? (
                <span>+${(activeStats.spent - activeStats.cap).toFixed(2)} Over</span>
              ) : (
                <span>${(activeStats.cap - activeStats.spent).toFixed(2)} Remaining</span>
              )}
            </div>
          )}
        </div>

        {/* Category Actions: Streamlined Single Manage Button */}
        <div className="flex items-center ml-auto">
          <button
            onClick={() => {
              setModalTab("manage");
              setEditingCategoryId(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 active:scale-[0.98] text-zinc-800 hover:text-zinc-900 text-xs font-semibold cursor-pointer border border-stone-200 hover:border-amber-300 shadow-2xs transition-all focus-visible:outline-2 focus-visible:outline-amber-400"
            title="Manage, rename, add, and set budget caps"
          >
            <Settings2 className="w-3.5 h-3.5 text-amber-700" />
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
                className={`flex items-center gap-1.5 pl-3 pr-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                  isSelected
                    ? "bg-amber-500/15 text-amber-950 border-amber-400/60 shadow-2xs font-semibold"
                    : "bg-stone-50 text-stone-700 border-stone-200/80 hover:border-amber-300 hover:bg-stone-100 hover:text-zinc-900"
                }`}
              >
                {!isAll && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: catObj?.color || "#f59e0b" }}
                  />
                )}
                <span>{optName}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-semibold ${
                    isSelected
                      ? "bg-amber-500/20 text-amber-950"
                      : catOverCap
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-stone-200/60 text-stone-600"
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
                      setActiveMenuCatId(activeMenuCatId === catObj.id ? null : catObj.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setActiveMenuCatId(activeMenuCatId === catObj.id ? null : catObj.id);
                      }
                    }}
                    className={`ml-0.5 p-0.5 rounded hover:bg-stone-200/70 transition-opacity cursor-pointer ${
                      isSelected ? "text-amber-900" : "text-stone-400 hover:text-stone-700"
                    } ${activeMenuCatId === catObj.id ? "opacity-100" : "opacity-60 group-hover/pill:opacity-100"}`}
                    title={`Options for ${catObj.name}`}
                    aria-label={`Options for ${catObj.name}`}
                  >
                    <MoreVertical className="w-3 h-3" />
                  </span>
                )}
              </button>

              {/* Context Dropdown Menu */}
              {!isAll && catObj && activeMenuCatId === catObj.id && (
                <div
                  ref={menuRef}
                  className="absolute left-0 top-full mt-1.5 z-40 w-44 rounded-xl bg-white border border-stone-200 shadow-xl py-1 text-xs text-zinc-800 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-3 py-1 text-[10px] font-bold text-stone-500 border-b border-stone-100 uppercase tracking-wider">
                    {catObj.name}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickEditCategory(catObj);
                      setEditNameDraft(catObj.name);
                      setEditCapDraft(catObj.monthlyCap.toString());
                      setEditColorDraft(catObj.color);
                      setEditReinitializeDraft(false);
                      setActiveMenuCatId(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 text-left text-zinc-800 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                    <span>Rename & Edit Cap</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryPendingDelete(catObj);
                      setActiveMenuCatId(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-50 text-left text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Delete Category</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Bar for Selected Category */}
      <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden border border-stone-200/70">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isOverCap ? "bg-rose-500" : percentUsed > 80 ? "bg-amber-500" : "bg-gradient-to-r from-amber-400 to-amber-500"
          }`}
          style={{ width: `${percentUsed}%` }}
        />
      </div>

      {/* Comprehensive Manage Categories & Add Category Modal (Portalled to document.body at z-[200]) */}
      {isModalOpen && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white/98 border border-amber-300/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-200 bg-amber-50/50">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-bold text-zinc-900">Category & Budget Cap Manager</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-zinc-800 p-1 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div className="flex border-b border-stone-200 bg-stone-50 px-5 pt-2">
              <button
                onClick={() => setModalTab("manage")}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                  modalTab === "manage"
                    ? "border-amber-500 text-amber-900"
                    : "border-transparent text-stone-500 hover:text-zinc-800"
                }`}
              >
                Manage & Rename Categories ({categories.length})
              </button>
              <button
                onClick={() => setModalTab("add")}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                  modalTab === "add"
                    ? "border-amber-500 text-amber-900"
                    : "border-transparent text-stone-500 hover:text-zinc-800"
                }`}
              >
                + Add New Category
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5">
              {modalTab === "manage" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-stone-600">
                    Rename categories, adjust monthly spending ceilings, customize colors, or delete unneeded categories. Existing transactions will remain safely preserved.
                  </p>

                  <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {categories.map((cat) => {
                      const stat = categoryStats.byCategory[cat.name.toLowerCase()] || { spent: 0, count: 0 };
                      const isEditing = editingCategoryId === cat.id;
                      const isOver = stat.spent > cat.monthlyCap;

                      if (isEditing) {
                        return (
                          <div
                            key={cat.id}
                            className="p-3 rounded-xl bg-amber-50/40 border border-amber-400/60 flex flex-col gap-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-900">Edit Category</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(cat.id)}
                                  className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer shadow-xs"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCategoryId(null)}
                                  className="px-2 py-1 rounded bg-stone-200 text-stone-700 hover:text-zinc-900 text-xs cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-stone-600 font-medium block mb-1">Name</label>
                                <input
                                  type="text"
                                  value={editNameDraft}
                                  onChange={(e) => setEditNameDraft(e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 focus:outline-hidden focus:border-amber-500"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-stone-600 font-medium block mb-1">Monthly Cap ($)</label>
                                <input
                                  type="number"
                                  min="10"
                                  step="10"
                                  value={editCapDraft}
                                  onChange={(e) => setEditCapDraft(e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 font-mono focus:outline-hidden focus:border-amber-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] text-stone-600 font-medium block mb-1">Badge Color</label>
                              <div className="flex items-center gap-1.5">
                                {PRESET_COLORS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setEditColorDraft(c)}
                                    className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                                      editColorDraft === c ? "scale-125 ring-2 ring-amber-500" : "hover:scale-110"
                                    }`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            </div>

                            {/* In-form Reinitialize & Reclassify Toggle (Default OFF) */}
                            <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-stone-200">
                              <div className="flex flex-col pr-2">
                                <span className="text-[11px] font-medium text-zinc-900">Reinitialize & reclassify with AI</span>
                                <span className="text-[10px] text-stone-500 leading-tight">
                                  Reset old rules and re-run Gemini AI over existing transactions
                                </span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={editReinitializeDraft}
                                  onChange={(e) => setEditReinitializeDraft(e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-8 h-4.5 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-600"></div>
                              </label>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-200/90 hover:border-amber-300 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                              style={{ backgroundColor: cat.color }}
                            />
                            <div>
                              <p className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                                {cat.name}
                                {isOver && (
                                  <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-1 rounded font-medium">
                                    Over Cap
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-stone-500 font-mono">
                                Spent: ${stat.spent.toFixed(2)} / ${cat.monthlyCap.toFixed(0)} ({stat.count} tx)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartInlineEdit(cat)}
                              className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-100 text-stone-600 hover:text-zinc-900 transition-colors cursor-pointer"
                              title={`Rename or edit ${cat.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setCategoryPendingDelete(cat)}
                              className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-rose-50 text-stone-500 hover:text-rose-600 transition-colors cursor-pointer"
                              title={`Delete ${cat.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-200 text-xs text-stone-600">
                    <span>{categories.length} active categories</span>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-zinc-800 text-xs font-semibold cursor-pointer border border-stone-200"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateCategory} className="flex flex-col gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-zinc-800 block mb-1">
                      Category Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Health & Fitness, Utilities, Travel"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-sm text-zinc-900 placeholder:text-stone-400 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-800 block mb-1">
                      Monthly Budget Cap ($)
                    </label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-stone-400" />
                      <input
                        type="number"
                        min="10"
                        step="10"
                        placeholder="300"
                        value={newCap}
                        onChange={(e) => setNewCap(e.target.value)}
                        required
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-white border border-stone-300 text-sm text-zinc-900 placeholder:text-stone-400 focus:outline-hidden focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-800 block mb-1.5">
                      Badge Color
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewColor(c)}
                          className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                            newColor === c ? "scale-125 ring-2 ring-amber-500" : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-stone-200">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
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

      {/* Quick Edit Single Category Modal (triggered from pill context menu, portalled to document.body at z-[200]) */}
      {quickEditCategory && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white/98 border border-amber-300/80 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-200 bg-amber-50/70">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-bold text-zinc-900">Edit {quickEditCategory.name}</h3>
              </div>
              <button
                onClick={() => setQuickEditCategory(null)}
                className="text-stone-400 hover:text-zinc-800 p-1 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickEditSave} className="p-5 flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-zinc-800 block mb-1">Category Name</label>
                <input
                  type="text"
                  value={editNameDraft}
                  onChange={(e) => setEditNameDraft(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-sm text-zinc-900 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-800 block mb-1">Monthly Budget Cap ($)</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={editCapDraft}
                    onChange={(e) => setEditCapDraft(e.target.value)}
                    required
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-white border border-stone-300 text-sm text-zinc-900 font-mono focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-800 block mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-stone-500" />
                  <span>Category Color</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColorDraft(c)}
                      className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                        editColorDraft === c ? "scale-125 ring-2 ring-amber-500" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* In-form Reinitialize & Reclassify Toggle (Default OFF) */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200">
                <div className="flex flex-col pr-2">
                  <span className="text-xs font-semibold text-zinc-900">Reinitialize & reclassify with AI</span>
                  <span className="text-[10px] text-stone-500">
                    Reset old rules and re-run Gemini AI over existing transactions
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={editReinitializeDraft}
                    onChange={(e) => setEditReinitializeDraft(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setQuickEditCategory(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Safeguard Modal (portalled to document.body at z-[200]) */}
      {categoryPendingDelete && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white/98 border border-stone-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900">
                  Delete &ldquo;{categoryPendingDelete.name}&rdquo;?
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Are you sure you want to remove this category?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 mb-4">
              Transactions currently marked as <span className="text-zinc-900 font-bold">{categoryPendingDelete.name}</span> will be safely reassigned to <span className="text-amber-800 font-semibold">Uncategorized</span> so no financial history is lost.
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCategoryPendingDelete(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                Keep Category
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                Yes, Delete Category
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
