"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings2,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  X,
  Tag,
} from "lucide-react";
import { TransactionRow } from "@/components/grid/TransactionGrid";

export interface CategoryItem {
  id: string;
  name: string;
  monthlyCap: number;
  color: string;
  isCustom?: boolean;
}

interface CategoryControlBarProps {
  categories: CategoryItem[];
  selectedCategory: string; // "all" or specific category name
  transactions: TransactionRow[];
  onSelectCategory: (categoryName: string) => void;
  onAddCategory: (category: Omit<CategoryItem, "id">) => void;
  onEditCategory: (categoryId: string, updatedCap: number, updatedName?: string) => void;
  onDeleteCategory?: (categoryId: string) => void;
}

const PRESET_COLORS = [
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#f43f5e", // Rose
  "#6366f1", // Indigo
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
  const [modalTab, setModalTab] = useState<"add" | "edit">("add");

  // Form states for adding category
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("300");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  // Editable caps copy
  const [capsDraft, setCapsDraft] = useState<Record<string, number>>(() =>
    categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.monthlyCap }), {})
  );

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

      // Match exact category name or partial (e.g. Dining vs Dining & Social)
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

  // Roundabout carousel: loops from N back to 1, and 1 back to N
  const handlePrevRoundabout = () => {
    const prevIdx = (currentIndex - 1 + totalOptions) % totalOptions;
    onSelectCategory(options[prevIdx]);
  };

  const handleNextRoundabout = () => {
    const nextIdx = (currentIndex + 1) % totalOptions;
    onSelectCategory(options[nextIdx]);
  };

  // Get active item details
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
    const capNum = parseFloat(newCap) || 200;
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

  const handleSaveCaps = () => {
    for (const [id, cap] of Object.entries(capsDraft)) {
      onEditCategory(id, cap);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 shadow-lg flex flex-col gap-2.5">
      {/* Top Bar: Roundabout Carousel + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Roundabout Category Navigator (Image 2 style with infinite wrap-around) */}
        <div className="flex items-center gap-2.5 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
          <span
            className="w-3.5 h-3.5 rounded-sm shrink-0"
            style={{
              backgroundColor: activeCategoryObj ? activeCategoryObj.color : "#3b82f6",
            }}
          />

          <span className="text-xs font-semibold text-zinc-100 min-w-[70px]">
            {selectedCategory.toLowerCase() === "all" ? "All Categories" : selectedCategory}
          </span>

          {/* Looping Roundabout Controls */}
          <div className="flex items-center gap-1.5 ml-2 border-l border-zinc-800 pl-2">
            <button
              onClick={handlePrevRoundabout}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer transition-colors"
              title="Previous category (loops around)"
              aria-label="Previous category"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono text-xs text-zinc-300 px-1 font-medium select-none">
              {currentIndex + 1} / {totalOptions}
            </span>

            <button
              onClick={handleNextRoundabout}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer transition-colors"
              title="Next category (loops around)"
              aria-label="Next category"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Budget Cap Indicator */}
        <div className="hidden sm:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-zinc-400">Spent:</span>
            <span className="font-semibold text-zinc-100">${activeStats.spent.toFixed(2)}</span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-400">${activeStats.cap.toFixed(2)} Cap</span>
          </div>

          {activeCategoryObj && (
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                isOverCap
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}
            >
              {isOverCap ? (
                <>
                  <AlertTriangle className="w-3 h-3" />
                  <span>+${(activeStats.spent - activeStats.cap).toFixed(2)} Over</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>${(activeStats.cap - activeStats.spent).toFixed(2)} Remaining</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Manage Categories Button */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => {
              setModalTab("add");
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Category</span>
          </button>

          <button
            onClick={() => {
              setCapsDraft(
                categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.monthlyCap }), {})
              );
              setModalTab("edit");
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer transition-all"
            title="Adjust budget caps"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Edit Caps</span>
          </button>
        </div>
      </div>

      {/* Category Pills (Direct 1-Click Interactive Filtering) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
        {options.map((optName) => {
          const isSelected = selectedCategory.toLowerCase() === optName.toLowerCase();
          const isAll = optName.toLowerCase() === "all";
          const catObj = isAll ? null : categories.find((c) => c.name.toLowerCase() === optName.toLowerCase());
          const stat = isAll
            ? { spent: categoryStats.totalSpent, count: categoryStats.totalCount }
            : categoryStats.byCategory[optName.toLowerCase()] || { spent: 0, count: 0 };
          const catOverCap = catObj ? stat.spent > catObj.monthlyCap : false;

          return (
            <button
              key={optName}
              onClick={() => onSelectCategory(optName)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer border ${
                isSelected
                  ? "bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-500/20"
                  : "bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-zinc-100"
              }`}
            >
              {!isAll && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: catObj?.color || "#3b82f6" }}
                />
              )}
              <span>{optName}</span>
              <span
                className={`text-[10px] font-mono px-1 rounded ${
                  isSelected
                    ? "bg-blue-800 text-blue-100"
                    : catOverCap
                    ? "bg-rose-950/80 text-rose-300 border border-rose-800/40"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                ${stat.spent.toFixed(0)}
                {catOverCap && " ⚠️"}
              </span>
            </button>
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

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/80">
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
                onClick={() => setModalTab("add")}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                  modalTab === "add"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Add New Category
              </button>
              <button
                onClick={() => setModalTab("edit")}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                  modalTab === "edit"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Edit Monthly Budget Caps
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5">
              {modalTab === "add" ? (
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
                    <div className="flex items-center gap-2">
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
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-zinc-400 mb-1">
                    Adjust your monthly spending ceilings. Changing these values immediately updates all charts, ledgers, and breach alerts.
                  </p>

                  <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                    {categories.map((cat) => {
                      const stat = categoryStats.byCategory[cat.name.toLowerCase()] || { spent: 0, count: 0 };
                      const draftVal = capsDraft[cat.id] ?? cat.monthlyCap;
                      const isDraftOver = stat.spent > draftVal;

                      return (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <div>
                              <p className="text-xs font-semibold text-zinc-200">{cat.name}</p>
                              <p className="text-[11px] text-zinc-500">
                                Spent: ${stat.spent.toFixed(2)} ({stat.count} tx)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative w-24">
                              <span className="absolute left-2 top-1.5 text-xs text-zinc-500 font-mono">$</span>
                              <input
                                type="number"
                                min="0"
                                step="25"
                                value={draftVal}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCapsDraft((prev) => ({ ...prev, [cat.id]: val }));
                                }}
                                className={`w-full pl-5 pr-2 py-1 rounded bg-zinc-900 border text-xs text-right font-mono text-zinc-100 ${
                                  isDraftOver ? "border-rose-500/60" : "border-zinc-700"
                                }`}
                              />
                            </div>

                            {cat.isCustom && onDeleteCategory && (
                              <button
                                type="button"
                                onClick={() => onDeleteCategory(cat.id)}
                                className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer"
                                title="Delete custom category"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                      type="button"
                      onClick={handleSaveCaps}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-md"
                    >
                      Apply Updated Caps
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
