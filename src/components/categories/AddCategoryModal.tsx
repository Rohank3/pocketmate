"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { DollarSign, Loader2, Tag, X } from "lucide-react";
import { DISTINCT_CATEGORY_PALETTE } from "@/lib/utils/categoryColors";
import type { CategoryItem } from "./CategoryControlBar";

interface AddCategoryModalProps {
  isOpen: boolean;
  initialName?: string;
  existingCategories: CategoryItem[];
  onSaveCategory: (category: Omit<CategoryItem, "id">) => Promise<CategoryItem | null>;
  onCreated: (createdCategory: CategoryItem) => void;
  onCancel: () => void;
}

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  isOpen,
  initialName = "",
  existingCategories,
  onSaveCategory,
  onCreated,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const nameInputId = useId();
  const capInputId = useId();

  const nextAvailableColor = useMemo(() => {
    const used = new Set(existingCategories.map((c) => c.color?.toLowerCase()));
    return DISTINCT_CATEGORY_PALETTE.find((c) => !used.has(c.toLowerCase())) || DISTINCT_CATEGORY_PALETTE[0];
  }, [existingCategories]);

  const [prevInitialName, setPrevInitialName] = useState(initialName);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [name, setName] = useState(initialName);
  const [monthlyCap, setMonthlyCap] = useState("300");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pressedOutsideRef = useRef(false);

  if (isOpen !== prevIsOpen || (isOpen && initialName !== prevInitialName)) {
    setPrevIsOpen(isOpen);
    setPrevInitialName(initialName);
    if (isOpen) {
      setName(initialName);
      setMonthlyCap("300");
      setSelectedColor(null);
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }

  const activeColor = selectedColor || nextAvailableColor;

  // Sync native <dialog> top-layer open/close state with isOpen prop
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleCloseCancel = () => {
    if (isSubmitting) return;
    onCancel();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg("Category name is required.");
      return;
    }

    const parsedCap = Number.parseFloat(monthlyCap);
    if (!Number.isFinite(parsedCap) || parsedCap < 0) {
      setErrorMsg("Enter a valid non-negative monthly cap.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const created = await onSaveCategory({
        name: trimmedName,
        monthlyCap: parsedCap,
        color: activeColor,
        isCustom: true,
      });

      if (created) {
        onCreated(created);
      } else {
        setErrorMsg("Failed to create category. Please try again.");
      }
    } catch {
      setErrorMsg("Failed to create category. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOutsideDialog = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        handleCloseCancel();
      }}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = "";
        }
      }}
      onPointerDown={(e) => {
        if (dialogRef.current) {
          pressedOutsideRef.current = isOutsideDialog(e, dialogRef.current);
        }
      }}
      onPointerUp={(e) => {
        if (
          dialogRef.current &&
          pressedOutsideRef.current &&
          isOutsideDialog(e, dialogRef.current)
        ) {
          handleCloseCancel();
        }
        pressedOutsideRef.current = false;
      }}
      className="m-auto w-full max-w-md rounded-2xl border p-0 theme-modal shadow-2xl overflow-hidden bg-transparent"
    >
      <div className="theme-modal w-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b theme-modal-header">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[var(--accent-text)]" />
            <h3 id={titleId} className="text-sm font-bold text-[var(--fg-primary)]">
              Add Category
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCloseCancel}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-1 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          <div>
            <label htmlFor={nameInputId} className="text-xs font-semibold text-[var(--fg-primary)] block mb-1">
              Name
            </label>
            <input
              id={nameInputId}
              name="categoryName"
              type="text"
              placeholder="e.g. Fitness, Travel, Utilities"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              required
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[#0070ba]"
            />
          </div>

          <div>
            <label htmlFor={capInputId} className="text-xs font-semibold text-[var(--fg-primary)] block mb-1">
              Monthly Cap ($)
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-[var(--fg-muted)]" />
              <input
                id={capInputId}
                name="monthlyCap"
                type="number"
                min="0"
                step="10"
                max="1000000"
                placeholder="300"
                value={monthlyCap}
                onChange={(e) => setMonthlyCap(e.target.value)}
                required
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[#0070ba]"
              />
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-[var(--fg-primary)] block mb-1.5">
              Color
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {DISTINCT_CATEGORY_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  aria-label={`Select color ${c}`}
                  className={`w-6 h-6 rounded-full cursor-pointer transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba] ${
                    activeColor === c ? "scale-125 ring-2 ring-[#0070ba]" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-[var(--status-danger-text)] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={handleCloseCancel}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg theme-btn-primary text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? "Saving..." : "Save Category"}</span>
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
