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
  Users,
  Loader2,
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

export const SANDBOX_PRESET_USERS = [
  {
    name: "Dave Chen",
    email: "dave.chen.pm@personal.example.com",
    role: "Host / Organizer",
    tag: "Primary User",
    avatar: "DC",
    color: "from-blue-600 to-indigo-600",
  },
  {
    name: "Mark Spencer",
    email: "mark.spencer.pm@personal.example.com",
    role: "Friend / Debtor",
    tag: "$140 Split Due",
    avatar: "MS",
    color: "from-amber-600 to-orange-600",
  },
  {
    name: "Leo Vance",
    email: "leo.vance.pm@personal.example.com",
    role: "Friend / Debtor",
    tag: "$60 Split Due",
    avatar: "LV",
    color: "from-purple-600 to-pink-600",
  },
  {
    name: "Oliver Wright",
    email: "oliver.wright.us@personal.example.com",
    role: "Friend / Debtor",
    tag: "$140 Split Due",
    avatar: "OW",
    color: "from-emerald-600 to-teal-600",
  },
  {
    name: "Sofia Martinez",
    email: "sofia.martinez.food@personal.example.com",
    role: "Friend / Debtor",
    tag: "Shared Groceries",
    avatar: "SM",
    color: "from-rose-600 to-red-600",
  },
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
  const [signingInEmail, setSigningInEmail] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSandboxQuickLogin = async (preset: (typeof SANDBOX_PRESET_USERS)[0]) => {
    setSigningInEmail(preset.email);
    try {
      const res = await fetch("/api/auth/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: preset.email,
          name: preset.name,
          persona: "GENERAL",
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        onLogin?.(data.user);
        onClose();
      }
    } catch (err) {
      console.error("[Sandbox Login Error]", err);
    } finally {
      setSigningInEmail(null);
    }
  };

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
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0070ba]/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
              </svg>
            </div>
            <div>
              <h2 id="paypal-auth-title" className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                {currentUser ? "PayPal Sandbox Account" : "Sign In to PocketMate"}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Sandbox Active
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                {currentUser
                  ? `Signed in as ${currentUser.name}`
                  : "Select an active sandbox profile or log in with PayPal OAuth"}
              </p>
            </div>
          </div>
          {!isBlocking && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 active:bg-zinc-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer transition-colors"
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
              <div className="p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center font-bold text-xs text-blue-300 shrink-0">
                    {currentUser.avatar}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-zinc-100 truncate">{currentUser.name}</p>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono truncate">{currentUser.email}</p>
                  </div>
                </div>

                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 shrink-0">
                  {currentUser.persona}
                </span>
              </div>

              {/* Registered Business Industry Selection */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Registered Business Industry</span>
                  </div>
                  {isUpdatingIndustry && (
                    <span className="text-[10px] text-blue-400 animate-pulse">Saving...</span>
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

              {/* Quick Switch Profiles */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>Switch Sandbox Counterparty Profile</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SANDBOX_PRESET_USERS.filter((p) => p.email !== currentUser.email).map((preset) => (
                    <button
                      key={preset.email}
                      type="button"
                      disabled={signingInEmail !== null}
                      onClick={() => void handleSandboxQuickLogin(preset)}
                      className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-800/60 active:bg-zinc-800 text-left transition-all flex items-center justify-between gap-2.5 cursor-pointer disabled:opacity-50 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg bg-gradient-to-br ${preset.color} flex items-center justify-center font-bold text-[10px] text-white shrink-0 shadow-xs`}
                        >
                          {preset.avatar}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-200 truncate group-hover:text-blue-300 transition-colors">
                            {preset.name}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate">{preset.role}</p>
                        </div>
                      </div>
                      {signingInEmail === preset.email ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-blue-400 transition-colors shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-zinc-800">
                <a
                  href="/api/auth/paypal"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                >
                  <span>PayPal OAuth Login</span>
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
              <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/30 flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 shrink-0 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <p className="font-semibold text-zinc-100">Sign in required to access PocketMate</p>
                  <p className="text-zinc-400 text-[11px] mt-0.5 leading-relaxed">
                    Select a Sandbox profile below to immediately test the bill-splitting &amp; debtor tracking
                    flow, or authenticate directly with your PayPal account.
                  </p>
                </div>
              </div>

              {/* 1-Click Sandbox User Quick Login */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    <span>1-Click Sandbox Profiles</span>
                  </p>
                  <span className="text-[10px] font-mono text-zinc-400">Authentic Session</span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {SANDBOX_PRESET_USERS.map((preset) => (
                    <button
                      key={preset.email}
                      type="button"
                      disabled={signingInEmail !== null}
                      onClick={() => void handleSandboxQuickLogin(preset)}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-blue-500/60 hover:bg-zinc-850 active:bg-zinc-800 text-left transition-all flex items-center justify-between gap-3 cursor-pointer disabled:opacity-50 group shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl bg-gradient-to-br ${preset.color} flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm`}
                        >
                          {preset.avatar}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-zinc-100 group-hover:text-blue-300 transition-colors truncate">
                              {preset.name}
                            </p>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                              {preset.tag}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 font-mono truncate">{preset.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {signingInEmail === preset.email ? (
                          <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Signing in...</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 group-hover:text-blue-400 transition-colors">
                            <span>Sign In</span>
                            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-mono">
                  <span className="bg-zinc-900 px-2 text-zinc-500">or official OAuth</span>
                </div>
              </div>

              {/* Primary OAuth Button */}
              <a
                href="/api/auth/paypal"
                className="flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-xl bg-[#0070ba] hover:bg-[#005ea6] active:bg-[#004c87] text-white text-xs font-bold shadow-lg shadow-blue-600/20 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 group"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
                </svg>
                <span>Log In with Official PayPal OAuth</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>

              {/* OAuth Help Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowOAuthHelp(!showOAuthHelp)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 active:text-zinc-100 flex items-center gap-1 cursor-pointer transition-colors focus-visible:outline-hidden mx-auto"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-blue-400/80" />
                  <span>{showOAuthHelp ? "Hide Return URL Setup" : "Return URL Configuration Guide"}</span>
                </button>

                {showOAuthHelp && (
                  <div className="mt-2.5 p-3 rounded-lg bg-black/40 border border-blue-500/20 text-[11px] text-zinc-300 flex flex-col gap-1.5">
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
                      <code className="bg-zinc-950 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[10px] break-all border border-zinc-800">
                        http://localhost:3000/api/auth/callback/paypal
                      </code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            PayPal Sandbox OAuth 2.0 &amp; Multi-User Session
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            Zero Risk
          </span>
        </div>
      </div>
    </div>
  );
};
