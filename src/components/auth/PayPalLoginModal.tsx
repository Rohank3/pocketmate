"use client";

import React, { useState } from "react";
import { X, ArrowRight, User, ShieldCheck, Mail, LogOut, ExternalLink, HelpCircle, AlertTriangle, Users } from "lucide-react";
import { UserAccount } from "@/types/sandboxUser";
import { ALL_SANDBOX_ACCOUNTS, SandboxAccount } from "@/lib/sandbox/sandboxAccounts";

interface PayPalLoginModalProps {
  isOpen: boolean;
  currentUser: UserAccount | null;
  onClose: () => void;
  onLogin: (user: UserAccount) => void;
  onLogout: () => void;
}

export const PayPalLoginModal: React.FC<PayPalLoginModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onLogin,
  onLogout,
}) => {
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOAuthHelp, setShowOAuthHelp] = useState(false);

  if (!isOpen) return null;

  const handleManualSandboxLogin = async (emailToUse?: string, nameToUse?: string) => {
    const targetEmail = (emailToUse || emailInput).trim().toLowerCase();
    const targetName = (nameToUse || nameInput).trim() || targetEmail.split("@")[0].replace(/[._]/g, " ");

    if (!targetEmail || !targetEmail.includes("@")) {
      setErrorMsg("Please enter a valid PayPal sandbox email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await fetch("/api/auth/callback/paypal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, name: targetName }),
      }).catch(() => null);

      const user: UserAccount = {
        id: `usr_${Date.now()}`,
        name: targetName,
        email: targetEmail,
        avatar: targetName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2),
        persona: targetEmail.includes("merchant") || targetEmail.includes("business") ? "BUSINESS" : "GENERAL",
      };

      onLogin(user);
      onClose();
    } catch {
      setErrorMsg("Failed to initialize sandbox user session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoutAction = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // proceed regardless
    }
    onLogout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0070ba]/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                Log In to PayPal
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Sandbox Active
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Sign in with any PayPal Developer Sandbox Buyer or Merchant account
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
          {/* Current Active Account Status */}
          {currentUser && (
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-blue-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center font-bold text-xs text-blue-300">
                  {currentUser.avatar}
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-100">{currentUser.name}</p>
                  <p className="text-[11px] text-zinc-400 font-mono">{currentUser.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogoutAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 text-xs font-medium border border-zinc-800 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          )}

          {/* Quick 1-Click Sandbox Test Accounts */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                Your 18 Provisioned Sandbox Accounts:
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">pwd: PocketMate2026!</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleManualSandboxLogin("dave.chen.pm@personal.example.com", "Dave Chen")}
                className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-blue-500/50 hover:bg-blue-950/20 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-blue-400">Dave Chen</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                    Personal Buyer
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 font-mono truncate">dave.chen.pm@personal.example.com</p>
                <p className="text-[10px] text-zinc-500 mt-1">Pending split bills to review & settle</p>
              </button>

              <button
                type="button"
                onClick={() => handleManualSandboxLogin("alex.morgan.studio@business.example.com", "Alex Morgan")}
                className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-950/20 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-400">Alex Morgan</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                    Business Merchant
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 font-mono truncate">alex.morgan.studio@business.example.com</p>
                <p className="text-[10px] text-zinc-500 mt-1">Dispatches invoices & tracks receivables</p>
              </button>
            </div>

            {/* Quick selector for all 18 accounts */}
            <div className="mt-1">
              <label className="text-[11px] text-zinc-400 block mb-1">
                Select Any Other Provisioned Test Account:
              </label>
              <select
                aria-label="Select Any Other Provisioned Test Account"
                onChange={(e) => {
                  const selected = ALL_SANDBOX_ACCOUNTS.find((a) => a.email === e.target.value);
                  if (selected) {
                    void handleManualSandboxLogin(selected.email, selected.name);
                  }
                }}
                defaultValue=""
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-blue-500 transition-colors font-mono cursor-pointer"
              >
                <option value="" disabled>-- Choose from all 18 Sandbox Users --</option>
                {ALL_SANDBOX_ACCOUNTS.map((acc: SandboxAccount) => (
                  <option key={acc.email} value={acc.email}>
                    {acc.name} ({acc.type}) - {acc.email} [${acc.initialBalance}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Where do sandbox users come from info banner */}
          <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/20 text-xs text-zinc-300 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-zinc-200">How Sandbox Users Work in PayPal:</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  PayPal automatically provisions test personal and business accounts for you in your PayPal Developer Dashboard with virtual balances ($5,000 USD).
                </p>
              </div>
            </div>
            <a
              href="https://developer.paypal.com/dashboard/accounts"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors self-start ml-6"
            >
              <span>View or create accounts in PayPal Developer Dashboard</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="grow border-t border-zinc-800"></div>
            <span className="shrink mx-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
              Or Sign In With Your Custom Sandbox Account
            </span>
            <div className="grow border-t border-zinc-800"></div>
          </div>

          {/* Custom Sandbox Email Entry */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleManualSandboxLogin();
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Your PayPal Sandbox Account Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="email"
                  placeholder="e.g. sb-43xyz@personal.example.com"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  required
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500 transition-colors font-mono"
                />
              </div>
              {errorMsg && <p className="text-[11px] text-rose-400 mt-1">{errorMsg}</p>}
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Display Name (Optional)
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="e.g. Test Personal Buyer"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <span>Sign In with Sandbox Account</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Official PayPal Sandbox OAuth Flow Section */}
          <div className="border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Full Web OAuth Redirect
              </span>
              <button
                type="button"
                onClick={() => setShowOAuthHelp(!showOAuthHelp)}
                className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1"
              >
                <span>Setup Guide</span>
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>

            <a
              href="/api/auth/paypal"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 text-xs font-bold border border-zinc-700 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
              </svg>
              <span>Connect via PayPal Sandbox OAuth Redirect</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>

            {showOAuthHelp && (
              <div className="mt-2 p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 text-[11px] flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Fixing &quot;Looks like this action is not supported&quot;:</span>
                </div>
                <p>
                  1. Go to <a href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank" rel="noreferrer" className="underline font-semibold text-amber-100">developer.paypal.com/dashboard/applications/sandbox</a>.
                </p>
                <p>2. Select your App &gt; <strong>App Features</strong>.</p>
                <p>3. Check <strong>Log in with PayPal</strong> and add Return URL: <code className="bg-black/50 px-1 py-0.5 rounded text-amber-200 font-mono">http://localhost:3000/api/auth/callback/paypal</code>.</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-2.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            PayPal Developer Sandbox
          </span>
          <span>Zero Real Currency Risk</span>
        </div>
      </div>
    </div>
  );
};
