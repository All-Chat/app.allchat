"use client";

import { useState } from "react";
import {
  Zap, BarChart3, Users, Bot, ShieldCheck,
  Check, ArrowRight, Star, Send, Paperclip, Phone,
  Video, MoreVertical, ChevronDown, Sparkles,
  Clock, TrendingUp, Inbox, Plug, Quote,
} from "lucide-react";

/* =================================================================
   HERO
================================================================= */
function Hero() {
  return (
    <section className="relative pt-24 pb-20 lg:pt-28 lg:pb-24 overflow-hidden">
      {/* Enhanced Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-0 w-[400px] h-[400px] lg:w-[600px] lg:h-[600px] bg-[#25D366]/10 rounded-full blur-[100px] lg:blur-[120px] -translate-y-1/4 -translate-x-1/4" />
        <div className="absolute top-1/4 right-0 w-[300px] h-[300px] lg:w-[500px] lg:h-[500px] bg-[#128C7E]/10 rounded-full blur-[100px] lg:blur-[120px] translate-x-1/4" />
        <div className="absolute inset-0 dot-grid opacity-20 lg:opacity-30" />
        {/* Fade out at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FBFBF8]/50 to-[#FBFBF8]" />
      </div>

      <div className="max-w-7xl mx-auto px-5 lg:px-8 grid lg:grid-cols-2 gap-16 lg:gap-8 items-center">
        {/* Left copy */}
        <div className="animate-fade-up text-center lg:text-left">
          {/* Enhanced Badge */}
          <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-[#E8EDE9] rounded-full pl-2 pr-3 py-1.5 mb-6 shadow-soft">
            <span className="flex items-center gap-1.5 bg-[#F0FBF4] rounded-full px-2.5 py-0.5 text-[10px] font-bold text-[#075E54] uppercase tracking-wide">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-[#25D366] opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-[#25D366]" />
              </span>
              New
            </span>
            <span className="text-[11px] sm:text-xs font-semibold text-[#3D504A]">
              AI-powered chatbot builder is live
            </span>
          </div>

          {/* Headline with SVG underline */}
          <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-extrabold leading-[1.1] tracking-tight text-[#0B1F1A]">
            WhatsApp marketing
            <br className="hidden sm:block" />
            on{" "}
            <span className="relative inline-block">
              <span className="text-gradient">autopilot</span>
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none" preserveAspectRatio="none">
                <path d="M2 10C70 4 230 4 298 10" stroke="#25D366" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
          </h1>

          <p className="mt-7 text-base sm:text-lg text-[#5C6B66] leading-relaxed max-w-xl mx-auto lg:mx-0">
            Broadcast campaigns, automate conversations, and manage a shared team
            inbox — all from one powerful, beautifully designed WhatsApp platform.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-sm sm:max-w-none mx-auto lg:mx-0">
            <a
              href="https://app.allchat.in/"
              className="group inline-flex items-center justify-center gap-2 bg-[#075E54] hover:bg-[#0B1F1A] text-white font-semibold px-7 py-3.5 rounded-full transition shadow-soft hover:shadow-glow"
            >
              Access Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-[#F0FBF4] text-[#075E54] font-semibold px-7 py-3.5 rounded-full border border-[#E8EDE9] transition"
            >
              <Phone className="w-4 h-4" />
              Book a demo
            </a>
          </div>

          {/* Social Proof */}
          <div className="mt-8 flex items-center justify-center lg:justify-start gap-4">
            <div className="flex -space-x-2.5">
              {["A", "B", "C", "D"].map((i) => (
                <div key={i} className="w-9 h-9 rounded-full border-2 border-[#FBFBF8] bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {i}
                </div>
              ))}
            </div>
            <div className="text-left">
              <div className="flex gap-0.5 mb-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-[#FEBC2E] text-[#FEBC2E]" />
                ))}
              </div>
              <p className="text-xs text-[#5C6B66] font-medium">
                Loved by 10,000+ modern teams
              </p>
            </div>
          </div>
        </div>

        {/* Right phone mockup */}
        <div className="relative flex justify-center lg:justify-end animate-fade-up mt-8 lg:mt-0" style={{ animationDelay: ".15s" }}>
          {/* Floating stat card top */}
          <div className="absolute top-4 -left-2 sm:left-4 lg:-left-8 z-20 bg-white/90 backdrop-blur-md rounded-xl sm:rounded-2xl shadow-card p-3 sm:p-4 border border-white/60 animate-float">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#F0FBF4] flex items-center justify-center border border-[#DCF8C6] flex-shrink-0">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-[#25D366]" />
              </div>
              <div>
                <p className="text-[10px] sm:text-[11px] text-[#5C6B66] font-medium">Open rate</p>
                <p className="text-sm sm:text-base font-extrabold text-[#0B1F1A]">98.3%</p>
              </div>
            </div>
          </div>

          {/* Floating stat card bottom */}
          <div className="absolute bottom-12 -right-2 sm:right-0 lg:-right-6 z-20 bg-white/90 backdrop-blur-md rounded-xl sm:rounded-2xl shadow-card p-3 sm:p-4 border border-white/60 animate-float-slow">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#E8F5F1] flex items-center justify-center border border-[#C2D4CD] flex-shrink-0">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-[#128C7E]" />
              </div>
              <div>
                <p className="text-[10px] sm:text-[11px] text-[#5C6B66] font-medium">Messages today</p>
                <p className="text-sm sm:text-base font-extrabold text-[#0B1F1A]">12,847</p>
              </div>
            </div>
          </div>

          {/* Phone frame */}
          <div className="relative w-[280px] h-[560px] sm:w-[300px] sm:h-[600px] bg-[#0B1F1A] rounded-[2.5rem] sm:rounded-[2.75rem] p-2.5 sm:p-3 shadow-2xl border-[3px] sm:border-[4px] border-[#1C2E2A]">
            {/* Notch */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 sm:w-28 h-5 sm:h-6 bg-[#0B1F1A] rounded-b-2xl z-10" />

            <div className="w-full h-full bg-[#E5DDD5] rounded-[1.8rem] sm:rounded-[2rem] overflow-hidden flex flex-col">
              {/* Chat header */}
              <div className="bg-[#075E54] text-white px-3 sm:px-4 pt-6 sm:pt-8 pb-3 flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 flex items-center justify-center text-xs sm:text-sm font-bold backdrop-blur-sm flex-shrink-0">
                  AC
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold truncate">AllChat Store</p>
                  <p className="text-[10px] sm:text-[11px] text-white/70 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                    Online
                  </p>
                </div>
                <Video className="w-4 h-4 sm:w-4.5 sm:h-4.5 opacity-80" />
                <Phone className="w-4 h-4 opacity-80" />
                <MoreVertical className="w-4 h-4 opacity-80" />
              </div>

              {/* Messages */}
              <div className="flex-1 p-3 space-y-3 overflow-hidden relative">
                {/* Subtle pattern overlay */}
                <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(#0B1F1A 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
                
                {/* Date pill */}
                <div className="flex justify-center relative z-10">
                  <span className="text-[9px] sm:text-[10px] bg-white/80 backdrop-blur-sm text-[#5C6B66] px-2.5 py-1 rounded-full font-medium shadow-sm">
                    Today
                  </span>
                </div>

                {/* Received */}
                <div className="max-w-[80%] relative z-10">
                  <div className="bg-white rounded-2xl rounded-tl-sm px-3 sm:px-3.5 py-2 sm:py-2.5 shadow-sm">
                    <p className="text-[12px] sm:text-[13px] text-[#0B1F1A]">
                      Hi! I saw your flash sale 👀 Is the 40% off still available?
                    </p>
                  </div>
                  <p className="text-[8px] sm:text-[9px] text-[#8A9994] mt-1 ml-2 font-medium">9:41 AM</p>
                </div>

                {/* Sent (bot reply) */}
                <div className="max-w-[85%] ml-auto relative z-10">
                  <div className="bg-[#DCF8C6] rounded-2xl rounded-tr-sm px-3 sm:px-3.5 py-2 sm:py-2.5 shadow-sm">
                    <p className="text-[12px] sm:text-[13px] text-[#0B1F1A]">
                      Yes! 🎉 The sale runs until midnight. Here&apos;s your exclusive link:
                    </p>
                    <div className="mt-2 bg-[#25D366]/15 rounded-lg p-2 border border-[#25D366]/20">
                      <p className="text-[10px] sm:text-[11px] font-bold text-[#075E54] flex items-center gap-1">
                        🔗 AllChat.store/sale
                      </p>
                    </div>
                  </div>
                  <p className="text-[8px] sm:text-[9px] text-[#8A9994] mt-1 mr-2 text-right flex items-center justify-end gap-1 font-medium">
                    9:41 AM <Check className="w-3 h-3 text-[#53BDEB]" strokeWidth={3} />
                  </p>
                </div>

                {/* Received 2 */}
                <div className="max-w-[60%] relative z-10">
                  <div className="bg-white rounded-2xl rounded-tl-sm px-3 sm:px-3.5 py-2 sm:py-2.5 shadow-sm">
                    <p className="text-[12px] sm:text-[13px] text-[#0B1F1A]">
                      Perfect, ordering now! 💚
                    </p>
                  </div>
                  <p className="text-[8px] sm:text-[9px] text-[#8A9994] mt-1 ml-2 font-medium">9:42 AM</p>
                </div>

                {/* Typing indicator */}
                <div className="max-w-[40%] relative z-10">
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3.5 shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#8A9994]" style={{ animation: "typing 1.4s infinite", animationDelay: "0s" }} />
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#8A9994]" style={{ animation: "typing 1.4s infinite", animationDelay: ".2s" }} />
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#8A9994]" style={{ animation: "typing 1.4s infinite", animationDelay: ".4s" }} />
                  </div>
                </div>
              </div>

              {/* Input bar */}
              <div className="bg-[#F0F0F0] px-3 py-2.5 flex items-center gap-2">
                <div className="flex-1 bg-white rounded-full px-4 py-2 flex items-center gap-2 shadow-sm">
                  <span className="text-[10px] sm:text-[11px] text-[#8A9994] flex-1 font-medium">Type a message</span>
                  <Paperclip className="w-3.5 h-3.5 text-[#8A9994]" />
                </div>
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#25D366] flex items-center justify-center pulse-ring shadow-md flex-shrink-0">
                  <Send className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   LOGO CLOUD
================================================================= */
function LogoCloud() {
  const companies = ["Northwind", "Acme Co", "Globex", "Stark", "Wayne", "Umbrella"];
  return (
    <section className="py-10 sm:py-12 border-y border-[#E8EDE9] bg-white/50">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <p className="text-center text-xs sm:text-sm font-medium text-[#5C6B66] mb-6 sm:mb-8">
          Trusted by teams worldwide to power their WhatsApp growth
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 sm:gap-x-12 gap-y-4 sm:gap-y-6">
          {companies.map((c) => (
            <span
              key={c}
              className="text-base sm:text-xl font-bold text-[#9AAAA4] hover:text-[#075E54] transition cursor-default"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   FEATURES
================================================================= */
function Features() {
  const features = [
    {
      icon: Zap,
      title: "Broadcast Campaigns",
      desc: "Send personalized bulk messages to thousands of contacts at once with smart segmentation and scheduling.",
      color: "#25D366",
      bg: "#F0FBF4",
    },
    {
      icon: Bot,
      title: "No-Code Chatbot Builder",
      desc: "Drag-and-drop conversation flows that qualify leads, answer FAQs, and collect orders 24/7 — no developers needed.",
      color: "#128C7E",
      bg: "#E8F5F1",
    },
    {
      icon: Inbox,
      title: "Shared Team Inbox",
      desc: "Multiple agents, one number. Assign chats, leave internal notes, and never miss a customer message again.",
      color: "#075E54",
      bg: "#E0EDEA",
    },
    {
      icon: BarChart3,
      title: "Analytics Dashboard",
      desc: "Track delivery rates, open rates, click-throughs, and revenue in real-time. Export reports in one click.",
      color: "#25D366",
      bg: "#F0FBF4",
    },
    {
      icon: Users,
      title: "Contact CRM",
      desc: "Tag, segment, and manage contacts with custom fields. Sync with HubSpot, Salesforce, or your own API.",
      color: "#128C7E",
      bg: "#E8F5F1",
    },
    {
      icon: ShieldCheck,
      title: "Official WhatsApp API",
      desc: "Meta-verified Business API with green tick verification. Enterprise-grade security and 99.9% uptime SLA.",
      color: "#075E54",
      bg: "#E0EDEA",
    },
  ];

  return (
    <section id="features" className="py-20 sm:py-24 lg:py-32 relative">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-12 sm:mb-16">
          <span className="inline-block text-xs font-bold tracking-wider uppercase text-[#25D366] bg-[#F0FBF4] px-3 py-1.5 rounded-full mb-4">
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
            Everything you need to
            <br />
            <span className="text-gradient">grow on WhatsApp</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[#5C6B66]">
            One platform for campaigns, automation, support, and analytics. Built
            for teams that move fast.
          </p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group bg-white rounded-2xl p-6 sm:p-7 border border-[#E8EDE9] shadow-card hover:shadow-glow hover:-translate-y-1 transition-all duration-300"
              style={{ animationDelay: `${i * .05}s` }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition"
                style={{ background: f.bg }}
              >
                <f.icon className="w-6 h-6" style={{ color: f.color }} strokeWidth={2} />
              </div>
              <h3 className="text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-[#5C6B66] leading-relaxed">{f.desc}</p>
              <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#075E54] opacity-0 group-hover:opacity-100 transition">
                Learn more <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   HOW IT WORKS
================================================================= */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      icon: Plug,
      title: "Connect your number",
      desc: "Link your WhatsApp Business number in under 60 seconds. Get verified with Meta's official API.",
    },
    {
      n: "02",
      icon: Sparkles,
      title: "Build your flow",
      desc: "Design campaigns and chatbot conversations with our drag-and-drop builder. No code, no friction.",
    },
    {
      n: "03",
      icon: TrendingUp,
      title: "Launch & scale",
      desc: "Hit send and watch the analytics roll in. Optimize, iterate, and grow your revenue on autopilot.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 sm:py-24 lg:py-32 bg-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 bg-[#25D366]/5 rounded-full blur-3xl hidden sm:block" />

      <div className="max-w-7xl mx-auto px-5 lg:px-8 relative">
        <div className="max-w-2xl mb-12 sm:mb-16 text-center sm:text-left">
          <span className="inline-block text-xs font-bold tracking-wider uppercase text-[#25D366] bg-[#F0FBF4] px-3 py-1.5 rounded-full mb-4">
            How it works
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
            Up and running in
            <br />
            <span className="text-gradient">three simple steps</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 lg:gap-6 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-[#25D366]/30 via-[#128C7E]/30 to-[#075E54]/30" />

          {steps.map((s) => (
            <div key={s.n} className="relative bg-[#FBFBF8] rounded-2xl p-6 sm:p-8 border border-[#E8EDE9] hover:border-[#25D366]/30 transition">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white shadow-soft relative z-10">
                  <s.icon className="w-5 h-5" />
                </div>
                <span className="text-4xl font-extrabold text-[#E8EDE9]">{s.n}</span>
              </div>
              <h3 className="text-xl font-bold mb-2.5">{s.title}</h3>
              <p className="text-[#5C6B66] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   STATS
================================================================= */
function Stats() {
  const stats = [
    { value: "500M+", label: "Messages sent" },
    { value: "98%", label: "Average open rate" },
    { value: "4.9/5", label: "User rating" },
    { value: "99.9%", label: "Uptime SLA" },
  ];
  return (
    <section className="py-16 sm:py-20 bg-gradient-to-br from-[#075E54] via-[#0B6B5E] to-[#128C7E] relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-10" />
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#25D366]/20 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-5 lg:px-8 relative">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12">
          {stats.map((s) => (
            <div key={s.label} className="text-center text-white">
              <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-1">{s.value}</p>
              <p className="text-xs sm:text-sm text-white/70 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   SHOWCASE
================================================================= */
function Showcase() {
  return (
    <section className="py-20 sm:py-24 lg:py-32 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Left: visual */}
        <div className="relative mb-8 lg:mb-0">
          <div className="bg-white rounded-3xl shadow-card border border-[#E8EDE9] p-4 sm:p-6 overflow-hidden">
            {/* Mock dashboard */}
            <div className="flex items-center gap-2 mb-5">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#FF5F57]" />
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#FEBC2E]" />
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#28C840]" />
              <div className="ml-2 sm:ml-3 text-[10px] sm:text-xs text-[#8A9994] font-medium hidden xs:block sm:block">AllChat.app/dashboard</div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              {[
                { label: "Sent", value: "48.2K", color: "#075E54" },
                { label: "Opened", value: "47.3K", color: "#128C7E" },
                { label: "Replied", value: "31.1K", color: "#25D366" },
              ].map((c) => (
                <div key={c.label} className="bg-[#FBFBF8] rounded-lg sm:rounded-xl p-2.5 sm:p-3.5 border border-[#F0F4F1]">
                  <p className="text-[10px] sm:text-[11px] text-[#5C6B66] mb-1">{c.label}</p>
                  <p className="text-sm sm:text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* Bar chart mock */}
            <div className="bg-[#FBFBF8] rounded-lg sm:rounded-xl p-4 border border-[#F0F4F1]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs sm:text-sm font-semibold">Campaign performance</p>
                <span className="text-[10px] sm:text-xs text-[#25D366] font-semibold flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> +24.5%
                </span>
              </div>
              <div className="flex items-end justify-between gap-1 sm:gap-2 h-24 sm:h-32">
                {[45, 62, 38, 78, 55, 90, 70, 85, 60, 95, 72, 88].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-md bg-gradient-to-t from-[#25D366] to-[#128C7E] hover:opacity-80 transition"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Floating badge */}
          <div className="absolute -bottom-5 right-2 sm:right-5 bg-white rounded-xl sm:rounded-2xl shadow-card border border-[#E8EDE9] p-3 sm:p-4 animate-float max-w-[180px] sm:max-w-[200px]">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold">+312% ROI</p>
                <p className="text-[10px] sm:text-xs text-[#5C6B66]">vs. email marketing</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: copy */}
        <div className="text-center lg:text-left">
          <span className="inline-block text-xs font-bold tracking-wider uppercase text-[#25D366] bg-[#F0FBF4] px-3 py-1.5 rounded-full mb-4">
            Analytics
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
            See exactly what&apos;s
            <br />
            <span className="text-gradient">working</span> — in real time
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[#5C6B66] leading-relaxed">
            Stop guessing. AllChat gives you live dashboards for every campaign,
            chatbot flow, and agent conversation. Make data-driven decisions and
            10x your WhatsApp ROI.
          </p>

          <ul className="mt-7 space-y-3.5 text-left max-w-md mx-auto lg:mx-0">
            {[
              "Real-time delivery, open, and reply tracking",
              "Revenue attribution per campaign",
              "Agent performance leaderboard",
              "A/B test templates and auto-pick winners",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" strokeWidth={4} />
                </div>
                <span className="text-sm sm:text-base text-[#3D504A] font-medium">{item}</span>
              </li>
            ))}
          </ul>

          <a
            href="#cta"
            className="mt-8 inline-flex items-center gap-2 text-[#075E54] font-semibold hover:gap-3 transition-all"
          >
            Explore the dashboard
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   TESTIMONIALS
================================================================= */
function Testimonials() {
  const reviews = [
    {
      quote:
        "We switched from email to AllChat for our flash sales and saw a 7x increase in conversions. The broadcast feature alone pays for itself every single month.",
      name: "Sarah Chen",
      role: "Head of Growth, Northwind Retail",
      avatar: "SC",
      rating: 5,
    },
    {
      quote:
        "The chatbot builder is incredible. We automated 80% of customer support tickets without writing a single line of code. Our CSAT score went from 3.2 to 4.8.",
      name: "Marcus Okoye",
      role: "COO, Globex Logistics",
      avatar: "MO",
      rating: 5,
    },
    {
      quote:
        "As a D2C brand, WhatsApp is our #1 channel now. AllChat's analytics let us see exactly which campaigns drive revenue. It's a no-brainer.",
      name: "Priya Nair",
      role: "Founder, Bloom Skincare",
      avatar: "PN",
      rating: 5,
    },
  ];

  return (
    <section id="reviews" className="py-20 sm:py-24 lg:py-32 bg-white relative">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-12 sm:mb-16">
          <span className="inline-block text-xs font-bold tracking-wider uppercase text-[#25D366] bg-[#F0FBF4] px-3 py-1.5 rounded-full mb-4">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
            Loved by teams
            <br />
            <span className="text-gradient">big and small</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((r) => (
            <div
              key={r.name}
              className="bg-[#FBFBF8] rounded-2xl p-6 sm:p-7 border border-[#E8EDE9] hover:shadow-card transition flex flex-col"
            >
              <Quote className="w-8 h-8 text-[#25D366]/30 mb-4" />
              <div className="flex gap-1 mb-4">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-[#FEBC2E] text-[#FEBC2E]" />
                ))}
              </div>
              <p className="text-sm sm:text-base text-[#3D504A] leading-relaxed flex-1">&quot;{r.quote}&quot;</p>
              <div className="mt-6 pt-5 border-t border-[#E8EDE9] flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {r.avatar}
                </div>
                <div>
                  <p className="text-sm font-bold">{r.name}</p>
                  <p className="text-xs text-[#5C6B66]">{r.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   FAQ
================================================================= */
function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const faqs = [
    {
      q: "Do I need a WhatsApp Business account?",
      a: "You need a WhatsApp Business number, but we handle the entire setup and Meta verification process for you. Most accounts are approved within 24–48 hours.",
    },
    {
      q: "Is AllChat an official WhatsApp partner?",
      a: "Yes. We're a Meta-verified Business Solution Provider (BSP) with direct access to the official WhatsApp Business API. Your account is secure and compliant.",
    },
    {
      q: "Can I migrate from another WhatsApp tool?",
      a: "Absolutely. Our team will help you migrate contacts, templates, and chatbot flows from any platform — usually within 1–2 business days at no extra cost.",
    },
    {
      q: "What integrations are available?",
      a: "We integrate natively with HubSpot, Salesforce, Shopify, Zapier, Google Sheets, and more. You also get full API access to build custom workflows.",
    },
  ];

  return (
    <section id="faq" className="py-20 sm:py-24 lg:py-32 bg-white">
      <div className="max-w-3xl mx-auto px-5 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <span className="inline-block text-xs font-bold tracking-wider uppercase text-[#25D366] bg-[#F0FBF4] px-3 py-1.5 rounded-full mb-4">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
            Questions? <span className="text-gradient">Answered.</span>
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div
              key={i}
              className={`rounded-2xl border transition overflow-hidden ${
                open === i ? "border-[#25D366]/40 bg-[#FBFBF8] shadow-soft" : "border-[#E8EDE9] bg-white"
              }`}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-4 text-left"
              >
                <span className="text-sm sm:text-base font-semibold text-[#0B1F1A]">{f.q}</span>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition ${
                  open === i ? "bg-[#25D366] text-white" : "bg-[#F0FBF4] text-[#075E54]"
                }`}>
                  <ChevronDown className={`w-4 h-4 transition-transform ${open === i ? "rotate-180" : ""}`} />
                </div>
              </button>
              <div
                className={`grid transition-all duration-300 ${
                  open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="px-4 sm:px-6 pb-5 text-sm sm:text-base text-[#5C6B66] leading-relaxed">{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   CTA
================================================================= */
function CTA() {
  return (
    <section id="cta" className="py-16 sm:py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-5 lg:px-8">
        <div className="relative rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden bg-gradient-to-br from-[#075E54] via-[#0B6B5E] to-[#128C7E] px-6 py-12 sm:px-8 sm:py-16 lg:px-16 lg:py-20 text-center">
          {/* Decorative */}
          <div className="absolute inset-0 dot-grid opacity-10" />
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-[#25D366]/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-[#25D366]/20 rounded-full blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 mb-6 border border-white/15">
              <Clock className="w-3.5 h-3.5 text-[#25D366]" />
              <span className="text-xs font-semibold text-white">Setup in under 5 minutes</span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Ready to turn WhatsApp
              <br />
              into your #1 revenue channel?
            </h2>

            <p className="mt-5 text-base sm:text-lg text-white/70 max-w-xl mx-auto">
              Join leading businesses growing with AllChat. Access your dashboard 
              and start automating your WhatsApp marketing today.
            </p>

            <div className="mt-8 sm:mt-9 flex flex-col sm:flex-row gap-3 justify-center max-w-sm sm:max-w-none mx-auto">
              <a
                href="https://app.allchat.in/"
                className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1eb858] text-white font-semibold px-8 py-4 rounded-full transition shadow-glow"
              >
                Access Dashboard
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 backdrop-blur-sm text-white font-semibold px-8 py-4 rounded-full border border-white/20 transition"
              >
                <Phone className="w-4 h-4" />
                Talk to our team
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-white/60">
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[#25D366]" /> Instant platform access</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[#25D366]" /> Secure API integration</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[#25D366]" /> Real-time analytics</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   PAGE
================================================================= */
export default function Home() {
  return (
    <div className="overflow-x-hidden">
      <Hero />
      <LogoCloud />
      <Features />
      <HowItWorks />
      <Stats />
      <Showcase />
      <Testimonials />
      <FAQ />
      <CTA />
    </div>
  );
}
