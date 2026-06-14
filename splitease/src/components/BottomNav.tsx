"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  DollarSign,
  ArrowRightLeft,
  Settings,
  PlusCircle,
} from "lucide-react";

interface BottomNavProps {
  activeTab: "dashboard" | "expenses" | "settlements" | "settings";
  onTabChange: (tab: "dashboard" | "expenses" | "settlements" | "settings") => void;
  onAddExpense: () => void;
}

const tabs = [
  { key: "dashboard" as const, label: "Home", icon: TrendingUp },
  { key: "expenses" as const, label: "Expenses", icon: DollarSign },
  { key: "settlements" as const, label: "Settle", icon: ArrowRightLeft },
  { key: "settings" as const, label: "Settings", icon: Settings },
];

export default function BottomNav({ activeTab, onTabChange, onAddExpense }: BottomNavProps) {
  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50">
      {/* Floating Add Button */}
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={onAddExpense}
          className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-transform"
        >
          <PlusCircle className="w-6 h-6" />
        </button>
      </div>

      {/* Navigation bar */}
      <nav className="glass-elevated rounded-t-2xl border-t border-x" style={{ borderColor: "var(--glass-border)" }}>
        <div className="flex items-center justify-around px-2 py-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className="relative flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-colors"
              >
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute inset-0 rounded-xl bg-indigo-500/10 border border-indigo-500/20"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
                <Icon
                  className={`w-5 h-5 relative z-10 transition-colors ${
                    isActive ? "text-indigo-400" : "text-slate-500"
                  }`}
                />
                <span
                  className={`text-[10px] font-semibold relative z-10 transition-colors ${
                    isActive ? "text-indigo-400" : "text-slate-500"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
