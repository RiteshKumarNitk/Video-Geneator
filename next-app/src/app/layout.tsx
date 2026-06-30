import type { Metadata } from "next";
import Link from 'next/link';
import "./globals.css";

export const metadata: Metadata = {
  title: "ChromaAI | Self-Hosted Video Background Changer",
  description: "Remove video backgrounds automatically and replace them with green screen or custom layouts using local, private AI models.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-[#030303] text-zinc-100 selection:bg-emerald-500 selection:text-black">
        {/* Ambient mesh background glow */}
        <div className="bg-mesh-glow" />

        {/* Global Navigation Header */}
        <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/60 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2 hover:opacity-95 transition-opacity">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-black text-lg shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  C
                </div>
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                  Chroma<span className="text-emerald-400">AI</span>
                </span>
              </Link>

              <nav className="hidden md:flex items-center gap-6">
                <Link href="/" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                  Home
                </Link>
                <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                  Dashboard
                </Link>
                <Link href="/youtube" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                  YouTube Shorts
                </Link>
                <Link href="/admin" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                  Admin Panel
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="relative group overflow-hidden px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 active:scale-95 bg-white text-black hover:bg-zinc-200 shadow-md hover:shadow-[0_0_20px_rgba(255,255,255,0.15)]"
              >
                Launch App
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col">
          {children}
        </main>

        {/* Global Footer */}
        <footer className="border-t border-white/5 bg-black/40 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-zinc-500">
            <div>
              &copy; {new Date().getFullYear()} ChromaAI. All rights reserved. Self-Hosted Privacy First.
            </div>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Local GPU/CPU Engine Active
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
