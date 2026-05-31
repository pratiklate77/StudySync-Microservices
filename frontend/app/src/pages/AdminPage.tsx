/* eslint-disable */
import React, { useEffect, useState, useCallback } from "react";
import { adminApi, getAdminServiceToken } from "../api/admin";
import type { AuditTrailEntry, VerificationRequest } from "../api/admin";
import { formatAuditAction, formatRelativeTime } from "../utils/displayName";
import {
  Shield,
  CheckCircle,
  XCircle,
  FileText,
  User,
  Users,
  Activity,
  Server,
  Database,
  Zap,
  Clock,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  Bell,
  LogOut,
  BookOpen,
  Calendar,
  Globe,
  RefreshCw,
  Eye,
  Search,
  Filter,
  ArrowUpRight,
  DollarSign,
} from "lucide-react";
import Swal from "sweetalert2";
import { useAuth } from "../context/AuthContext";

type AdminTab = "overview" | "verification" | "users" | "sessions" | "system";

const SERVICES = [
  { name: "Identity Service", port: 8000, color: "#6366f1", icon: User },
  { name: "Session Service", port: 8001, color: "#f59e0b", icon: Calendar },
  { name: "Group Service", port: 8002, color: "#3b82f6", icon: Users },
  { name: "Chat Service", port: 8003, color: "#8b5cf6", icon: Bell },
  { name: "Admin Service", port: 8004, color: "#10b981", icon: Shield },
  { name: "Payment Service", port: 8005, color: "#ec4899", icon: TrendingUp },
  {
    name: "Verification Service",
    port: 8006,
    color: "#f97316",
    icon: CheckCircle,
  },
  { name: "Notification Service", port: 8007, color: "#06b6d4", icon: Bell },
  { name: "Recommendation Svc", port: 8008, color: "#84cc16", icon: Zap },
  { name: "Vite SPA Frontend", port: 5173, color: "#a78bfa", icon: Globe },
  { name: "Node BFF Gateway", port: 3000, color: "#fb923c", icon: Server },
];

export const AdminPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [serviceStatuses, setServiceStatuses] = useState<
    Record<number, boolean>
  >({});
  const [checkingServices, setCheckingServices] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [adminSessionsList, setAdminSessionsList] = useState<any[]>([]);
  const [loadingAdminSessions, setLoadingAdminSessions] = useState(false);
  const [sessionHostCache, setSessionHostCache] = useState<
    Record<string, string>
  >({});
  const [auditEntries, setAuditEntries] = useState<AuditTrailEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [adminEarnings, setAdminEarnings] = useState<{ total_commission: number; total_payments: number; commission_rate: number; transactions: any[] } | null>(null);

  const fetchAdminSessions = useCallback(async () => {
    try {
      setLoadingAdminSessions(true);
      const data = await adminApi.getSessions();
      const sessions = Array.isArray(data) ? data : [];
      const resolved = await Promise.all(
        sessions.map(async (session) => {
          if (sessionHostCache[session.host_id]) {
            return { ...session, host_name: sessionHostCache[session.host_id] };
          }
          try {
            const res = await fetch(
              `http://localhost:3000/api/v1/auth/users/${session.host_id}`,
            );
            if (res.ok) {
              const user = await res.json();
              const name = user.full_name || user.name || user.email?.split("@")[0] || "Tutor";
              const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
              setSessionHostCache((prev) => ({ ...prev, [session.host_id]: capitalized }));
              return { ...session, host_name: capitalized };
            }
          } catch {
            // ignore
          }
          return { ...session, host_name: "Verified Tutor" };
        }),
      );
      setAdminSessionsList(resolved);
    } catch (e) {
      console.error("Error fetching admin sessions:", e);
    } finally {
      setLoadingAdminSessions(false);
    }
  }, [sessionHostCache]);

  const fetchStats = useCallback(async () => {
    try {
      const token = getAdminServiceToken();

      // Check if admin is authenticated
      if (!token) {
        console.warn("No admin token found. Admin must be logged in first.");
        setStats([]);
        return;
      }

      const data = await adminApi.getAnalyticsOverview();

      // Validate required fields exist
      if (!data) {
        console.error("Empty response from analytics endpoint");
        setStats([]);
        return;
      }

      const revenue = parseFloat(String(data.platform_revenue ?? 0)).toFixed(2);

      setStats([
        {
          label: "Total Users",
          value: String(data.total_users ?? 0),
          delta: `${data.total_tutors ?? 0} tutors · ${data.total_students ?? 0} students`,
          icon: Users,
          color: "text-brand-indigo",
        },
        {
          label: "Active Sessions",
          value: String(data.total_sessions ?? 0),
          delta: `${data.completed_sessions ?? 0} completed`,
          icon: Calendar,
          color: "text-brand-violet",
        },
        {
          label: "Study Groups",
          value: String(data.total_groups ?? 0),
          delta: "From group database",
          icon: BookOpen,
          color: "text-brand-emerald",
        },
        {
          label: "Pending Reviews",
          value: String(data.pending_verifications ?? 0),
          delta: "Needs attention",
          icon: Clock,
          color: "text-amber-400",
        },
        {
          label: "Platform Revenue",
          value: `$${revenue}`,
          delta: "10% commission earned",
          icon: DollarSign,
          color: "text-brand-rose",
        },
      ]);
    } catch (err: any) {
      console.error("Error fetching analytics stats:", {
        status: err?.status,
        detail: err?.detail,
        message: err?.message,
        fullError: err,
      });

      // Provide user feedback for common errors
      if (err?.status === 401 || err?.status === 403) {
        console.warn(
          "Unauthorized to view analytics. Check admin credentials.",
        );
      }

      setStats([]);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const data = await adminApi.getAllUsers();
      if (data && Array.isArray(data.users)) {
        setUsersList(data.users);
      } else {
        throw new Error("No users array");
      }
    } catch (err) {
      console.error("Error fetching users:", err);
      setUsersList([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      setLoadingQueue(true);
      const data = await adminApi.getVerificationRequests();
      const pendingItems = (data.items || []).filter(
        (r: any) => r.status === "PENDING" || r.status === "pending",
      );

      // Fetch details for each pending request to get documents
      const detailedRequests = await Promise.all(
        pendingItems.map(async (item: any) => {
          try {
            const detail = await adminApi.getVerificationDetail(item.id);
            // Fetch tutor profile from identity_service to get bio, hourly rate, and subjects
            let tutorProfile = null;
            try {
              const r = await fetch(`http://localhost:3000/api/v1/tutors/${item.user_id}`);
              if (r.ok) tutorProfile = await r.json();
            } catch (e) {
              console.log("Could not get tutor profile:", e);
            }
            return {
              ...item,
              documents: detail.documents || [],
              bio: tutorProfile?.bio || item.bio || "",
              subjects:
                tutorProfile?.expertise ||
                (item.subjects
                  ? typeof item.subjects === "string"
                    ? item.subjects.split(",").map((s: string) => s.trim())
                    : item.subjects
                  : []),
              hourly_rate: tutorProfile?.hourly_rate || item.hourly_rate || 0,
            };
          } catch (err) {
            return {
              ...item,
              documents: [],
            };
          }
        }),
      );
      setRequests(detailedRequests);
    } catch (err) {
      console.error("Error in fetchQueue:", err);
      setRequests([]);
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  const pingServices = async () => {
    setCheckingServices(true);
    try {
      const data = await adminApi.getServiceHealth();
      const results: Record<number, boolean> = {};
      data.services.forEach((s: any) => {
        results[s.port] = s.online;
      });
      setServiceStatuses(results);
    } catch {
      // Direct ping fallback if BFF endpoint is unavailable
      const results: Record<number, boolean> = {};
      await Promise.all(
        SERVICES.map(async (svc) => {
          try {
            const res = await fetch(`http://localhost:${svc.port}/health`, {
              signal: AbortSignal.timeout(1500),
            });
            results[svc.port] = res.ok;
          } catch {
            results[svc.port] = false;
          }
        }),
      );
      setServiceStatuses(results);
    } finally {
      setCheckingServices(false);
    }
  };

  const fetchAuditTrail = useCallback(async () => {
    try {
      setLoadingAudit(true);
      const data = await adminApi.getAuditTrail(10);
      setAuditEntries(data.actions ?? []);
    } catch (err) {
      console.error("Error fetching audit trail:", err);
      setAuditEntries([]);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  const fetchAdminEarnings = useCallback(async () => {
    try {
      const data = await adminApi.getAdminEarnings();
      setAdminEarnings(data);
    } catch {
      setAdminEarnings(null);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    fetchStats();
    fetchUsers();
    pingServices();
    fetchAdminSessions();
    fetchAuditTrail();
    fetchAdminEarnings();
  }, [fetchQueue, fetchStats, fetchUsers, fetchAdminSessions, fetchAuditTrail, fetchAdminEarnings]);

  const handleApprove = async (userId: string) => {
    const result = await Swal.fire({
      title: "Approve Tutor?",
      text: "This will verify the tutor and allow them to host paid sessions.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Verify & Approve",
      background: "#0d0d1a",
      color: "#f1f5f9",
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#1e293b",
    });
    if (result.isConfirmed) {
      try {
        await adminApi.approveTutor(userId);
        Swal.fire({
          title: "Tutor Verified!",
          icon: "success",
          background: "#0d0d1a",
          color: "#f1f5f9",
        });
        fetchQueue();
      } catch (err: any) {
        Swal.fire(
          "Approval Failed",
          err.detail || "Could not verify tutor.",
          "error",
        );
      }
    }
  };

  const handleReject = async (reqId: string) => {
    const { value: reason } = await Swal.fire({
      title: "Reject Application",
      input: "textarea",
      inputLabel: "Reason for rejection",
      inputPlaceholder: "e.g. Documents blurred, incorrect certificates...",
      showCancelButton: true,
      background: "#0d0d1a",
      color: "#f1f5f9",
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#1e293b",
    });
    if (reason) {
      try {
        await adminApi.rejectTutor(reqId, reason);
        Swal.fire({
          title: "Application Rejected",
          icon: "info",
          background: "#0d0d1a",
          color: "#f1f5f9",
        });
        fetchQueue();
      } catch (err: any) {
        Swal.fire(
          "Rejection Failed",
          err.detail || "Could not record rejection.",
          "error",
        );
      }
    }
  };

  const handleSuspend = async (userId: string) => {
    const result = await Swal.fire({
      title: "Suspend User?",
      text: "This will block the user from logging in or using the platform.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Suspend",
      background: "#0d0d1a",
      color: "#f1f5f9",
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#1e293b",
    });
    if (result.isConfirmed) {
      try {
        await adminApi.suspendUser(userId);
        Swal.fire({
          title: "User Suspended",
          icon: "success",
          background: "#0d0d1a",
          color: "#f1f5f9",
        });
        fetchUsers();
      } catch (err: any) {
        Swal.fire(
          "Suspension Failed",
          err.detail || "Could not suspend user.",
          "error",
        );
      }
    }
  };

  const handleActivate = async (userId: string) => {
    const result = await Swal.fire({
      title: "Activate User?",
      text: "This will restore the user access to the platform.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Activate",
      background: "#0d0d1a",
      color: "#f1f5f9",
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#1e293b",
    });
    if (result.isConfirmed) {
      try {
        await adminApi.activateUser(userId);
        Swal.fire({
          title: "User Activated",
          icon: "success",
          background: "#0d0d1a",
          color: "#f1f5f9",
        });
        fetchUsers();
      } catch (err: any) {
        Swal.fire(
          "Activation Failed",
          err.detail || "Could not activate user.",
          "error",
        );
      }
    }
  };

  const navItems: {
    id: AdminTab;
    label: string;
    icon: React.ElementType;
    badge?: number;
  }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    {
      id: "verification",
      label: "Verification",
      icon: Shield,
      badge: requests.length,
    },
    { id: "users", label: "Users", icon: Users },
    { id: "sessions", label: "Sessions", icon: Calendar },
    { id: "system", label: "System Health", icon: Activity },
  ];

  return (
    <div className="page-transition flex-1 flex min-h-screen bg-slate-950 overflow-hidden">
      {/* ── Left Sidebar ── */}
      <aside className="w-64 min-h-screen flex flex-col bg-[#0a0a14] border-r border-slate-900 shrink-0">
        {/* Admin Identity */}
        <div className="px-5 pt-8 pb-6 border-b border-slate-900">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg shadow-emerald-900/40">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-white tracking-tight">
                Admin Panel
              </p>
              <p className="text-[9px] text-emerald-400 uppercase font-bold tracking-widest">
                Super Administrator
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 p-2.5 bg-slate-900/60 rounded-xl">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xs font-extrabold text-slate-950">
              {user?.email?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">
                {user?.email}
              </p>
              <p className="text-[9px] text-slate-500 capitalize">
                {user?.role}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <span className="flex items-center space-x-3">
                  <Icon
                    className={`h-4 w-4 ${isActive ? "text-emerald-400" : ""}`}
                  />
                  <span>{item.label}</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="h-4.5 min-w-[18px] px-1 flex items-center justify-center rounded-full bg-amber-400 text-slate-950 text-[8px] font-extrabold">
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Logout button */}
        <div className="px-3 pb-6">
          <button
            onClick={logout}
            className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-brand-rose hover:bg-slate-900/60 transition-all"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 px-8 py-4 bg-slate-950/90 backdrop-blur border-b border-slate-900 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-white capitalize">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
            <p className="text-[10px] text-slate-500 mt-0.5">
              StudySync Administration Console
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live</span>
            </div>
          </div>
        </div>

        <div className="px-8 py-8 space-y-8">
          {/* ─── OVERVIEW TAB ─── */}
          {activeTab === "overview" && (
            <div className="space-y-8 animate-fadeIn">
              {/* Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                {stats.map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={idx}
                      className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <Icon className={`h-5 w-5 ${stat.color}`} />
                        <ArrowUpRight className="h-3.5 w-3.5 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-3xl font-extrabold text-white tracking-tight">
                          {stat.value}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium uppercase tracking-widest">
                          {stat.label}
                        </p>
                      </div>
                      <p className="text-[10px] text-emerald-400 font-semibold">
                        {stat.delta}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Pending Verification Alert */}
              {requests.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-amber-300">
                        {requests.length} Pending Tutor Verification
                        {requests.length > 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-amber-400/70 mt-0.5">
                        Applications are waiting for your review and approval.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("verification")}
                    className="flex items-center space-x-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold px-4 py-2 rounded-xl transition-all"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Review Now</span>
                  </button>
                </div>
              )}

              {/* Services Quick Overview */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-white flex items-center space-x-2">
                    <Server className="h-4 w-4 text-emerald-400" />
                    <span>Microservices Overview</span>
                  </h2>
                  <button
                    onClick={() => setActiveTab("system")}
                    className="text-[10px] text-brand-indigo hover:underline font-bold"
                  >
                    Full Health Check →
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {SERVICES.slice(0, 8).map((svc, idx) => {
                    const Icon = svc.icon;
                    const isOnline = serviceStatuses[svc.port];
                    const hasStatus = svc.port in serviceStatuses;
                    return (
                      <div
                        key={idx}
                        className="flex items-center space-x-2.5 p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/60"
                      >
                        <div
                          className="p-1.5 rounded-lg"
                          style={{ backgroundColor: `${svc.color}15` }}
                        >
                          <Icon
                            className="h-3.5 w-3.5"
                            style={{ color: svc.color }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold text-slate-300 truncate">
                            {svc.name}
                          </p>
                          <p className="text-[8px] text-slate-600 font-mono">
                            :{svc.port}
                          </p>
                        </div>
                        {hasStatus ? (
                          <span
                            className={`h-2 w-2 rounded-full flex-shrink-0 ${isOnline ? "bg-emerald-400" : "bg-red-400"}`}
                          />
                        ) : (
                          <span className="h-2 w-2 rounded-full flex-shrink-0 bg-slate-600" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Activity Feed */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-extrabold text-white flex items-center space-x-2">
                  <Activity className="h-4 w-4 text-brand-violet" />
                  <span>Recent System Activity</span>
                </h2>
                <div className="space-y-2">
                  {loadingAudit ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      Loading activity…
                    </p>
                  ) : auditEntries.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      No admin actions recorded yet.
                    </p>
                  ) : (
                    auditEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center space-x-3 py-2 border-b border-slate-800/50 last:border-b-0"
                      >
                        <span className="h-2 w-2 rounded-full flex-shrink-0 bg-brand-violet" />
                        <p className="flex-1 text-xs text-slate-300">
                          {formatAuditAction(entry.action, entry.target_type)}
                        </p>
                        <span className="text-[9px] text-slate-600 font-mono whitespace-nowrap">
                          {formatRelativeTime(entry.created_at)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Platform Earnings */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-white flex items-center space-x-2">
                    <DollarSign className="h-4 w-4 text-emerald-400" />
                    <span>Platform Earnings</span>
                  </h2>
                  {adminEarnings && (
                    <div className="flex items-center space-x-4 text-xs">
                      <span className="text-slate-500">{adminEarnings.commission_rate}% commission</span>
                      <span className="font-bold text-emerald-400">
                        Total: ${adminEarnings.total_commission.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                {!adminEarnings ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No payment data yet.</p>
                ) : adminEarnings.transactions.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No completed payments yet.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 text-[9px] uppercase font-bold text-slate-500 tracking-widest px-3 py-2 border-b border-slate-800">
                      <span className="col-span-2">Session</span>
                      <span>Amount</span>
                      <span>Commission</span>
                    </div>
                    {adminEarnings.transactions.map((tx, i) => (
                      <div key={i} className="grid grid-cols-4 items-center px-3 py-2 rounded-xl hover:bg-slate-800/30 transition-colors">
                        <span className="col-span-2 text-[10px] text-slate-400 font-mono truncate">{tx.session_id.substring(0, 16)}…</span>
                        <span className="text-xs font-semibold text-slate-300">${tx.amount.toFixed(2)}</span>
                        <span className="text-xs font-bold text-emerald-400">+${tx.commission.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── VERIFICATION TAB ─── */}
          {activeTab === "verification" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {requests.length === 0
                    ? "No pending applications."
                    : `${requests.length} application${requests.length > 1 ? "s" : ""} awaiting review.`}
                </p>
                <button
                  onClick={fetchQueue}
                  className="flex items-center space-x-2 text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl transition-all"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {loadingQueue ? (
                <div className="space-y-4 animate-pulse">
                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="h-48 bg-slate-900/60 rounded-2xl border border-slate-800"
                    />
                  ))}
                </div>
              ) : requests.length === 0 ? (
                <div className="py-24 text-center border border-slate-800 bg-slate-900/30 rounded-3xl space-y-3">
                  <CheckCircle className="h-12 w-12 text-emerald-400/30 mx-auto" />
                  <p className="text-slate-500 text-sm font-medium">
                    All caught up!
                  </p>
                  <p className="text-xs text-slate-600">
                    No tutor verification requests in the queue.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-5 hover:border-slate-700 transition-colors"
                    >
                      {/* Header Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="h-10 w-10 bg-brand-indigo/10 rounded-xl flex items-center justify-center">
                            <User className="h-5 w-5 text-brand-indigo" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">
                              Application #{req.id}
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                              UID: {req.user_id}
                            </p>
                          </div>
                        </div>
                        <span className="text-[9px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
                          ● Pending Review
                        </span>
                      </div>

                      {/* Bio */}
                      <div className="bg-slate-950/60 rounded-xl border border-slate-800/60 p-4 text-xs text-slate-300 italic leading-relaxed">
                        "{req.bio || "No bio provided"}"
                      </div>

                      {/* Subjects + Rate */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] uppercase font-bold text-slate-500 mr-1">
                          Expertise:
                        </span>
                        {req.subjects?.map((sub, i) => (
                          <span
                            key={i}
                            className="bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700 text-[10px] text-slate-300 font-semibold"
                          >
                            {sub}
                          </span>
                        ))}
                        <span className="ml-auto font-extrabold text-emerald-400 text-sm">
                          ${req.hourly_rate}/hr
                        </span>
                      </div>

                      {/* Documents */}
                      <div>
                        <p className="text-[9px] uppercase font-bold text-slate-500 mb-2">
                          Uploaded Documents
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {req.documents.map((doc, idx) => (
                            <a
                              key={idx}
                              href={`http://localhost:3000/api/v1/verification/documents/${doc.file_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-xl text-[10px] text-slate-300 transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5 text-slate-500" />
                              <span>
                                {doc.document_type}: {doc.file_name}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex space-x-3 pt-2 border-t border-slate-800">
                        <button
                          onClick={() => handleApprove(req.id)}
                          className="flex-1 flex items-center justify-center space-x-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/30 text-xs font-bold py-2.5 rounded-xl transition-all"
                        >
                          <CheckCircle className="h-4 w-4" />
                          <span>Approve & Verify</span>
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          className="flex-1 flex items-center justify-center space-x-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 text-xs font-bold py-2.5 rounded-xl transition-all"
                        >
                          <XCircle className="h-4 w-4" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── USERS TAB ─── */}
          {activeTab === "users" && (
            <div className="space-y-6 animate-fadeIn">
              {/* Search */}
              <div className="flex items-center space-x-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users by email or name..."
                    className="w-full bg-slate-900 border border-slate-800 focus:border-brand-indigo rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 outline-none transition-all"
                  />
                </div>
                <button className="flex items-center space-x-2 bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold px-4 py-2.5 rounded-xl hover:border-slate-700 transition-all">
                  <Filter className="h-3.5 w-3.5" />
                  <span>Filter</span>
                </button>
              </div>

              {/* Mock Users Table */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-6 text-[9px] uppercase font-bold text-slate-500 tracking-widest px-5 py-3 border-b border-slate-800 bg-slate-950/40">
                  <span className="col-span-2">User</span>
                  <span>Role</span>
                  <span>Joined</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {loadingUsers ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    <div className="h-6 w-6 border-2 border-brand-indigo border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading users from database...</span>
                  </div>
                ) : usersList.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    <span>No users found.</span>
                  </div>
                ) : (
                  usersList
                    .filter(
                      (u) =>
                        !searchQuery ||
                        (u.full_name || u.name || "")
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase()) ||
                        u.email.includes(searchQuery),
                    )
                    .map((u, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-6 items-center px-5 py-3.5 border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/20 transition-colors"
                      >
                        <div className="col-span-2 flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-indigo to-brand-violet flex items-center justify-center text-[10px] font-extrabold text-white shrink-0">
                            {(u.full_name ||
                              u.name ||
                              u.email ||
                              "U")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-200">
                              {u.full_name || u.name || "StudySync User"}
                            </p>
                            <p className="text-[9px] text-slate-500">
                              {u.email}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full w-fit ${
                            u.role === "admin"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : u.role === "tutor"
                                ? "bg-violet-500/10 text-brand-violet"
                                : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {u.role}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {u.created_at
                            ? new Date(u.created_at).toLocaleDateString(
                                undefined,
                                { month: "short", year: "numeric" },
                              )
                            : "Mar 2026"}
                        </span>
                        <span
                          className={`text-[9px] font-bold ${u.is_active !== false ? "text-emerald-400" : "text-rose-400"}`}
                        >
                          ● {u.is_active !== false ? "Active" : "Suspended"}
                        </span>
                        <div className="flex items-center space-x-2">
                          {u.role !== "admin" &&
                            u.email !== "admin@studysync.com" &&
                            (u.is_active !== false ? (
                              <button
                                onClick={() => handleSuspend(u.id)}
                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 hover:border-transparent text-[9px] font-bold transition-all"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivate(u.id)}
                                className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/20 hover:border-transparent text-[9px] font-bold transition-all"
                              >
                                Activate
                              </button>
                            ))}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* ─── SESSIONS TAB ─── */}
          {activeTab === "sessions" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  {
                    label: "Total Sessions",
                    value: String(adminSessionsList.length),
                    icon: Calendar,
                    color: "text-brand-violet",
                  },
                  {
                    label: "Free Sessions",
                    value: String(
                      adminSessionsList.filter(
                        (s) => (s.session_type || s.type) === "free",
                      ).length,
                    ),
                    icon: Users,
                    color: "text-emerald-400",
                  },
                  {
                    label: "Paid Sessions",
                    value: String(
                      adminSessionsList.filter(
                        (s) => (s.session_type || s.type) === "paid",
                      ).length,
                    ),
                    icon: TrendingUp,
                    color: "text-brand-rose",
                  },
                ].map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={i}
                      className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex items-center space-x-4"
                    >
                      <Icon className={`h-8 w-8 ${s.color}`} />
                      <div>
                        <p className="text-2xl font-extrabold text-white">
                          {s.value}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                          {s.label}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    Recently Created Sessions
                  </h3>
                  <button
                    onClick={fetchAdminSessions}
                    disabled={loadingAdminSessions}
                    className="flex items-center space-x-2 text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl transition-all"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loadingAdminSessions ? "animate-spin" : ""}`}
                    />
                    <span>Refresh</span>
                  </button>
                </div>

                {loadingAdminSessions ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    <div className="h-6 w-6 border-2 border-brand-indigo border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading platform sessions...</span>
                  </div>
                ) : adminSessionsList.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs bg-slate-950/20 border border-slate-850 rounded-2xl">
                    <span>
                      No study sessions scheduled yet on the platform.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {adminSessionsList.map((s, i) => {
                      const sessionType = s.session_type || s.type || "free";
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3.5 bg-slate-950/40 rounded-xl border border-slate-800/60 hover:border-slate-700 transition-colors animate-fadeIn"
                        >
                          <div className="flex items-center space-x-3">
                            <span
                              className={`text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                sessionType === "paid"
                                  ? "bg-brand-rose/10 text-brand-rose border border-brand-rose/20"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              }`}
                            >
                              {sessionType}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">
                                {s.title}
                              </p>
                              <p className="text-[9px] text-slate-500">
                                By {s.host_name || "Verified Tutor"}
                              </p>
                              {s.address && (
                                <p className="text-[8px] text-slate-600 mt-0.5 font-mono">
                                  Location: {s.address}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-500">
                              {new Date(
                                s.scheduled_time || s.schedule,
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            <p className="text-[9px] text-slate-600">
                              {s.participant_count ??
                                (s.participants?.length || 0)}{" "}
                              joined
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── SYSTEM HEALTH TAB ─── */}
          {activeTab === "system" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Live status of all StudySync microservices.
                </p>
                <button
                  onClick={pingServices}
                  disabled={checkingServices}
                  className="flex items-center space-x-2 bg-brand-indigo/10 hover:bg-brand-indigo text-brand-indigo hover:text-white border border-brand-indigo/30 text-xs font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${checkingServices ? "animate-spin" : ""}`}
                  />
                  <span>
                    {checkingServices ? "Pinging..." : "Ping All Services"}
                  </span>
                </button>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SERVICES.map((svc, idx) => {
                  const Icon = svc.icon;
                  const isOnline = serviceStatuses[svc.port];
                  const hasStatus = svc.port in serviceStatuses;
                  return (
                    <div
                      key={idx}
                      className={`bg-slate-900/50 border rounded-2xl p-5 space-y-4 transition-colors ${
                        hasStatus
                          ? isOnline
                            ? "border-emerald-500/20"
                            : "border-rose-500/20"
                          : "border-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div
                            className="p-2 rounded-xl"
                            style={{ backgroundColor: `${svc.color}15` }}
                          >
                            <Icon
                              className="h-4 w-4"
                              style={{ color: svc.color }}
                            />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-200">
                              {svc.name}
                            </p>
                            <p className="text-[9px] text-slate-600 font-mono">
                              localhost:{svc.port}
                            </p>
                          </div>
                        </div>
                        {hasStatus ? (
                          <span
                            className={`inline-flex items-center space-x-1.5 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                              isOnline
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`}
                            />
                            <span>{isOnline ? "Online" : "Offline"}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                            <span>Unknown</span>
                          </span>
                        )}
                      </div>

                      {/* Fake uptime bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] text-slate-600">
                          <span>30-day uptime</span>
                          <span
                            className={
                              hasStatus
                                ? isOnline
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                                : "text-slate-600"
                            }
                          >
                            {hasStatus ? (isOnline ? "99.8%" : "Down") : "—"}
                          </span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${hasStatus ? (isOnline ? "bg-emerald-400" : "bg-rose-400") : "bg-slate-700"}`}
                            style={{
                              width: hasStatus
                                ? isOnline
                                  ? "99.8%"
                                  : "0%"
                                : "0%",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Docker tip */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex items-start space-x-3">
                <Database className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-300">
                    Docker Compose Live Logs
                  </p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Run{" "}
                    <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono">
                      docker-compose logs -f
                    </code>{" "}
                    in the backend directory to stream live microservice logs in
                    real time.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminPage;
