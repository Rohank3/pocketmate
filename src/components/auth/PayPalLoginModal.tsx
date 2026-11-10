"use client";

import React, { useState } from "react";
import {
  X,
  LogOut,
  ExternalLink,
  HelpCircle,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Lock,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { UserAccount } from "@/types/sandboxUser";

const INDUSTRY_OPTIONS = [
  { value: "GENERAL_BUSINESS", label: "General Business / Diverse" },
  { value: "TECH_SAAS", label: "Technology, SaaS & Software" },
  { value: "ECOMMERCE_RETAIL", label: "E-Commerce & Retail" },
  { value: "HOSPITALITY_FOOD", label: "Hospitality, Food & Beverage" },
  { value: "CREATIVE_STUDIO", label: "Creative, Media & Design Studio" },
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
  const [showOAuthHelp, setShowOAuthHelp] = useState(false);
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
      // Proceed with client cleanup
    } finally {
      setIsLoggingOut(false);
      onLogout();
    }
  };

  // If unauthenticated, modal cannot be dismissed (persistent blocking overlay)
  const isBlocking = !currentUser;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paypal-auth-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={isBlocking ? undefined : onClose}
    >
      <div
        className="glass-dropdown rounded-2xl w-full max-w-md overflow-hidden shadow-[0_24px_64px_-12px_rgba(0,0,0,0.9),0_0_40px_rgba(245,158,11,0.12)] border border-amber-500/30 animate-in zoom-in-95 duration-150 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-950/85 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/25 via-yellow-500/15 to-amber-950/40 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0 shadow-inner">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
              </svg>
            </div>
            <div>
              <h2 id="paypal-auth-title" className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                {currentUser ? "PayPal Sandbox Account" : "Log In with PayPal"}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 font-mono">
                  Sandbox Active
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                {currentUser
                  ? `Signed in as ${currentUser.name}`
                  : "Official OAuth 2.0 OpenID Connect Authentication"}
              </p>
            </div>
          </div>
          {!isBlocking && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-white/10 active:bg-white/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {currentUser ? (
            /* Currently Authenticated State */
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-amber-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center font-bold text-xs text-amber-300 shrink-0 shadow-inner">
                    {currentUser.avatar}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-zinc-100 truncate">{currentUser.name}</p>
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono truncate">{currentUser.email}</p>
                  </div>
                </div>

                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">
                  {currentUser.persona}
                </span>
              </div>

              {/* Registered Business Industry Selection */}
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Registered Business Industry</span>
                  </div>
                  {isUpdatingIndustry && (
                    <span className="text-[10px] text-amber-400 animate-pulse">Saving...</span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400">
                  PocketMate aligns automated categorization directly with your industry&apos;s chart of accounts.
                </p>
                <select
                  aria-label="Registered Business Industry"
                  value={selectedIndustry}
                  onChange={(e) => void handleIndustryChange(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                >
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-zinc-800">
                <a
                  href="/api/auth/paypal"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                >
                  <span>Switch PayPal Account</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-70" />
                </a>

                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleLogoutAction}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 active:bg-rose-950 text-rose-300 hover:text-rose-200 text-xs font-semibold border border-rose-800/40 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isLoggingOut ? "Signing out..." : "Log Out"}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Unauthenticated Blocking State */
            <div className="flex flex-col gap-4">
              {/* Notice Banner */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0 mt-0.5">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100">Zero Credential Exposure</h3>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Authenticate securely directly on PayPal&apos;s verified login portal. Your password, 2FA codes,
                      and payment cards are handled exclusively by PayPal.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-zinc-400 pt-2 border-t border-white/10">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Authenticated via OpenID Connect (OIDC) &amp; PKCE</span>
                </div>
              </div>

              {/* Primary Executive Champagne Gold OAuth Button */}
              <a
                href="/api/auth/paypal"
                className="flex items-center justify-center gap-2.5 w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 active:scale-[0.98] text-zinc-950 text-xs font-bold shadow-lg shadow-amber-500/25 border border-amber-400/40 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400 group"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
                </svg>
                <span>Log In with PayPal Sandbox</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>

              {/* Sandbox Developer Guidance */}
              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs flex flex-col gap-2.5">
                <div className="flex items-start gap-2.5">
                  <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-zinc-100">PayPal Developer Sandbox Accounts</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                      Log in with any personal or business sandbox account provisioned in your PayPal Developer Dashboard.
                      Sandbox accounts hold virtual balances ($5,000 USD) with zero real-currency exposure.
                    </p>
                  </div>
                </div>

                <a
                  href="https://developer.paypal.com/dashboard/accounts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 hover:text-amber-300 active:text-amber-500 transition-colors self-start ml-6.5 cursor-pointer focus-visible:outline-hidden focus-visible:underline"
                >
                  <span>Manage Sandbox Accounts in PayPal Dashboard</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <div className="border-t border-amber-500/15 pt-2 ml-6.5">
                  <button
                    type="button"
                    onClick={() => setShowOAuthHelp(!showOAuthHelp)}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 active:text-zinc-100 flex items-center gap-1 cursor-pointer transition-colors focus-visible:outline-hidden"
                  >
                    <span>{showOAuthHelp ? "Hide Return URL Setup" : "Return URL Configuration Guide"}</span>
                    <HelpCircle className="w-3 h-3 text-amber-400/80" />
                  </button>

                  {showOAuthHelp && (
                    <div className="mt-2.5 p-3 rounded-lg bg-black/50 border border-amber-500/25 text-[11px] text-zinc-300 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>App Features &amp; Return URL:</span>
                      </div>
                      <p className="text-zinc-400">
                        In your PayPal Developer Dashboard &gt; Apps &amp; Credentials &gt; your Sandbox App:
                      </p>
                      <p className="text-zinc-300">
                        1. Enable <strong>Log in with PayPal</strong> in App Features.
                      </p>
                      <p className="text-zinc-300">
                        2. Add Return URL:{" "}
                        <code className="bg-zinc-950 px-1.5 py-0.5 rounded text-amber-300 font-mono text-[10px] break-all border border-amber-500/30">
                          http://localhost:3000/api/auth/callback/paypal
                        </code>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-zinc-950/80 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-500 backdrop-blur-md">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            PayPal Sandbox OAuth 2.0
          </span>
          <span className="flex items-center gap-1 text-amber-400 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Zero Risk
          </span>
        </div>
      </div>
    </div>
  );
};
