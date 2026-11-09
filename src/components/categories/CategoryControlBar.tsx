"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Settings2,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  X,
  Tag,
  MoreVertical,
  Edit2,
  Trash2,
  Palette,
} from "lucide-react";
import { TransactionRow } from "@/components/grid/TransactionGrid";

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

export const PRESET_COLORS = [
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#f43f5e", // Rose
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#eab308", // Yellow
];

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
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

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
    <div className="bg-white/[0.035] backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_24px_-8px_rgba(0,0,0,0.5)] flex flex-col gap-2.5">
      {/* Top Bar: Roundabout Carousel + Budget Cap Meter + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Roundabout Category Navigator */}
        <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{
              backgroundColor: activeCategoryObj ? activeCategoryObj.color : "#3b82f6",
            }}
          />

          <span className="text-xs font-semibold text-zinc-100 min-w-[75px]">
            {selectedCategory.toLowerCase() === "all" ? "All Categories" : selectedCategory}
          </span>

          <div className="flex items-center gap-1 ml-1.5 border-l border-zinc-800 pl-1.5">
            <button
              onClick={handlePrevRoundabout}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer transition-colors"
              title="Previous category"
              aria-label="Previous category"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono text-[11px] text-zinc-300 px-1 font-medium select-none">
              {currentIndex + 1} / {totalOptions}
            </span>

            <button
              onClick={handleNextRoundabout}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer transition-colors"
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
            <span className="text-zinc-400">Spent:</span>
            <span className="font-semibold text-zinc-100">${activeStats.spent.toFixed(2)}</span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-400">${activeStats.cap.toFixed(2)} Cap</span>
          </div>

          {activeCategoryObj && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                isOverCap
                  ? "bg-rose-500/15 text-rose-300 border-rose-500/25"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isOverCap ? "bg-rose-400" : "bg-emerald-400"}`} />
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.98] text-white text-xs font-semibold cursor-pointer border border-white/15 backdrop-blur-md shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-white/30"
            title="Manage, rename, add, and set budget caps"
          >
            <Settings2 className="w-3.5 h-3.5" />
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
                    ? "bg-white/15 text-white border-white/25 shadow-sm backdrop-blur-md"
                    : "bg-white/[0.03] text-zinc-300 border-white/8 hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {!isAll && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: catObj?.color || "#3b82f6" }}
                  />
                )}
                <span>{optName}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? "bg-white/15 text-white"
                      : catOverCap
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "bg-white/5 text-zinc-400"
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
                    className={`ml-0.5 p-0.5 rounded hover:bg-black/30 transition-opacity cursor-pointer ${
                      isSelected ? "text-blue-200 hover:text-white" : "text-zinc-400 hover:text-zinc-200"
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
                  className="absolute left-0 top-full mt-1.5 z-40 w-44 rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl py-1 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 border-b border-zinc-800 uppercase tracking-wider">
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-left text-zinc-200 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Rename & Edit Cap</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryPendingDelete(catObj);
                      setActiveMenuCatId(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-500/10 text-left text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Delete Category</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Bar for Selected Category */}
      <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden border border-zinc-800/60">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isOverCap ? "bg-rose-500" : percentUsed > 80 ? "bg-amber-400" : "bg-emerald-400"
          }`}
          style={{ width: `${percentUsed}%` }}
        />
      </div>

      {/* Comprehensive Manage Categories & Add Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/90">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Category & Budget Cap Manager</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div className="flex border-b border-zinc-800 bg-zinc-950 px-5 pt-2">
              <button
                onClick={() => setModalTab("manage")}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                  modalTab === "manage"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Manage & Rename Categories ({categories.length})
              </button>
              <button
                onClick={() => setModalTab("add")}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                  modalTab === "add"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                + Add New Category
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5">
              {modalTab === "manage" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-zinc-400">
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
                            className="p-3 rounded-xl bg-zinc-950 border border-blue-500/50 flex flex-col gap-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-blue-400">Edit Category</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(cat.id)}
                                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCategoryId(null)}
                                  className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:text-white text-xs cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-zinc-400 block mb-1">Name</label>
                                <input
                                  type="text"
                                  value={editNameDraft}
                                  onChange={(e) => setEditNameDraft(e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 focus:outline-hidden focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-zinc-400 block mb-1">Monthly Cap ($)</label>
                                <input
                                  type="number"
                                  min="10"
                                  step="10"
                                  value={editCapDraft}
                                  onChange={(e) => setEditCapDraft(e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-blue-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] text-zinc-400 block mb-1">Badge Color</label>
                              <div className="flex items-center gap-1.5">
                                {PRESET_COLORS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setEditColorDraft(c)}
                                    className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                                      editColorDraft === c ? "scale-125 ring-2 ring-white" : "hover:scale-110"
                                    }`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            </div>

                            {/* In-form Reinitialize & Reclassify Toggle (Default OFF) */}
                            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/80 border border-zinc-800">
                              <div className="flex flex-col pr-2">
                                <span className="text-[11px] font-medium text-zinc-200">Reinitialize & reclassify with AI</span>
                                <span className="text-[10px] text-zinc-400 leading-tight">
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
                                <div className="w-8 h-4.5 bg-zinc-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                              </label>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700/80 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <div>
                              <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                                {cat.name}
                                {isOver && (
                                  <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1 rounded">
                                    Over Cap
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-zinc-500 font-mono">
                                Spent: ${stat.spent.toFixed(2)} / ${cat.monthlyCap.toFixed(0)} ({stat.count} tx)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartInlineEdit(cat)}
                              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                              title={`Rename or edit ${cat.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setCategoryPendingDelete(cat)}
                              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title={`Delete ${cat.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-400">
                    <span>{categories.length} active categories</span>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateCategory} className="flex flex-col gap-3.5">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Category Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Health & Fitness, Utilities, Travel"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Monthly Budget Cap ($)
                    </label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-zinc-500" />
                      <input
                        type="number"
                        min="10"
                        step="10"
                        placeholder="300"
                        value={newCap}
                        onChange={(e) => setNewCap(e.target.value)}
                        required
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Badge Color
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewColor(c)}
                          className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                            newColor === c ? "scale-125 ring-2 ring-white" : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-md"
                    >
                      Save Category
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Edit Single Category Modal (triggered from pill context menu) */}
      {quickEditCategory && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/90">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Edit {quickEditCategory.name}</h3>
              </div>
              <button
                onClick={() => setQuickEditCategory(null)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickEditSave} className="p-5 flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Category Name</label>
                <input
                  type="text"
                  value={editNameDraft}
                  onChange={(e) => setEditNameDraft(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Monthly Budget Cap ($)</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-zinc-500" />
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={editCapDraft}
                    onChange={(e) => setEditCapDraft(e.target.value)}
                    required
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-mono focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Category Color</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColorDraft(c)}
                      className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                        editColorDraft === c ? "scale-125 ring-2 ring-white" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* In-form Reinitialize & Reclassify Toggle (Default OFF) */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <div className="flex flex-col pr-2">
                  <span className="text-xs font-medium text-zinc-200">Reinitialize & reclassify with AI</span>
                  <span className="text-[10px] text-zinc-400">
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
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setQuickEditCategory(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Safeguard Modal */}
      {categoryPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Delete &ldquo;{categoryPendingDelete.name}&rdquo;?
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Are you sure you want to remove this category?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 mb-4">
              Transactions currently marked as <span className="text-zinc-200 font-semibold">{categoryPendingDelete.name}</span> will be safely reassigned to <span className="text-blue-400 font-medium">Uncategorized</span> so no financial history is lost.
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCategoryPendingDelete(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 cursor-pointer"
              >
                Keep Category
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shadow-md shadow-rose-600/20"
              >
                Yes, Delete Category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
