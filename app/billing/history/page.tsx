/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Loader2, Search,
  ChevronLeft, ChevronRight, FileText, Send, CheckCircle2, XCircle,
  TrendingUp, TrendingDown
} from "lucide-react";

type Transaction = {
  _id: string;
  type: string; // 'recharge' or 'usage'
  amount: number;
  description: string;
  status: string;
  createdAt: string;
  metadata?: {
    campaignName?: string;
    templateName?: string;
    phone?: string;
  };
};

type Summary = {
  totalRecharged: number;
  totalSpent: number;
  currentBalance: number;
};

const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount || 0);

export default function TransactionHistoryPage() {
  const { status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"recharge" | "usage">("recharge");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalRecharged: 0,
    totalSpent: 0,
    currentBalance: 0,
  });
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const itemsPerPage = 10;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchTransactions();
    }
  }, [status, activeTab, currentPage, searchTerm]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/user/transactions?type=${activeTab}&page=${currentPage}&limit=${itemsPerPage}&search=${searchTerm}`
      );
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions || []);
        setTotalPages(data.pagination?.totalPages || 1);
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    } catch (error) {
      console.error("Failed to fetch transactions", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: "recharge" | "usage") => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchTerm("");
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />

      <div className="md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-200 pb-4 sm:pb-6 gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Transaction History</h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">Track your recharges and campaign usage deductions.</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
              <Wallet className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-bold text-slate-700">All Transactions</span>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Current Balance</p>
                <p className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                  {formatINR(summary.currentBalance)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Total Recharged</p>
                <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1">
                  {formatINR(summary.totalRecharged)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Total Spent</p>
                <p className="text-xl sm:text-2xl font-extrabold text-red-600 mt-1">
                  {formatINR(summary.totalSpent)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-red-50">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </div>

          {/* Tabs & Search */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
              <button
                onClick={() => handleTabChange("recharge")}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "recharge" ? "bg-white shadow-sm text-emerald-700" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <ArrowDownCircle size={14} /> Recharge History
              </button>
              <button
                onClick={() => handleTabChange("usage")}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "usage" ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <ArrowUpCircle size={14} /> Campaigns & Usage
              </button>
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by name or amount..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <FileText className="w-12 h-12 mb-3 text-slate-200" />
                <p className="font-medium text-slate-500">No {activeTab === "recharge" ? "recharges" : "usage records"} found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</th>
                      <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx) => (
                      <tr key={tx._id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${activeTab === "recharge" ? "bg-emerald-50" : "bg-blue-50"}`}>
                              {activeTab === "recharge" ? (
                                <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Send className="w-4 h-4 text-blue-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900 text-sm">
                                {tx.description}
                              </p>
                              {tx.metadata?.campaignName && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Campaign: <span className="font-medium">{tx.metadata.campaignName}</span>
                                </p>
                              )}
                              {tx.metadata?.templateName && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Template: <span className="font-medium">{tx.metadata.templateName}</span>
                                </p>
                              )}
                              {tx.metadata?.phone && (
                                <p className="text-xs text-slate-400 font-mono mt-0.5">
                                  To: {tx.metadata.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {tx.status === "success" || tx.status === "completed" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <CheckCircle2 size={10} /> Success
                            </span>
                          ) : tx.status === "failed" || tx.status === "pending" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100">
                              <XCircle size={10} /> {tx.status}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 capitalize">{tx.status}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className={`font-bold text-sm ${activeTab === "recharge" ? "text-emerald-600" : "text-red-600"}`}>
                            {activeTab === "recharge" ? "+" : "-"} {formatINR(tx.amount)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && transactions.length > 0 && totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 p-4 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-sm font-bold text-slate-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
