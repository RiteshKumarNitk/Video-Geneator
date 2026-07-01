'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Home,
  LayoutDashboard,
  Video,
  Play,
  Volume2,
  Shield,
  Menu,
  X,
  Bot,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/youtube', label: 'YouTube Shorts', icon: Video },
  { href: '/playlist', label: 'Playlists', icon: Play },
  { href: '/tts', label: 'Text to Speech', icon: Volume2 },
  { href: '/chat', label: 'AI Chat', icon: Bot },
  { href: '/admin', label: 'Admin', icon: Shield },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border-default)] bg-[var(--bg-header)] backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 hover:opacity-95 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-black text-lg shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              C
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-[var(--text-white)] via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Chroma<span className="text-emerald-400">AI</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="relative group overflow-hidden px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 active:scale-95 bg-white text-black hover:bg-zinc-200 shadow-md hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] hidden sm:inline-flex"
          >
            Launch App
          </Link>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--border-default)] bg-[var(--bg-header)] backdrop-blur-lg animate-fade-in">
          <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
