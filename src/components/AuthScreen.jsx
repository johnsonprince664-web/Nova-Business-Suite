import React, { useState } from "react";
import { motion } from "framer-motion";
import { Gem, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const action = mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });

    const { error } = await action;
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "signup") setMessage("Account created. Check your email if confirmation is enabled.");
  }

  return (
    <div className="min-h-screen bg-legacy-gradient px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-2xl lg:grid-cols-[1.1fr_.9fr] dark:bg-slate-950/95">
        <motion.section
          className="relative hidden overflow-hidden bg-legacy-gradient p-12 text-white lg:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute right-10 top-20 h-44 w-44 rounded-full border border-white/10" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-300 text-legacy-950">
                <Gem className="h-6 w-6" />
              </div>
              <div>
                <p className="font-black tracking-[.18em]">LEGACY</p>
                <p className="text-sm text-legacy-100">Jewelry Co.</p>
              </div>
            </div>
            <div className="mt-24 max-w-lg">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-gold-200">
                <Sparkles className="h-4 w-4" /> Luxury business command center
              </div>
              <h1 className="text-5xl font-black leading-[1.05] tracking-tight">
                Run the business.<br />Protect the legacy.
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-legacy-100">
                Customers, inventory, sales, special orders, expenses, analytics, and cloud sync in one polished workspace.
              </p>
            </div>
          </div>
        </motion.section>

        <section className="flex items-center p-7 sm:p-12">
          <motion.form
            className="mx-auto w-full max-w-md"
            onSubmit={submit}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-8 lg:hidden">
              <p className="font-black tracking-[.18em] text-legacy-900 dark:text-white">LEGACY</p>
              <p className="text-sm text-slate-500">Jewelry Co.</p>
            </div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-gold-600">Secure cloud CRM</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Sign in to sync your CRM securely across devices.
            </p>

            <div className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Email</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input className="pl-10" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Password</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input className="pl-10" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </label>
            </div>

            {message && <p className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message}</p>}

            <Button className="mt-6 w-full" size="lg" disabled={busy}>
              {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </Button>

            <button
              type="button"
              className="mt-5 w-full text-sm font-semibold text-legacy-600 hover:text-legacy-700 dark:text-legacy-300"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </motion.form>
        </section>
      </div>
    </div>
  );
}
