/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2, Loader2, PhoneCall } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function OptNumbersPage() {
  const { status } = useSession();
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNumber, setNewNumber] = useState("");

  const loadNumbers = async () => {
    try {
      const res = await fetch("/api/opt-numbers");
      const data = await res.json();
      setNumbers(data.numbers || []);
    } catch (error) {
      console.error("Failed to load numbers", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") loadNumbers();
    if (status === "unauthenticated") window.location.href = "/signin";
  }, [status]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber.trim()) return;

    try {
      const res = await fetch("/api/opt-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: newNumber.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNumbers([data.optNumber, ...numbers]);
        setNewNumber("");
      } else {
        alert(data.error || "Failed to add number");
      }
    } catch (error) {
      alert("Failed to add number");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/opt-numbers/${id}`, { method: "DELETE" });
      setNumbers(numbers.filter(n => n._id !== id));
    } catch (error) {
      alert("Failed to delete number");
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-0 md:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4">
            <h1 className="text-xl font-bold text-gray-900">Opt-in Numbers</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage phone numbers collected via workflows or added manually.</p>
          </header>

          {/* Add Number Form */}
          <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex gap-2">
            <div className="relative flex-1">
              <PhoneCall size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="+1234567890"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
              />
            </div>
            <button type="submit" className="bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all flex items-center gap-2">
              <Plus size={16} /> Add Number
            </button>
          </form>

          {/* Numbers List */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {numbers.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <PhoneCall size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="font-semibold">No numbers yet</p>
                <p className="text-xs mt-1">Add numbers manually or connect an Opt-in Node in your workflows.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {numbers.map((num) => (
                  <li key={num._id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                        {num.phoneNumber.slice(-2)}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{num.phoneNumber}</span>
                    </div>
                    <button onClick={() => handleDelete(num._id)} className="text-gray-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
