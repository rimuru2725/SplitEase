"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  Users,
  Lock,
  User,
  DollarSign,
  TrendingUp,
  LogOut,
  PlusCircle,
  Download,
  Edit2,
  Trash2,
  Settings,
  AlertTriangle,
  Check,
  X,
  ChevronRight,
  Calendar,
  Tag,
  RefreshCw,
  ArrowRightLeft,
  PieChart as ChartIcon,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

import AnimatedBackground from "@/components/AnimatedBackground";
import GlassCard from "@/components/GlassCard";
import AnimatedCounter from "@/components/AnimatedCounter";
import SpendingCharts from "@/components/SpendingCharts";
import ToastContainer, { showToast } from "@/components/Toast";
import { DashboardSkeleton, ExpensesSkeleton, SettlementsSkeleton } from "@/components/SkeletonLoader";
import BottomNav from "@/components/BottomNav";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface Expense {
  id: number;
  group_id: number;
  payer: string;
  amount: number;
  description: string;
  category: string;
  split_among: string;
  split_type: string;
  split_values: string | null;
  created_at: string;
}

interface Settlement {
  id: number;
  from_user: string;
  to_user: string;
  amount: number;
  status: "pending" | "paid" | "settled";
  created_at: string;
}

interface GroupMember {
  id: number;
  name: string;
}

interface BudgetStatus {
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
}

interface BudgetAlert {
  id: number;
  threshold_percentage: number;
  is_active: number;
}

interface OptimizedSettlement {
  from: string;
  to: string;
  amount: string;
}

interface UserBalances {
  owes: number;
  owed: number;
  net: number;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const CATEGORIES = ["Food", "Travel", "Rent", "Utilities", "Shopping", "Entertainment", "Others"];

const CATEGORY_COLORS: Record<string, string> = {
  Food: "from-amber-400 to-orange-500",
  Travel: "from-sky-400 to-blue-500",
  Rent: "from-violet-400 to-purple-500",
  Utilities: "from-emerald-400 to-teal-500",
  Shopping: "from-pink-400 to-rose-500",
  Entertainment: "from-indigo-400 to-indigo-600",
  Others: "from-slate-400 to-slate-500",
};

// Motion variants
const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function Home() {
  const [mounted, setMounted] = useState(false);

  // Auth state
  const [token, setToken] = useState<string>("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [isCreator, setIsCreator] = useState<boolean>(false);

  // Navigation state
  const [activeTab, setActiveTab] = useState<"dashboard" | "expenses" | "settlements" | "settings">("dashboard");

  // Auth screen state
  const [authTab, setAuthTab] = useState<"join" | "create">("join");
  const [inputGroupName, setInputGroupName] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [inputUserName, setInputUserName] = useState("");
  const [inputBudget, setInputBudget] = useState("");

  // Dashboard & group state
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [optimizedSettlements, setOptimizedSettlements] = useState<OptimizedSettlement[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<Settlement[]>([]);
  const [userBalances, setUserBalances] = useState<UserBalances>({ owes: 0, owed: 0, net: 0 });
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus>({ budget: 0, spent: 0, remaining: 0, percentage: 0 });
  const [budgetAlertRules, setBudgetAlertRules] = useState<BudgetAlert[]>([]);

  // Modals / forms state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    amount: "",
    payer: "",
    category: "Others",
    splitType: "equal",
    splitAmong: [] as string[],
    splitValues: {} as Record<string, string>,
  });

  const [budgetForm, setBudgetForm] = useState({
    limit: "",
    alerts: [] as { threshold_percentage: number; is_active: boolean }[],
  });

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeBudgetWarning, setActiveBudgetWarning] = useState<{
    percentage: number;
    currentUsage: number;
    budget: number;
    spent: number;
  } | null>(null);

  // Check saved session on mount
  useEffect(() => {
    setMounted(true);
    const session = localStorage.getItem("splitease_session");
    if (session) {
      try {
        const parsed = JSON.parse(session);
        setToken(parsed.token);
        setGroupId(parsed.groupId);
        setGroupName(parsed.groupName);
        setUserName(parsed.userName);
        setIsCreator(parsed.isCreator);
      } catch {
        localStorage.removeItem("splitease_session");
      }
    }
  }, []);

  // Fetch data when authenticated group changes or tabs switch
  useEffect(() => {
    if (token && groupId) {
      fetchGroupData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, groupId, activeTab]);

  // ─── Data Fetching ───────────────────────────────────────────

  const fetchGroupData = async () => {
    setIsLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [infoRes, membersRes, expensesRes, settlementsRes] = await Promise.all([
        fetch("/api/group/info", { headers }),
        fetch("/api/users", { headers }),
        fetch("/api/expenses", { headers }),
        fetch("/api/settlements", { headers }),
      ]);

      if (infoRes.ok) {
        const data = await infoRes.json();
        setBudgetStatus(data.budgetStatus);
        setBudgetAlertRules(data.alerts);
        setBudgetForm({
          limit: String(data.group.budget),
          alerts: data.alerts.map((a: BudgetAlert) => ({
            threshold_percentage: a.threshold_percentage,
            is_active: a.is_active === 1,
          })),
        });
      }

      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data);
      }

      if (expensesRes.ok) {
        const data = await expensesRes.json();
        setExpenses(data);
      }

      if (settlementsRes.ok) {
        const data = await settlementsRes.json();
        setOptimizedSettlements(data.settlements);
        setPaymentHistory(data.paymentHistory);
        setUserBalances(data.userBalances);
      }
    } catch {
      showToast("error", "Failed to sync group workspace data.");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Auth Handlers ───────────────────────────────────────────

  const handleLogout = () => {
    localStorage.removeItem("splitease_session");
    setToken("");
    setGroupId(null);
    setGroupName("");
    setUserName("");
    setIsCreator(false);
    setActiveTab("dashboard");
    setError("");
    setActiveBudgetWarning(null);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGroupName || !inputPassword || !inputUserName) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/create-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inputGroupName,
          password: inputPassword,
          creatorName: inputUserName,
          budget: inputBudget ? Number(inputBudget) : 0,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const session = {
          token: data.token,
          groupId: data.groupId,
          groupName: data.groupName,
          userName: data.userName,
          isCreator: data.isCreator,
        };
        localStorage.setItem("splitease_session", JSON.stringify(session));
        setToken(data.token);
        setGroupId(data.groupId);
        setGroupName(data.groupName);
        setUserName(data.userName);
        setIsCreator(data.isCreator);
        showToast("success", "Welcome to SplitEase! Group successfully registered.");
      } else {
        setError(data.error || "Failed to create group.");
      }
    } catch {
      setError("Server connection failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGroupName || !inputPassword || !inputUserName) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/join-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inputGroupName,
          password: inputPassword,
          userName: inputUserName,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const session = {
          token: data.token,
          groupId: data.groupId,
          groupName: data.groupName,
          userName: data.userName,
          isCreator: data.isCreator,
        };
        localStorage.setItem("splitease_session", JSON.stringify(session));
        setToken(data.token);
        setGroupId(data.groupId);
        setGroupName(data.groupName);
        setUserName(data.userName);
        setIsCreator(data.isCreator);
        showToast("success", "Authentication success! Connecting workspace.");
      } else {
        setError(data.error || "Failed to join group.");
      }
    } catch {
      setError("Server connection failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Expense Handlers ────────────────────────────────────────

  const openNewExpenseModal = () => {
    setEditingExpense(null);
    const splitCheck = members.map((m) => m.name);
    setExpenseForm({
      description: "",
      amount: "",
      payer: userName,
      category: "Others",
      splitType: "equal",
      splitAmong: splitCheck,
      splitValues: members.reduce((acc, m) => {
        acc[m.name] = "";
        return acc;
      }, {} as Record<string, string>),
    });
    setError("");
    setShowExpenseModal(true);
  };

  const openEditExpenseModal = (expense: Expense) => {
    setEditingExpense(expense);
    const splits = expense.split_among.split(",").map((s) => s.trim());
    let values: Record<string, string> = {};
    if (expense.split_values) {
      try {
        const parsed = JSON.parse(expense.split_values);
        Object.entries(parsed).forEach(([k, v]) => {
          values[k] = String(v);
        });
      } catch {
        // ignore
      }
    }
    setExpenseForm({
      description: expense.description,
      amount: String(expense.amount),
      payer: expense.payer,
      category: expense.category || "Others",
      splitType: expense.split_type || "equal",
      splitAmong: splits,
      splitValues: {
        ...members.reduce((acc, m) => {
          acc[m.name] = "";
          return acc;
        }, {} as Record<string, string>),
        ...values,
      },
    });
    setError("");
    setShowExpenseModal(true);
  };

  const handleSplitAmongToggle = (name: string) => {
    setExpenseForm((prev) => {
      const splitAmong = prev.splitAmong.includes(name)
        ? prev.splitAmong.filter((n) => n !== name)
        : [...prev.splitAmong, name];
      return { ...prev, splitAmong };
    });
  };

  const validateFormSplits = (): boolean => {
    const { splitType, amount, splitAmong, splitValues } = expenseForm;
    const expenseAmt = Number(amount);

    if (splitAmong.length === 0) {
      setError("Please select at least one person to split the expense with.");
      return false;
    }

    if (splitType === "percentage") {
      let sum = 0;
      for (const name of splitAmong) {
        const val = Number(splitValues[name]);
        if (isNaN(val) || val <= 0) {
          setError(`Please enter a valid percentage for ${name}.`);
          return false;
        }
        sum += val;
      }
      if (Math.abs(sum - 100) > 0.01) {
        setError(`Percentages must sum to 100% (currently ${sum}%).`);
        return false;
      }
    }

    if (splitType === "fixed") {
      let sum = 0;
      for (const name of splitAmong) {
        const val = Number(splitValues[name]);
        if (isNaN(val) || val <= 0) {
          setError(`Please enter a valid split amount for ${name}.`);
          return false;
        }
        sum += val;
      }
      if (Math.abs(sum - expenseAmt) > 0.01) {
        setError(`Split amounts must sum to $${expenseAmt.toFixed(2)}. Currently $${sum.toFixed(2)}.`);
        return false;
      }
    }

    if (splitType === "shares") {
      for (const name of splitAmong) {
        const val = Number(splitValues[name]);
        if (isNaN(val) || val <= 0 || !Number.isInteger(val)) {
          setError(`Please enter a valid whole share for ${name}.`);
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!expenseForm.description || !expenseForm.amount || !expenseForm.payer) {
      setError("Please complete all required fields.");
      return;
    }

    if (!validateFormSplits()) return;

    const cleanSplitValues: Record<string, number> = {};
    if (expenseForm.splitType !== "equal") {
      expenseForm.splitAmong.forEach((name) => {
        cleanSplitValues[name] = Number(expenseForm.splitValues[name]);
      });
    }

    setIsLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const payload = {
        payer: expenseForm.payer,
        amount: Number(expenseForm.amount),
        description: expenseForm.description,
        category: expenseForm.category,
        split_among: expenseForm.splitAmong.join(", "),
        split_type: expenseForm.splitType,
        split_values: expenseForm.splitType !== "equal" ? cleanSplitValues : null,
      };

      const url = editingExpense ? `/api/expenses/${editingExpense.id}` : "/api/expenses";
      const method = editingExpense ? "PUT" : "POST";

      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      const data = await res.json();

      if (res.ok) {
        showToast("success", editingExpense ? "Expense successfully modified!" : "Expense successfully added!");
        setShowExpenseModal(false);
        fetchGroupData();

        if (data.budgetAlert) {
          setActiveBudgetWarning(data.budgetAlert);
        } else {
          setActiveBudgetWarning(null);
        }
      } else {
        setError(data.error || "Failed to process expense.");
      }
    } catch {
      setError("API network connection failure.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!confirm("Are you sure you want to delete this expense? This cannot be undone.")) return;

    setError("");
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok) {
        showToast("success", "Expense successfully deleted!");
        fetchGroupData();
      } else {
        showToast("error", data.error || "Failed to delete expense.");
      }
    } catch {
      showToast("error", "API network connection failure.");
    }
  };

  // ─── Settlement Handlers ─────────────────────────────────────

  const handleRecordPayment = async (from: string, to: string, amount: string) => {
    try {
      const res = await fetch("/api/settlements/pay", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "create", from, to, amount }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast("success", data.message);
        fetchGroupData();
      } else {
        showToast("error", data.error);
      }
    } catch {
      showToast("error", "API connection error.");
    }
  };

  const handlePaymentAction = async (action: "confirm" | "reject" | "cancel", paymentId: number) => {
    try {
      const res = await fetch("/api/settlements/pay", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, paymentId }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast("success", data.message);
        fetchGroupData();
      } else {
        showToast("error", data.error);
      }
    } catch {
      showToast("error", "API connection error.");
    }
  };

  // ─── Budget Handlers ─────────────────────────────────────────

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/group/budget", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          budget: Number(budgetForm.limit),
          alerts: budgetForm.alerts,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast("success", "Budget configuration saved successfully!");
        fetchGroupData();
      } else {
        showToast("error", data.error);
      }
    } catch {
      showToast("error", "API connection error.");
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────

  const renderSplitDetails = (exp: Expense) => {
    if (exp.split_type === "equal") return "Split Equally";
    if (!exp.split_values) return "Split Details";

    try {
      const values = JSON.parse(exp.split_values);
      return Object.entries(values)
        .map(([name, val]) => {
          if (exp.split_type === "percentage") return `${name}: ${val}%`;
          if (exp.split_type === "fixed") return `${name}: $${Number(val).toFixed(2)}`;
          return `${name}: ${val} shares`;
        })
        .join(", ");
    } catch {
      return "Custom Split";
    }
  };

  const exportCSV = () => {
    if (!groupId || !token) return;
    window.open(`/api/export/csv?token=${token}`, "_blank");
  };

  if (!mounted) return null;

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="flex-1 flex flex-col font-sans text-slate-100 antialiased min-h-screen" style={{ background: "var(--background)" }}>
      <AnimatedBackground />
      <ToastContainer />

      {!token ? (
        // ═══════════════════════════════════════════════════════════
        // AUTH SCREEN
        // ═══════════════════════════════════════════════════════════
        <div className="flex-1 flex flex-col justify-center items-center px-4 py-16 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 25, delay: 0.1 }}
            className="perspective-container w-full max-w-md"
          >
            <GlassCard variant="elevated" tilt glow className="rounded-3xl overflow-hidden">
              {/* Header */}
              <div className="p-8 text-center border-b relative overflow-hidden" style={{ borderColor: "var(--glass-border)" }}>
                {/* Subtle radial glow behind logo */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-32 h-32 rounded-full bg-indigo-500/10 blur-[60px]" />
                </div>

                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.3 }}
                  className="relative z-10 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/25 mb-4"
                >
                  <Wallet className="w-8 h-8 text-white" />
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-violet-300 to-purple-300 bg-clip-text text-transparent"
                >
                  SplitEase
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-slate-400 text-sm mt-2 font-medium flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  Smart Group Expense Tracker
                </motion.p>
              </div>

              {/* Selector tabs */}
              <div className="flex p-2" style={{ borderBottom: "1px solid var(--glass-border)", background: "rgba(6,6,14,0.3)" }}>
                {(["join", "create"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setAuthTab(tab); setError(""); }}
                    className={`relative flex-1 py-3 text-sm font-semibold rounded-xl transition-all duration-300 cursor-pointer ${
                      authTab === tab
                        ? "text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {authTab === tab && (
                      <motion.div
                        layoutId="authTabIndicator"
                        className="absolute inset-0 rounded-xl glass"
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">{tab === "join" ? "Join Group" : "Create Group"}</span>
                  </button>
                ))}
              </div>

              {/* Form */}
              <motion.div
                className="p-8"
                initial={false}
                key={authTab}
              >
                <motion.div
                  initial={{ opacity: 0, x: authTab === "join" ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="mb-6 p-4 rounded-xl border border-rose-800/50 bg-rose-950/30 text-rose-300 text-sm flex items-start gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}

                  {authTab === "join" ? (
                    <form onSubmit={handleJoinGroup} className="space-y-5">
                      <InputField icon={Users} label="Group Name" value={inputGroupName} onChange={setInputGroupName} placeholder="Enter group name" />
                      <InputField icon={Lock} label="Group Password" value={inputPassword} onChange={setInputPassword} placeholder="••••••••" type="password" />
                      <InputField icon={User} label="Your Username" value={inputUserName} onChange={setInputUserName} placeholder="Enter your name" />
                      <SubmitButton loading={isLoading} label="Authenticate & Join" />
                    </form>
                  ) : (
                    <form onSubmit={handleCreateGroup} className="space-y-5">
                      <InputField icon={Users} label="New Group Name" value={inputGroupName} onChange={setInputGroupName} placeholder="e.g., Roommates, Roadtrip" />
                      <InputField icon={Lock} label="Create Password" value={inputPassword} onChange={setInputPassword} placeholder="••••••••" type="password" hint="Share this password with group members so they can join." />
                      <InputField icon={User} label="Your Creator Name" value={inputUserName} onChange={setInputUserName} placeholder="Enter your name" />
                      <InputField icon={DollarSign} label="Group Budget (Optional)" value={inputBudget} onChange={setInputBudget} placeholder="e.g., 500" type="number" />
                      <SubmitButton loading={isLoading} label="Register & Initialize" />
                    </form>
                  )}
                </motion.div>
              </motion.div>
            </GlassCard>
          </motion.div>
        </div>
      ) : (
        // ═══════════════════════════════════════════════════════════
        // AUTHENTICATED MAIN APP
        // ═══════════════════════════════════════════════════════════
        <div className="flex-1 flex flex-col relative z-10 w-full">
          {/* ── Navbar ── */}
          <nav className="glass-elevated sticky top-0 z-40" style={{ borderBottom: "1px solid var(--glass-border)" }}>
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ scale: 1.08, rotate: 5 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20"
                >
                  <Wallet className="w-5 h-5 text-white" />
                </motion.div>
                <div>
                  <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-violet-300 bg-clip-text text-transparent">
                    SplitEase
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-slate-400 text-xs font-semibold uppercase">{groupName}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                        isCreator
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                      }`}
                    >
                      {isCreator ? "Creator" : "Member"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl glass">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                    {userName[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-300">{userName}</span>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLogout}
                  className="p-2.5 rounded-xl glass text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          </nav>

          {/* Budget warning banner */}
          <AnimatePresence>
            {activeBudgetWarning && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden relative z-30"
              >
                <div className="bg-amber-950/20 border-b border-amber-900/30 py-3.5 px-4">
                  <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-sm font-bold text-amber-300">Budget Warning threshold reached!</h5>
                        <p className="text-xs text-amber-400/80 mt-0.5">
                          Spent ${Number(activeBudgetWarning.spent).toFixed(2)} of group budget limit $
                          {Number(activeBudgetWarning.budget).toFixed(2)} (Usage: {activeBudgetWarning.currentUsage}%)
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setActiveBudgetWarning(null)} className="p-1 rounded-md text-amber-400 hover:bg-amber-500/10 transition cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Main Workspace ── */}
          <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-8 flex-1 flex flex-col sm:flex-row gap-6 relative z-10 pb-24 sm:pb-8">
            {/* Sidebar (Desktop) */}
            <aside className="hidden sm:flex sm:w-56 shrink-0 flex-col gap-1.5 sm:pr-4" style={{ borderRight: "1px solid var(--glass-border)" }}>
              {([
                { key: "dashboard" as const, label: "Dashboard", icon: TrendingUp },
                { key: "expenses" as const, label: "Expenses Log", icon: DollarSign },
                { key: "settlements" as const, label: "Settlements", icon: ArrowRightLeft },
                { key: "settings" as const, label: "Settings", icon: Settings },
              ]).map((tab) => {
                const isActive = activeTab === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setError(""); }}
                    className={`relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 shrink-0 cursor-pointer ${
                      isActive ? "text-indigo-300" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebarIndicator"
                        className="absolute inset-0 rounded-xl bg-indigo-500/8 border border-indigo-500/20"
                        style={{ boxShadow: "0 0 20px rgba(99,102,241,0.06)" }}
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                      />
                    )}
                    <Icon className="w-5 h-5 relative z-10" />
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </aside>

            {/* Central Workspace */}
            <main className="flex-1 flex flex-col min-w-0">
              <AnimatePresence mode="wait">
                {isLoading && expenses.length === 0 ? (
                  <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {activeTab === "dashboard" && <DashboardSkeleton />}
                    {activeTab === "expenses" && <ExpensesSkeleton />}
                    {activeTab === "settlements" && <SettlementsSkeleton />}
                    {activeTab === "settings" && <DashboardSkeleton />}
                  </motion.div>
                ) : (
                  <motion.div
                    key={activeTab}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    {/* ─── DASHBOARD TAB ─── */}
                    {activeTab === "dashboard" && (
                      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
                        {/* Balance stats grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          <motion.div variants={staggerItem}>
                            <GlassCard glow className="p-6 flex items-center justify-between">
                              <div className="space-y-1">
                                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Group Total Spent</span>
                                <h3 className="text-3xl font-extrabold text-indigo-300 font-mono">
                                  <AnimatedCounter value={budgetStatus.spent} prefix="$" />
                                </h3>
                              </div>
                              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                                <TrendingUp className="w-6 h-6" />
                              </div>
                            </GlassCard>
                          </motion.div>

                          <motion.div variants={staggerItem}>
                            <GlassCard glow className="p-6 flex flex-col justify-between min-h-[120px]">
                              <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Budget Status</span>
                                  <h3 className="text-xl font-bold">
                                    {budgetStatus.budget > 0
                                      ? <><AnimatedCounter value={budgetStatus.remaining} prefix="$" className="font-mono" /> left</>
                                      : "No Limit Set"}
                                  </h3>
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                                  <Wallet className="w-5 h-5" />
                                </div>
                              </div>
                              {budgetStatus.budget > 0 && (
                                <div className="mt-3 space-y-1.5">
                                  <div className="w-full h-2.5 rounded-full bg-slate-950/60 overflow-hidden border border-white/[0.03]">
                                    <motion.div
                                      className={`h-full rounded-full bg-gradient-to-r ${
                                        budgetStatus.percentage > 90
                                          ? "from-rose-500 to-red-600"
                                          : budgetStatus.percentage > 75
                                          ? "from-amber-400 to-orange-500"
                                          : "from-teal-400 to-emerald-500"
                                      }`}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${Math.min(budgetStatus.percentage, 100)}%` }}
                                      transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>Usage: {budgetStatus.percentage}%</span>
                                    <span className="font-mono">Limit: ${budgetStatus.budget}</span>
                                  </div>
                                </div>
                              )}
                            </GlassCard>
                          </motion.div>

                          <motion.div variants={staggerItem}>
                            <GlassCard glow className="p-6 flex items-center justify-between">
                              <div className="space-y-1">
                                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Your Balance</span>
                                <h3 className={`text-3xl font-extrabold font-mono ${userBalances.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  <AnimatedCounter value={userBalances.net} prefix={userBalances.net >= 0 ? "+$" : "-$"} />
                                </h3>
                                <div className="flex gap-2 text-[10px] text-slate-500 mt-1 font-medium font-mono">
                                  <span>Owed: ${userBalances.owed}</span>
                                  <span>•</span>
                                  <span>Owes: ${userBalances.owes}</span>
                                </div>
                              </div>
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                                userBalances.net >= 0
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                  : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                              }`}>
                                <DollarSign className="w-6 h-6" />
                              </div>
                            </GlassCard>
                          </motion.div>
                        </div>

                        {/* Charts + Members */}
                        <motion.div variants={staggerItem} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                          <GlassCard className="p-6 lg:col-span-3">
                            <h4 className="text-base font-bold text-slate-200 mb-4 flex items-center gap-2">
                              <ChartIcon className="w-5 h-5 text-indigo-400" />
                              Spending Analytics
                            </h4>
                            <SpendingCharts expenses={expenses} />
                          </GlassCard>

                          <GlassCard className="p-6 lg:col-span-2">
                            <h4 className="text-base font-bold text-slate-200 mb-4 flex items-center gap-2">
                              <Users className="w-5 h-5 text-indigo-400" />
                              Group Members ({members.length})
                            </h4>
                            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                              {members.map((m) => (
                                <motion.div
                                  key={m.id}
                                  variants={staggerItem}
                                  className={`flex items-center justify-between p-3 rounded-xl border transition ${
                                    m.name === userName
                                      ? "glass border-indigo-500/15"
                                      : "bg-white/[0.02] border-white/[0.04]"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/15 to-violet-500/15 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold uppercase">
                                      {m.name[0]}
                                    </div>
                                    <span className="text-sm font-semibold text-slate-300">{m.name}</span>
                                  </div>
                                  {m.name === userName && (
                                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/25 uppercase font-extrabold">
                                      You
                                    </span>
                                  )}
                                </motion.div>
                              ))}
                            </motion.div>
                          </GlassCard>
                        </motion.div>

                        {/* Recent Activities */}
                        <motion.div variants={staggerItem}>
                          <GlassCard className="p-6">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-base font-bold text-slate-200 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-indigo-400" />
                                Recent Activities
                              </h4>
                              <button
                                onClick={() => setActiveTab("expenses")}
                                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 font-bold transition cursor-pointer"
                              >
                                View All <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {expenses.length === 0 ? (
                              <div className="text-center py-10 text-slate-500 text-sm">
                                No transactions registered yet. Click &quot;Add Expense&quot; to start.
                              </div>
                            ) : (
                              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="divide-y" style={{ borderColor: "var(--glass-border)" }}>
                                {expenses.slice(0, 4).map((exp) => (
                                  <motion.div key={exp.id} variants={staggerItem} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                                    <div className="flex items-start gap-3">
                                      <span className={`w-9 h-9 rounded-lg bg-gradient-to-tr ${CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.Others} flex items-center justify-center text-white text-xs shrink-0 font-bold shadow-lg`}>
                                        {exp.category ? exp.category[0] : "O"}
                                      </span>
                                      <div>
                                        <h5 className="text-sm font-bold text-slate-200">{exp.description}</h5>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                          Paid by <strong className="text-slate-400">{exp.payer}</strong> • {exp.split_among}
                                        </p>
                                      </div>
                                    </div>
                                    <span className="text-sm font-black text-slate-300 font-mono">${exp.amount.toFixed(2)}</span>
                                  </motion.div>
                                ))}
                              </motion.div>
                            )}
                          </GlassCard>
                        </motion.div>
                      </motion.div>
                    )}

                    {/* ─── EXPENSES TAB ─── */}
                    {activeTab === "expenses" && (
                      <div className="space-y-6">
                        <GlassCard className="p-4 flex items-center justify-between flex-wrap gap-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-200">Expense Logs</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Browse, edit, and export your group expenses.</p>
                          </div>
                          <div className="flex gap-2">
                            <motion.button
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={exportCSV}
                              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl glass text-slate-300 font-semibold text-xs transition cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                              CSV Export
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={openNewExpenseModal}
                              className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition cursor-pointer"
                            >
                              <PlusCircle className="w-4 h-4" />
                              Add Expense
                            </motion.button>
                          </div>
                        </GlassCard>

                        <GlassCard className="overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                              <thead>
                                <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-wider" style={{ borderBottom: "1px solid var(--glass-border)", background: "rgba(6,6,14,0.4)" }}>
                                  <th className="px-5 py-4">Description</th>
                                  <th className="px-5 py-4">Amount</th>
                                  <th className="px-5 py-4">Category</th>
                                  <th className="px-5 py-4">Paid By</th>
                                  <th className="px-5 py-4">Split Details</th>
                                  <th className="px-5 py-4">Date</th>
                                  <th className="px-5 py-4 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y text-sm" style={{ borderColor: "var(--glass-border)" }}>
                                {expenses.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="text-center py-16 text-slate-500">
                                      <Tag className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                                      No expenses logged in this group database.
                                    </td>
                                  </tr>
                                ) : (
                                  expenses.map((exp, index) => (
                                    <motion.tr
                                      key={exp.id}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: index * 0.04 }}
                                      className="hover:bg-white/[0.02] transition group"
                                    >
                                      <td className="px-5 py-4 font-bold text-slate-200">{exp.description}</td>
                                      <td className="px-5 py-4 font-black text-slate-300 font-mono">${exp.amount.toFixed(2)}</td>
                                      <td className="px-5 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gradient-to-tr ${CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.Others} text-white shadow-sm`}>
                                          {exp.category || "Others"}
                                        </span>
                                      </td>
                                      <td className="px-5 py-4 text-slate-400">{exp.payer}</td>
                                      <td className="px-5 py-4 text-xs text-slate-400 relative">
                                        <div className="flex items-center gap-1 group/tooltip">
                                          <span className="border-b border-dashed border-slate-600 cursor-help max-w-[150px] truncate block">
                                            {exp.split_among}
                                          </span>
                                          <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/5 px-1 py-0.5 rounded uppercase shrink-0 border border-indigo-500/10">
                                            {exp.split_type}
                                          </span>
                                          <div className="absolute bottom-full left-0 mb-1 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 glass-elevated rounded-xl p-3 shadow-2xl z-20 w-52 transition-all duration-200">
                                            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Split breakdown</p>
                                            <div className="space-y-1">
                                              {renderSplitDetails(exp).split(", ").map((str, idx) => (
                                                <div key={idx} className="flex justify-between text-[11px] text-slate-300">
                                                  <span>{str.split(":")[0]}</span>
                                                  <span className="font-semibold font-mono">{str.split(":")[1]}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-5 py-4 text-slate-500 text-xs">{new Date(exp.created_at).toLocaleDateString()}</td>
                                      <td className="px-5 py-4 text-right">
                                        {(isCreator || userName === exp.payer) ? (
                                          <div className="inline-flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <button
                                              onClick={() => openEditExpenseModal(exp)}
                                              className="p-1.5 rounded-lg glass text-slate-400 hover:text-slate-200 transition cursor-pointer"
                                              title="Edit Expense"
                                            >
                                              <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteExpense(exp.id)}
                                              className="p-1.5 rounded-lg border border-transparent hover:border-rose-900/50 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                              title="Delete Expense"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        ) : (
                                          <span className="text-[10px] text-slate-600 italic">View Only</span>
                                        )}
                                      </td>
                                    </motion.tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </GlassCard>
                      </div>
                    )}

                    {/* ─── SETTLEMENTS TAB ─── */}
                    {activeTab === "settlements" && (
                      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
                        <motion.div variants={staggerItem}>
                          <GlassCard className="p-6">
                            <h3 className="text-base font-bold text-slate-200 mb-1">Debt Settlements Path</h3>
                            <p className="text-xs text-slate-500 mb-6">Optimized transaction routes to clear all group balances.</p>

                            {optimizedSettlements.length === 0 ? (
                              <div className="text-center py-12">
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                >
                                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
                                </motion.div>
                                <p className="text-sm font-semibold text-emerald-400">All debts cleared!</p>
                                <p className="text-xs text-slate-600 mt-1">No outstanding settlements required.</p>
                              </div>
                            ) : (
                              <div className="space-y-3.5">
                                {optimizedSettlements.map((settle, index) => {
                                  const involveMe = settle.from === userName || settle.to === userName;
                                  return (
                                    <motion.div
                                      key={index}
                                      variants={staggerItem}
                                      className={`flex items-center justify-between p-4 rounded-xl border transition ${
                                        involveMe ? "glass border-indigo-500/15" : "bg-white/[0.02] border-white/[0.04]"
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 text-sm flex-wrap">
                                        <span className="font-extrabold text-slate-300">{settle.from}</span>
                                        <span className="text-xs text-slate-500 uppercase tracking-widest px-2 py-0.5 rounded glass">pays</span>
                                        <span className="font-extrabold text-emerald-400 font-mono">${settle.amount}</span>
                                        <span className="text-xs text-slate-500 uppercase tracking-widest px-2 py-0.5 rounded glass">to</span>
                                        <span className="font-extrabold text-slate-300">{settle.to}</span>
                                      </div>
                                      {settle.from === userName && (
                                        <motion.button
                                          whileHover={{ scale: 1.05 }}
                                          whileTap={{ scale: 0.95 }}
                                          onClick={() => handleRecordPayment(settle.from, settle.to, settle.amount)}
                                          className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs rounded-lg shadow-lg shadow-emerald-500/15 transition cursor-pointer"
                                        >
                                          Mark as Paid
                                        </motion.button>
                                      )}
                                    </motion.div>
                                  );
                                })}
                              </div>
                            )}
                          </GlassCard>
                        </motion.div>

                        <motion.div variants={staggerItem}>
                          <GlassCard className="p-6">
                            <h3 className="text-base font-bold text-slate-200 mb-1">Payment History</h3>
                            <p className="text-xs text-slate-500 mb-4">Tracking pending approvals and settled transactions.</p>

                            {paymentHistory.length === 0 ? (
                              <div className="text-center py-10 text-slate-500 text-sm">
                                No payment records found in group database.
                              </div>
                            ) : (
                              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                                {paymentHistory.map((pay) => {
                                  const isSender = pay.from_user === userName;
                                  const isRecipient = pay.to_user === userName;
                                  return (
                                    <motion.div
                                      key={pay.id}
                                      initial={{ opacity: 0, y: 8 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="flex items-center justify-between p-4 rounded-xl glass hover:border-white/[0.08] transition"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className={`w-2.5 h-2.5 rounded-full ${pay.status === "settled" ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
                                        <div>
                                          <p className="text-sm font-semibold text-slate-200">{pay.from_user} paid {pay.to_user}</p>
                                          <div className="flex gap-2 text-[10px] text-slate-500 mt-1 font-semibold uppercase">
                                            <span className="font-mono">Amount: ${Number(pay.amount).toFixed(2)}</span>
                                            <span>•</span>
                                            <span className={pay.status === "settled" ? "text-emerald-400" : "text-amber-400"}>
                                              {pay.status === "settled" ? "Settled" : "Pending Receipt"}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        {pay.status === "paid" && isRecipient && (
                                          <>
                                            <button onClick={() => handlePaymentAction("confirm", pay.id)} className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition cursor-pointer" title="Confirm Receipt">
                                              <Check className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handlePaymentAction("reject", pay.id)} className="p-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition cursor-pointer" title="Reject Payment">
                                              <X className="w-4 h-4" />
                                            </button>
                                          </>
                                        )}
                                        {pay.status === "paid" && isSender && (
                                          <button onClick={() => handlePaymentAction("cancel", pay.id)} className="px-2 py-1 text-[10px] font-bold rounded glass text-slate-400 hover:text-slate-200 transition cursor-pointer">
                                            Cancel
                                          </button>
                                        )}
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                            )}
                          </GlassCard>
                        </motion.div>
                      </motion.div>
                    )}

                    {/* ─── SETTINGS TAB ─── */}
                    {activeTab === "settings" && (
                      <div className="space-y-6">
                        <GlassCard className="p-6 space-y-6">
                          <div>
                            <h3 className="text-base font-bold text-slate-200 mb-1">Group Budget Limits</h3>
                            <p className="text-xs text-slate-500">
                              {isCreator ? "Establish spending warnings to track your group limits." : "Group budget settings can only be edited by the creator."}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                            <form onSubmit={handleUpdateBudget} className="space-y-5">
                              <div>
                                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Budget Target Amount ($)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  disabled={!isCreator}
                                  value={budgetForm.limit}
                                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, limit: e.target.value }))}
                                  className="w-full bg-slate-950/50 border border-white/[0.06] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 px-3 text-slate-200 transition outline-none text-sm font-mono disabled:opacity-50"
                                />
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Alert Threshold Rules</label>
                                  {isCreator && (
                                    <button
                                      type="button"
                                      onClick={() => setBudgetForm((prev) => ({ ...prev, alerts: [...prev.alerts, { threshold_percentage: 80, is_active: true }] }))}
                                      className="text-[10px] text-indigo-400 font-bold flex items-center gap-0.5 hover:text-indigo-300 transition cursor-pointer"
                                    >
                                      <PlusCircle className="w-3 h-3" /> Add Alert
                                    </button>
                                  )}
                                </div>

                                <div className="space-y-3">
                                  {budgetForm.alerts.map((alert, index) => (
                                    <div key={index} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="number"
                                          min="1"
                                          max="100"
                                          disabled={!isCreator}
                                          value={alert.threshold_percentage}
                                          onChange={(e) => {
                                            const alerts = [...budgetForm.alerts];
                                            alerts[index].threshold_percentage = Number(e.target.value);
                                            setBudgetForm((prev) => ({ ...prev, alerts }));
                                          }}
                                          className="w-16 bg-slate-900/50 border border-white/[0.06] rounded px-2 py-1 text-slate-200 text-center text-xs outline-none disabled:opacity-50 font-mono"
                                        />
                                        <span className="text-slate-400 text-xs font-semibold">% threshold</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                          <input
                                            type="checkbox"
                                            disabled={!isCreator}
                                            checked={alert.is_active}
                                            onChange={(e) => {
                                              const alerts = [...budgetForm.alerts];
                                              alerts[index].is_active = e.target.checked;
                                              setBudgetForm((prev) => ({ ...prev, alerts }));
                                            }}
                                            className="sr-only peer"
                                          />
                                          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none peer-focus:ring-1 peer-focus:ring-indigo-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500" />
                                        </label>
                                        {isCreator && (
                                          <button
                                            type="button"
                                            onClick={() => setBudgetForm((prev) => ({ ...prev, alerts: prev.alerts.filter((_, i) => i !== index) }))}
                                            className="p-1 rounded text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {isCreator && (
                                <motion.button
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  type="submit"
                                  disabled={isLoading}
                                  className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold rounded-xl text-xs shadow-lg shadow-indigo-500/15 transition cursor-pointer disabled:opacity-50"
                                >
                                  Save Budget Limits
                                </motion.button>
                              )}
                            </form>

                            <GlassCard className="p-6 space-y-4">
                              <h4 className="text-sm font-bold text-slate-300">Active Alert Levels</h4>
                              {budgetAlertRules.length === 0 ? (
                                <p className="text-xs text-slate-500">No alert warning limits are set.</p>
                              ) : (
                                <div className="space-y-3">
                                  {budgetAlertRules.map((rule) => (
                                    <div key={rule.id} className="flex items-center justify-between text-xs p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                      <span className="font-semibold text-slate-300">{rule.threshold_percentage}% limit rule</span>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        rule.is_active === 1
                                          ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                          : "bg-slate-800 text-slate-500 border border-slate-700"
                                      }`}>
                                        {rule.is_active === 1 ? "Active" : "Disabled"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </GlassCard>
                          </div>
                        </GlassCard>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </div>

          {/* Mobile Bottom Nav */}
          <BottomNav activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setError(""); }} onAddExpense={openNewExpenseModal} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          EXPENSE MODAL (Add / Edit)
         ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showExpenseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setShowExpenseModal(false)}
            />

            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass-elevated rounded-3xl w-full max-w-lg shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 flex items-center justify-between" style={{ borderBottom: "1px solid var(--glass-border)", background: "rgba(6,6,14,0.3)" }}>
                <h3 className="text-lg font-bold text-slate-200">
                  {editingExpense ? "Edit Expense Entry" : "Create Expense Entry"}
                </h3>
                <button onClick={() => setShowExpenseModal(false)} className="p-1 rounded-md text-slate-400 hover:bg-white/[0.05] transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitExpense} className="flex-1 overflow-y-auto p-6 space-y-5">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl border border-rose-800/50 bg-rose-950/30 text-rose-300 text-sm flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Description</label>
                    <input
                      type="text"
                      required
                      value={expenseForm.description}
                      onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))}
                      className="w-full bg-slate-950/50 border border-white/[0.06] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 px-3 text-slate-200 placeholder-slate-600 transition outline-none text-sm"
                      placeholder="e.g., Grocery shopping"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Amount ($)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                      className="w-full bg-slate-950/50 border border-white/[0.06] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 px-3 text-slate-200 placeholder-slate-600 transition outline-none text-sm font-mono font-bold"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Paid By</label>
                    <select
                      value={expenseForm.payer}
                      onChange={(e) => setExpenseForm((p) => ({ ...p, payer: e.target.value }))}
                      className="w-full bg-slate-950/50 border border-white/[0.06] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 px-3 text-slate-200 transition outline-none text-sm"
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Expense Category</label>
                    <select
                      value={expenseForm.category}
                      onChange={(e) => setExpenseForm((p) => ({ ...p, category: e.target.value }))}
                      className="w-full bg-slate-950/50 border border-white/[0.06] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 px-3 text-slate-200 transition outline-none text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Split checkboxes */}
                <div>
                  <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Split With</label>
                  <div className="flex flex-wrap gap-2 p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl max-h-[120px] overflow-y-auto">
                    {members.map((m) => {
                      const isChecked = expenseForm.splitAmong.includes(m.name);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => handleSplitAmongToggle(m.name)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                            isChecked
                              ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                              : "bg-white/[0.02] border-white/[0.04] text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {m.name}
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Split type selector */}
                <div>
                  <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Split Type</label>
                  <div className="grid grid-cols-4 gap-2 p-1 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    {["equal", "percentage", "fixed", "shares"].map((type) => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => setExpenseForm((p) => ({ ...p, splitType: type }))}
                        className={`relative py-2 rounded-lg text-xs font-semibold uppercase transition cursor-pointer ${
                          expenseForm.splitType === type ? "text-white" : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {expenseForm.splitType === type && (
                          <motion.div layoutId="splitTypeIndicator" className="absolute inset-0 rounded-lg glass" transition={{ type: "spring", stiffness: 400, damping: 35 }} />
                        )}
                        <span className="relative z-10">{type}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom split values */}
                {expenseForm.splitType !== "equal" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-white/[0.02] p-4 border border-white/[0.04] rounded-xl space-y-3"
                  >
                    <h5 className="text-xs font-bold text-slate-400">
                      {expenseForm.splitType === "percentage" && "Enter Percentages (Must sum to 100%)"}
                      {expenseForm.splitType === "fixed" && "Enter Fixed Amounts (Must sum to total)"}
                      {expenseForm.splitType === "shares" && "Enter Share Weights (Whole numbers)"}
                    </h5>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {expenseForm.splitAmong.map((name) => (
                        <div key={name} className="flex items-center justify-between gap-4">
                          <span className="text-xs font-semibold text-slate-300">{name}</span>
                          <input
                            type="number"
                            required
                            min="0"
                            step={expenseForm.splitType === "shares" ? "1" : "0.01"}
                            value={expenseForm.splitValues[name] || ""}
                            onChange={(e) => setExpenseForm((prev) => ({ ...prev, splitValues: { ...prev.splitValues, [name]: e.target.value } }))}
                            className="w-32 bg-slate-950/50 border border-white/[0.06] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded px-2.5 py-1 text-slate-200 text-right text-xs outline-none font-mono"
                            placeholder={expenseForm.splitType === "percentage" ? "%" : expenseForm.splitType === "fixed" ? "$" : "Shares"}
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition-all duration-300 mt-2 text-sm cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Save Expense"}
                </motion.button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Reusable Sub-Components
// ═══════════════════════════════════════════════════════════════

function InputField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type={type}
          required={type !== "number"}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "0.01" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-950/50 border border-white/[0.06] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-3 pl-10 pr-4 text-slate-200 placeholder-slate-600 transition outline-none text-sm"
          placeholder={placeholder}
        />
      </div>
      {hint && <span className="text-[10px] text-slate-500 mt-1 block">{hint}</span>}
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      type="submit"
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-300 disabled:opacity-50 mt-2 text-sm cursor-pointer"
    >
      {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : label}
    </motion.button>
  );
}
