import type { Metadata } from "next";
import Link from 'next/link';
import { GitFork } from 'lucide-react';
import Header from '@/components/Header';
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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('chromaai-theme');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col selection:bg-emerald-500 selection:text-black">
        <div className="bg-mesh-glow" />
        <Header />
        <main className="flex-1 flex flex-col">
          {children}
        </main>
        <footer className="border-t border-[var(--border-default)] bg-[var(--bg-footer)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="flex flex-col gap-4">
                <Link href="/" className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-black text-sm">
                    C
                  </div>
                  <span className="font-extrabold text-base tracking-tight text-[var(--text-white)]">
                    Chroma<span className="text-emerald-400">AI</span>
                  </span>
                </Link>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-xs">
                  Self-hosted AI video background matting and content processing suite. All computation stays local.
                </p>
                <div className="flex items-center gap-2.5 mt-1">
                  <a href="#" className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
                    <GitFork size={16} />
                  </a>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Product</h4>
                <div className="flex flex-col gap-2">
                  <Link href="/dashboard" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Dashboard</Link>
                  <Link href="/youtube" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">YouTube Shorts</Link>
                  <Link href="/playlist" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Playlists</Link>
                  <Link href="/tts" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Text to Speech</Link>
                  <Link href="/chat" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">AI Chat</Link>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Resources</h4>
                <div className="flex flex-col gap-2">
                  <Link href="/admin" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Admin & Queue</Link>
                  <a href="#" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Documentation</a>
                  <a href="#" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">API Reference</a>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">System</h4>
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Local GPU/CPU Engine Active
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                  v0.1.0 &middot; Self-Hosted &middot; Privacy First
                </p>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-[var(--border-default)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--text-tertiary)]">
              <div>&copy; {new Date().getFullYear()} ChromaAI. All rights reserved.</div>
              <div className="flex items-center gap-4">
                <span>Built with PyTorch & Next.js</span>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
