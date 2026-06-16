"use client";

import {
  MessageSquare, Bot, Zap, BarChart3, Users, ShieldCheck,
  ArrowRight, CheckCircle, Star, Sparkles
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Home() {
  const handleCTA = () => toast.success("🚀 Redirecting to demo dashboard...");

  return (
    <div className="bg-gray-50 text-gray-900 font-sans overflow-hidden">
      
      {/* HERO SECTION */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-6 pt-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-50 via-gray-50 to-gray-50"></div>
        
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full text-sm mb-8 shadow-sm">
            <Sparkles className="w-4 h-4 text-green-500" />
            <span className="text-gray-600">Next Gen WhatsApp CRM Platform</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold leading-tight tracking-tight text-gray-900">
            Automate WhatsApp <br />
            <span className="bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
              Marketing with AI
            </span>
          </h1>

          <p className="text-gray-600 mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Manage leads, send campaigns, automate replies, and boost conversions
            using a powerful WhatsApp CRM built for modern businesses.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
            <button onClick={handleCTA} className="group flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-500/30 hover:bg-green-500 transition-all hover:scale-105">
              Get Started Free <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
            <button className="flex items-center justify-center gap-2 px-8 py-4 border border-gray-300 rounded-xl text-gray-700 bg-white hover:bg-gray-100 transition shadow-sm">
              Watch Demo
            </button>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900">Supercharge Your Growth</h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto">Everything you need to scale your customer communication.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="group bg-gray-50 border border-gray-100 p-8 rounded-2xl hover:shadow-xl transition-all duration-500 hover:-translate-y-2">
              <div className="p-3 bg-green-100 w-fit rounded-lg mb-4">
                <Bot className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">AI Chat Automation</h3>
              <p className="text-gray-500 mt-2 leading-relaxed">
                Auto-reply to customers using smart AI agents on WhatsApp 24/7.
              </p>
            </div>

            {/* Card 2 */}
            <div className="group bg-gray-50 border border-gray-100 p-8 rounded-2xl hover:shadow-xl transition-all duration-500 hover:-translate-y-2">
              <div className="p-3 bg-yellow-100 w-fit rounded-lg mb-4">
                <Zap className="w-8 h-8 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Bulk Campaigns</h3>
              <p className="text-gray-500 mt-2 leading-relaxed">
                Send marketing campaigns to thousands of users instantly.
              </p>
            </div>

            {/* Card 3 */}
            <div className="group bg-gray-50 border border-gray-100 p-8 rounded-2xl hover:shadow-xl transition-all duration-500 hover:-translate-y-2">
              <div className="p-3 bg-blue-100 w-fit rounded-lg mb-4">
                <BarChart3 className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Real-time Analytics</h3>
              <p className="text-gray-500 mt-2 leading-relaxed">
                Track open rates, conversions, and performance in real-time.
              </p>
            </div>

            {/* Card 4 */}
            <div className="group bg-gray-50 border border-gray-100 p-8 rounded-2xl hover:shadow-xl transition-all duration-500 hover:-translate-y-2">
              <div className="p-3 bg-purple-100 w-fit rounded-lg mb-4">
                <Users className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Team Collaboration</h3>
              <p className="text-gray-500 mt-2 leading-relaxed">
                Organize leads with your entire team in one CRM.
              </p>
            </div>

            {/* Card 5 */}
            <div className="group bg-gray-50 border border-gray-100 p-8 rounded-2xl hover:shadow-xl transition-all duration-500 hover:-translate-y-2">
              <div className="p-3 bg-pink-100 w-fit rounded-lg mb-4">
                <MessageSquare className="w-8 h-8 text-pink-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Official API Integration</h3>
              <p className="text-gray-500 mt-2 leading-relaxed">
                Direct Meta WhatsApp API integration for reliable messaging.
              </p>
            </div>

            {/* Card 6 */}
            <div className="group bg-gray-50 border border-gray-100 p-8 rounded-2xl hover:shadow-xl transition-all duration-500 hover:-translate-y-2">
              <div className="p-3 bg-red-100 w-fit rounded-lg mb-4">
                <ShieldCheck className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Enterprise Security</h3>
              <p className="text-gray-500 mt-2 leading-relaxed">
                Enterprise-grade security with encrypted messaging.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 text-center gap-16">
          <div>
            <h3 className="text-6xl font-bold text-gray-900">10M+</h3>
            <p className="text-green-600 mt-2 text-lg font-medium">Messages Sent</p>
            <p className="text-gray-400 text-sm mt-1">Monthly Volume</p>
          </div>
          <div>
            <h3 className="text-6xl font-bold text-gray-900">25K+</h3>
            <p className="text-green-600 mt-2 text-lg font-medium">Active Businesses</p>
            <p className="text-gray-400 text-sm mt-1">Globally</p>
          </div>
          <div>
            <h3 className="text-6xl font-bold text-gray-900">99.9%</h3>
            <p className="text-green-600 mt-2 text-lg font-medium">Uptime</p>
            <p className="text-gray-400 text-sm mt-1">Server Reliability</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-green-600 to-emerald-500 rounded-3xl p-12 text-center shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 left-0 w-40 h-40 bg-white opacity-10 rounded-full -translate-x-10 -translate-y-10"></div>
           <div className="absolute bottom-0 right-0 w-60 h-60 bg-black opacity-10 rounded-full translate-x-10 translate-y-10"></div>

           <div className="relative z-10">
            <h2 className="text-4xl font-bold text-white">
              Ready to Scale Your Business?
            </h2>
            <p className="mt-4 text-green-100 text-lg max-w-xl mx-auto">
              Join thousands of businesses using All Chat to automate their customer journeys.
            </p>
            <button
              onClick={handleCTA}
              className="mt-8 px-8 py-4 bg-white text-green-600 font-bold rounded-xl hover:bg-gray-100 transition shadow-lg inline-flex items-center gap-2 group"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
           </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-200 pt-16 pb-8 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} All Chat CRM. All rights reserved.
        </div>
      </footer>

      <ToastContainer position="bottom-right" autoClose={3000} theme="light" />
    </div>
  );
}