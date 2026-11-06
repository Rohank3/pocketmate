"use client";

import React, { useState } from "react";
import { X, Check, ArrowRight, User, ShieldCheck, Mail, LogOut } from "lucide-react";
import { UserAccount } from "@/types/sandboxUser";
import { PRESET_USERS, SandboxStore } from "@/lib/sandbox/sandboxStore";

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

  if (!isOpen) return null;

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !emailInput.includes("@")) {
      setErrorMsg("Please enter a valid PayPal email address.");
      return;
    }
    const user = SandboxStore.loginWithEmail(emailInput.trim(), nameInput.trim() || undefined);
    onLogin(user);
    setEmailInput("");
    setNameInput("");
    setErrorMsg("");
    onClose();
  };

  const handleQuickLogin = (preset: UserAccount) => {
    SandboxStore.setCurrentUser(preset);
    onLogin(preset);
    onClose();
  };

  const handleLogoutAction = () => {
    SandboxStore.setCurrentUser(null);
    onLogout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
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
                Sign in to view your ledger, personal budget, and split invoices
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Current Active Account Status */}
          {currentUser && (
            <div className="p-3 rounded-xl bg-zinc-950 border border-blue-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center font-bold text-xs text-blue-300">
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
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 text-xs font-medium border border-zinc-800 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          )}

          {/* Manual Email Log In Form */}
          <form onSubmit={handleManualLogin} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                PayPal Sandbox Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="email"
                  placeholder="e.g. dave.chen@personal.example.com"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  required
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500"
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
                  placeholder="e.g. Dave Chen"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="mt-1 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              <span>Log In with Email</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Quick Select Sandbox Users for Testing Convenience */}
          <div className="border-t border-zinc-800 pt-3">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Or Choose Pre-Configured Test User
            </p>

            <div className="flex flex-col gap-1.5 max-h-[190px] overflow-y-auto pr-1">
              {PRESET_USERS.map((preset) => {
                const isActive = currentUser?.email.toLowerCase() === preset.email.toLowerCase();

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleQuickLogin(preset)}
                    className={`flex items-center justify-between p-2 rounded-xl text-left border transition-all cursor-pointer ${
                      isActive
                        ? "bg-blue-600/10 border-blue-500/50"
                        : "bg-zinc-950/80 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-bold text-zinc-300 shrink-0">
                        {preset.avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate flex items-center gap-1.5">
                          {preset.name}
                          {preset.id === "usr_dave_chen" && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded">
                              Dining Friend
                            </span>
                          )}
                          {preset.id === "usr_dave_miller" && (
                            <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1 rounded">
                              Work / Office
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-zinc-500 font-mono truncate">
                          {preset.email}
                        </p>
                      </div>
                    </div>

                    {isActive ? (
                      <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    ) : (
                      <span className="text-[11px] text-zinc-500 group-hover:text-zinc-300">
                        Select
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-2.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Sandbox Environment
          </span>
          <span>Zero Real Currency Risk</span>
        </div>
      </div>
    </div>
  );
};
