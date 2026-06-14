"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, X, Info } from "lucide-react";

interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}

// Singleton event bus for toasts
type ToastListener = (toast: ToastItem) => void;
const listeners: Set<ToastListener> = new Set();

export function showToast(type: ToastItem["type"], message: string, duration = 4000) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const toast: ToastItem = { id, type, message, duration };
  listeners.forEach((fn) => fn(toast));
}

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES = {
  success: "border-emerald-500/30 bg-emerald-950/40 text-emerald-300",
  error: "border-rose-500/30 bg-rose-950/40 text-rose-300",
  warning: "border-amber-500/30 bg-amber-950/40 text-amber-300",
  info: "border-indigo-500/30 bg-indigo-950/40 text-indigo-300",
};

const ICON_COLORS = {
  success: "text-emerald-400",
  error: "text-rose-400",
  warning: "text-amber-400",
  info: "text-indigo-400",
};

const BAR_COLORS = {
  success: "bg-emerald-400",
  error: "bg-rose-400",
  warning: "bg-amber-400",
  info: "bg-indigo-400",
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler: ToastListener = (toast) => {
      setToasts((prev) => [...prev, toast]);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="toast-container">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const Icon = ICONS[toast.type];

  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast.duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`relative w-80 rounded-xl border backdrop-blur-xl overflow-hidden shadow-2xl ${STYLES[toast.type]}`}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${ICON_COLORS[toast.type]}`} />
        <p className="text-sm font-medium flex-1 leading-snug">{toast.message}</p>
        <button onClick={onDismiss} className="p-0.5 rounded hover:bg-white/5 transition shrink-0">
          <X className="w-4 h-4 opacity-60" />
        </button>
      </div>

      {/* Progress bar */}
      <motion.div
        className={`h-0.5 ${BAR_COLORS[toast.type]}`}
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: (toast.duration || 4000) / 1000, ease: "linear" }}
      />
    </motion.div>
  );
}
