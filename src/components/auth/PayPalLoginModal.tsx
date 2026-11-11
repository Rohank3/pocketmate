"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  LogOut,
  ArrowRight,
  ShieldCheck,
  Building2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { UserAccount } from "@/types/sandboxUser";
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

export interface PendingPayPalProfile {
  payerId: string | null;
  userId: string;
  suggestedName?: string;
}

interface PayPalLoginModalProps {
  isOpen: boolean;
  currentUser: UserAccount | null;
  authError?: string | null;
  pendingPayPal?: PendingPayPalProfile | null;
  onCancelPendingPayPal?: () => void;
  onClose: () => void;
  onLogin?: (user: UserAccount) => void;
  onLogout: () => void;
}

export const PayPalLoginModal: React.FC<PayPalLoginModalProps> = ({
  isOpen,
  currentUser,
  authError,
  pendingPayPal,
  onCancelPendingPayPal,
  onClose,
  onLogin,
  onLogout,
}) => {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<string>(
    currentUser?.industry || "GENERAL_BUSINESS"
  );
  const [isUpdatingIndustry, setIsUpdatingIndustry] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);

  const resolvedNameInput = nameOverride ?? pendingPayPal?.suggestedName ?? "";

  useEffect(() => {
    if (!isOpen || !currentUser) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, currentUser, onClose]);

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

  const handleCompletePayPalProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) || trimmedEmail === "user@sandbox.paypal.com") {
      setFormError("Enter the valid PayPal Sandbox email address you signed in with.");
      return;
    }

    setFormError(null);
    setIsSubmittingProfile(true);
    try {
      const res = await fetch("/api/auth/paypal/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          name: resolvedNameInput.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { user?: UserAccount; error?: string };
      if (!res.ok || !data.user) {
        setFormError(data.error || "Unable to verify email binding. Please try again.");
        return;
      }
      onLogin?.(data.user);
    } catch {
      setFormError("Network error while completing PayPal profile setup.");
    } finally {
      setIsSubmittingProfile(false);
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
      className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (currentUser) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border theme-modal transition-all duration-200 animate-in zoom-in-95 flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Liquid Bar Accent */}
        <div className="liquid-bar w-full" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b theme-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
              </svg>
            </div>
            <div>
              <h2 id="paypal-auth-title" className="text-sm font-bold leading-tight text-[var(--fg-primary)]">
                {currentUser ? "PayPal Sandbox" : "PayPal Login"}
              </h2>
              <span className="text-[10px] font-mono font-medium text-[var(--fg-muted)]">
                {currentUser ? currentUser.name : "Sandbox Mode"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {currentUser && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1.5 rounded-lg transition-colors cursor-pointer text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4">
          {currentUser ? (
            /* Authenticated Account Management */
            <div className="flex flex-col gap-3.5">
              <div className="p-3.5 rounded-xl border theme-card-inset flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)]">
                    {currentUser.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate text-[var(--fg-primary)]">{currentUser.name}</p>
                    <p className="text-[11px] font-mono truncate text-[var(--fg-muted)]">
                      {currentUser.email}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium shrink-0 bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-text)]">
                  {currentUser.persona}
                </span>
              </div>

              {/* Industry Selector */}
              <div className="p-3 rounded-xl border theme-card-inset flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--fg-primary)]">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                    <span>Industry</span>
                  </div>
                  {isUpdatingIndustry && (
                    <span className="text-[10px] text-[var(--accent-text)] animate-pulse font-medium">
                      Saving...
                    </span>
                  )}
                </div>
                <select
                  aria-label="Registered Business Industry"
                  value={selectedIndustry}
                  onChange={(e) => void handleIndustryChange(e.target.value)}
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs border bg-[var(--surface-card)] border-[var(--border-strong)] text-[var(--fg-primary)] focus:outline-none focus:border-[#0070ba] cursor-pointer transition-colors"
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
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold border theme-btn-secondary transition-colors cursor-pointer text-center"
                >
                  <span>Switch Account</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                </a>

                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleLogoutAction}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-[var(--status-danger-bg)] hover:brightness-105 text-[var(--status-danger-text)] text-xs font-semibold border border-[var(--status-danger-border)] transition-all cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isLoggingOut ? "..." : "Log Out"}</span>
                </button>
              </div>
            </div>
          ) : pendingPayPal ? (
            /* One-time Email Binding when PayPal Platform App verifies ID but omits email claim */
            <form onSubmit={handleCompletePayPalProfile} className="flex flex-col gap-3.5" noValidate>
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0">
                  <p className="font-semibold">PayPal Account Authenticated</p>
                  <p className="text-[11px] opacity-90 mt-0.5 break-all">
                    Verified PayPal ID:{" "}
                    <span className="font-mono font-semibold">
                      {pendingPayPal.payerId || pendingPayPal.userId.slice(-16)}
                    </span>
                  </p>
                </div>
              </div>

              <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">
                PayPal Sandbox verified your account, but this Platform app omitted your email from{" "}
                <code className="text-[11px] font-mono">/userinfo</code>. Confirm your Sandbox email once so PocketMate remembers it for all future PayPal logins.
              </p>

              {(formError || authError) && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-300"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500 dark:text-rose-400" />
                  <span>{formError || authError}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="paypal-confirm-email"
                  className="text-xs font-semibold text-[var(--fg-primary)]"
                >
                  PayPal Sandbox Email
                </label>
                <input
                  id="paypal-confirm-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="ethan.carter.pm@business.example.com"
                  className="w-full rounded-xl px-3 py-2 text-xs border bg-[var(--surface-card)] border-[var(--border-strong)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="paypal-confirm-name"
                  className="text-xs font-semibold text-[var(--fg-primary)]"
                >
                  Display Name <span className="font-normal text-[var(--fg-muted)]">(optional)</span>
                </label>
                <input
                  id="paypal-confirm-name"
                  type="text"
                  autoComplete="name"
                  value={resolvedNameInput}
                  onChange={(e) => setNameOverride(e.target.value)}
                  placeholder="Ethan Carter"
                  className="w-full rounded-xl px-3 py-2 text-xs border bg-[var(--surface-card)] border-[var(--border-strong)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingProfile}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer theme-btn-primary hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              >
                {isSubmittingProfile ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Linking Account...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm &amp; Continue</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              {onCancelPendingPayPal && (
                <button
                  type="button"
                  disabled={isSubmittingProfile}
                  onClick={onCancelPendingPayPal}
                  className="w-full py-2 px-3 rounded-xl text-xs font-medium border theme-btn-secondary hover:bg-[var(--surface-subtle)] active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
                >
                  Start over with a different PayPal account
                </button>
              )}
            </form>
          ) : (
            /* Minimal Unauthenticated View */
            <div className="flex flex-col gap-3.5">
              <div className="text-center py-1">
                <h3 className="text-base font-bold tracking-tight text-[var(--fg-primary)]">
                  Connect PayPal
                </h3>
                <p className="text-xs mt-1 text-[var(--fg-muted)]">
                  Sign in with your Sandbox account.
                </p>
              </div>

              {authError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-300 leading-relaxed"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500 dark:text-rose-400" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Primary CTA Button */}
              <a
                href="/api/auth/paypal"
                className="flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer theme-btn-primary active:scale-[0.98] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              >
                <svg
                  className="w-4 h-4 fill-current shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
                </svg>
                <span>Log In with PayPal</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>

              {/* Minimal 1-line Footer */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--fg-muted)]">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                  <span>Sandbox mode</span>
                </span>
                <a
                  href="https://developer.paypal.com/dashboard/accounts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline text-[var(--accent-text)]"
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
