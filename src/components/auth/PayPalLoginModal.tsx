"use client";

import React, { useState } from "react";
import {
  X,
  LogOut,
  ArrowRight,
  ShieldCheck,
  Building2,
  ExternalLink,
} from "lucide-react";
import { UserAccount } from "@/types/sandboxUser";
import { useTheme } from "@/components/theme/ThemeContext";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const INDUSTRY_OPTIONS = [
  { value: "GENERAL_BUSINESS", label: "General Business / Diverse" },
  { value: "TECH_SAAS", label: "Technology, SaaS & Software" },
  { value: "ECOMMERCE_RETAIL", label: "E-Commerce & Retail" },
  { value: "HOSPITALITY_FOOD", label: "Hospitality, Food & Beverage" },
  { value: "CREATIVE_STUDIO", label: "Creative & Design Studio" },
  { value: "CONSULTING_SERVICES", label: "Consulting & Professional Services" },
  { value: "HEALTHCARE", label: "Healthcare & Clinical Services" },
];

interface PayPalLoginModalProps {
  isOpen: boolean;
  currentUser: UserAccount | null;
  onClose: () => void;
  onLogin?: (user: UserAccount) => void;
  onLogout: () => void;
}

export const PayPalLoginModal: React.FC<PayPalLoginModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onLogin,
  onLogout,
}) => {
  const { isDark, isBlue } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<string>(
    currentUser?.industry || "GENERAL_BUSINESS"
  );
  const [isUpdatingIndustry, setIsUpdatingIndustry] = useState(false);

  if (!isOpen) return null;

  const handleIndustryChange = async (newIndustry: string) => {
    setSelectedIndustry(newIndustry);
    setIsUpdatingIndustry(true);
    try {
      await fetch("/api/auth/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: newIndustry, persona: "BUSINESS" }),
      });
      if (currentUser && onLogin) {
        onLogin({ ...currentUser, industry: newIndustry });
      }
    } catch (err) {
      console.warn("[Industry Update Error]", err);
    } finally {
      setIsUpdatingIndustry(false);
    }
  };

  const handleLogoutAction = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      setIsLoggingOut(false);
      onLogout();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paypal-auth-title"
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border transition-all duration-200 animate-in zoom-in-95 duration-150 flex flex-col relative ${
          isDark
            ? "bg-[#121217] border-zinc-800 text-zinc-100 shadow-black/80"
            : "bg-white/98 border-stone-200 text-zinc-900 shadow-stone-900/15"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Liquid Bar Accent */}
        <div
          className="h-1 w-full"
          style={{
            background: isBlue
              ? "linear-gradient(90deg, #00457c 0%, #0070ba 50%, #38bdf8 100%)"
              : "linear-gradient(90deg, #d97706 0%, #f59e0b 50%, #fde68a 100%)",
          }}
        />

        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b ${
            isDark ? "border-zinc-800/80 bg-zinc-900/40" : "border-stone-100 bg-stone-50/70"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${
                isBlue
                  ? isDark
                    ? "bg-blue-500/15 border-blue-500/30 text-sky-400"
                    : "bg-blue-50 border-blue-200 text-[#0070ba]"
                  : isDark
                  ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
              </svg>
            </div>
            <div>
              <h2 id="paypal-auth-title" className="text-sm font-bold leading-tight">
                {currentUser ? "PayPal Sandbox" : "Log In with PayPal"}
              </h2>
              <span
                className={`text-[10px] font-mono font-medium ${
                  isDark ? "text-zinc-400" : "text-stone-600"
                }`}
              >
                {currentUser ? currentUser.name : "Sandbox Mode"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${
                isDark
                  ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:ring-zinc-600"
                  : "text-stone-400 hover:text-zinc-900 hover:bg-stone-100 focus-visible:ring-amber-400"
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4">
          {currentUser ? (
            /* Authenticated Account Management */
            <div className="flex flex-col gap-3.5">
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-stone-50 border-stone-200"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border ${
                      isBlue
                        ? isDark
                          ? "bg-blue-500/20 border-blue-500/40 text-sky-300"
                          : "bg-blue-100 border-blue-300 text-blue-900"
                        : isDark
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : "bg-amber-100 border-amber-300 text-amber-900"
                    }`}
                  >
                    {currentUser.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{currentUser.name}</p>
                    <p
                      className={`text-[11px] font-mono truncate ${
                        isDark ? "text-zinc-400" : "text-stone-500"
                      }`}
                    >
                      {currentUser.email}
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium shrink-0 ${
                    isBlue
                      ? isDark
                        ? "bg-blue-500/15 border-blue-500/30 text-sky-400"
                        : "bg-blue-50 border-blue-200 text-blue-800"
                      : isDark
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                >
                  {currentUser.persona}
                </span>
              </div>

              {/* Industry Selector */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
                  isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-stone-50/80 border-stone-200"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Building2
                      className={`w-3.5 h-3.5 ${isBlue ? "text-[#0070ba]" : "text-amber-600"}`}
                    />
                    <span>Industry Category</span>
                  </div>
                  {isUpdatingIndustry && (
                    <span className="text-[10px] text-amber-500 animate-pulse font-medium">
                      Saving...
                    </span>
                  )}
                </div>
                <select
                  aria-label="Registered Business Industry"
                  value={selectedIndustry}
                  onChange={(e) => void handleIndustryChange(e.target.value)}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-xs border focus:outline-none cursor-pointer transition-colors ${
                    isDark
                      ? "bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-blue-500"
                      : "bg-white border-stone-300 text-zinc-900 focus:border-amber-500"
                  }`}
                >
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <a
                  href="/api/auth/paypal"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer text-center ${
                    isDark
                      ? "bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
                      : "bg-stone-100 hover:bg-stone-200 border-stone-300 text-zinc-800"
                  }`}
                >
                  <span>Switch Account</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                </a>

                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleLogoutAction}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold border border-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isLoggingOut ? "..." : "Log Out"}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Minimal Unauthenticated View */
            <div className="flex flex-col gap-4">
              <div className="text-center py-1">
                <h3 className="text-base font-bold tracking-tight">Connect with PayPal</h3>
                <p
                  className={`text-xs mt-1 leading-relaxed ${
                    isDark ? "text-zinc-400" : "text-stone-600"
                  }`}
                >
                  Sign in with your PayPal Sandbox account to sync transactions and manage budgets.
                </p>
              </div>

              {/* Primary Theme-Adaptive CTA Button */}
              <a
                href="/api/auth/paypal"
                className={`flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 active:scale-[0.98] shadow-md group ${
                  isBlue
                    ? "bg-[#0070ba] hover:bg-[#005ea6] text-white shadow-blue-600/25 focus-visible:ring-blue-400"
                    : "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 shadow-amber-500/25 focus-visible:ring-amber-400"
                }`}
              >
                <svg
                  className="w-4 h-4 fill-current shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
                </svg>
                <span>Log In with PayPal Sandbox</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>

              {/* Minimal Secondary Action: Explore as Guest */}
              <button
                type="button"
                onClick={onClose}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center ${
                  isDark
                    ? "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60"
                    : "text-stone-600 hover:text-zinc-900 hover:bg-stone-100"
                }`}
              >
                Explore Workspace as Guest
              </button>

              {/* Minimal 1-line Footer */}
              <div
                className={`pt-3 border-t flex items-center justify-between text-[11px] ${
                  isDark ? "border-zinc-800/80 text-zinc-400" : "border-stone-200 text-stone-600"
                }`}
              >
                <span className="flex items-center gap-1">
                  <ShieldCheck
                    className={`w-3.5 h-3.5 ${
                      isBlue ? "text-[#0070ba]" : "text-amber-600"
                    }`}
                  />
                  <span>Zero-risk sandbox mode</span>
                </span>
                <a
                  href="https://developer.paypal.com/dashboard/accounts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 hover:underline ${
                    isBlue ? "text-[#0070ba]" : "text-amber-600"
                  }`}
                >
                  <span>Accounts</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayPalLoginModal;
