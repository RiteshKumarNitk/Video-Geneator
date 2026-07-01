'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send, Plus, Trash2, Bot, User, MessageSquare, ChevronDown,
  PanelLeftOpen, PanelLeftClose, Copy, Check, FilePlus, FileCode,
  X, AlertCircle, FolderOpen, Sparkles, Pencil, Download, Undo2,
  ArrowDown, Mic, MicOff, Search, Settings, SlidersHorizontal,
  FileDown, Quote, HelpCircle,
} from 'lucide-react';

/* ─── Types ─── */
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
  updatedAt: number;
  temperature: number;
  topP: number;
  maxTokens: number;
  customPrompt: string;
}

interface CodeBlock { language: string; code: string; filePath: string | null; }

interface SlashCommand { name: string; desc: string; action: () => void; }

/* ─── Utils ─── */
function genId() { return crypto.randomUUID(); }

function trunc(s: string, n = 40) {
  const c = s.replace(/[^\w\s]/g, '').trim();
  return c.length > n ? c.slice(0, n) + '...' : c || 'New Chat';
}

function fmtTime(ts: number) {
  const d = new Date(ts), n = new Date();
  const diff = n.getTime() - d.getTime();
  if (diff < 6e4) return 'Just now';
  if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
  return d.toLocaleDateString();
}

function fmtFullTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function detectFilePath(code: string, lang: string): string | null {
  const fl = code.split('\n')[0]?.trim();
  if (!fl) return null;
  const map: Record<string, RegExp> = {
    js: /^\/\/\s*(.+)$/, ts: /^\/\/\s*(.+)$/, tsx: /^\/\/\s*(.+)$/, jsx: /^\/\/\s*(.+)$/,
    py: /^#\s*(.+)$/, sh: /^#\s*(.+)$/, css: /^\/\*\s*(.+)\s*\*\/$/, html: /^<!--\s*(.+)\s*-->/,
    yml: /^#\s*(.+)$/, json: /^\/\/\s*(.+)$/,
  };
  const m = (map[lang] || /^(\/\/|#|<!--)\s*(.+?)\s*(-->)?$/).exec(fl);
  if (m) { const p = (m[2] || m[1] || '').trim(); if (p.includes('/') || p.includes('\\')) return p; }
  return null;
}

function parseCodeBlocks(content: string) {
  const segs: ({ type: 'text'; content: string } | { type: 'code'; block: CodeBlock })[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let li = 0, m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > li) segs.push({ type: 'text', content: content.slice(li, m.index) });
    const lang = m[1] || 'text', code = m[2].replace(/\n$/, '');
    const fp = detectFilePath(code, lang);
    const dc = fp ? code.split('\n').slice(1).join('\n').trimStart() : code;
    segs.push({ type: 'code', block: { language: lang, code: dc || code, filePath: fp } });
    li = m.index + m[0].length;
  }
  if (li < content.length) segs.push({ type: 'text', content: content.slice(li) });
  return segs;
}

function exportChat(conv: Conversation, format: 'md' | 'json') {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(conv, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${conv.title}.json`; a.click();
    URL.revokeObjectURL(url);
  } else {
    let md = `# ${conv.title}\n\n*Model: ${conv.model}*  \n*Exported: ${new Date().toLocaleString()}*\n\n---\n\n`;
    for (const msg of conv.messages) {
      md += `### ${msg.role === 'user' ? '👤 User' : '🤖 Assistant'}\n${msg.content}\n\n---\n\n`;
    }
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${conv.title}.md`; a.click();
    URL.revokeObjectURL(url);
  }
}

/* ─── Code Block ─── */
function CodeBlockRenderer({ block }: { block: CodeBlock }) {
  const [copied, setCopied] = useState(false);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [filePath, setFilePath] = useState(block.filePath || '');
  const [ws, setWs] = useState<'idle' | 'writing' | 'done' | 'error'>('idle');
  const [we, setWe] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [ec, setEc] = useState(block.code);

  const copy = async (c = block.code) => { await navigator.clipboard.writeText(c); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const extMap: Record<string, string> = { js: 'js', ts: 'ts', tsx: 'tsx', jsx: 'jsx', py: 'py', html: 'html', css: 'css', json: 'json', md: 'md', yml: 'yml', sh: 'sh' };
  const download = () => {
    const ext = extMap[block.language] || 'txt';
    const name = block.filePath?.split('/').pop() || `code.${ext}`;
    const blob = new Blob([block.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const createFile = async (ow = false) => {
    if (!filePath.trim()) return;
    setWs('writing'); setWe('');
    try {
      const r = await fetch('/api/file/write', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: filePath.trim(), content: block.code, overwrite: ow }),
      });
      const d = await r.json();
      if (r.ok) { setWs('done'); setTimeout(() => { setShowFileDialog(false); setWs('idle'); }, 1500); }
      else if (r.status === 409) { setWe('File exists. Click "Overwrite" to replace.'); setWs('idle'); }
      else { setWe(d.error || 'Failed'); setWs('idle'); }
    } catch { setWe('Network error'); setWs('idle'); }
  };

  return (<>
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-code)] group">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-card)] border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode size={12} className="text-[var(--text-secondary)] flex-shrink-0" />
          <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex-shrink-0">{block.language || 'code'}</span>
          {block.filePath && <span className="text-[10px] text-[var(--text-tertiary)] font-mono truncate hidden sm:inline">{block.filePath}</span>}
          <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0 hidden sm:inline">&middot; {block.code.split('\n').length} lines</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={download} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Download"><Download size={13} /></button>
          <button onClick={() => { setEc(block.code); setShowEdit(true); }} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-amber-400 hover:bg-amber-500/10 transition-all" title="Edit"><Pencil size={13} /></button>
          {block.filePath && <button onClick={() => { setFilePath(block.filePath || ''); setShowFileDialog(true); }} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Create file"><FilePlus size={13} /></button>}
          {(block.language === 'html' || block.language === 'htm') && (
            <button onClick={() => { const blob = new Blob([block.code], { type: 'text/html' }); const url = URL.createObjectURL(blob); const w = window.open(url, '_blank'); if (!w) { alert('Popup blocked. Please allow popups for this site.'); URL.revokeObjectURL(url); } else { setTimeout(() => URL.revokeObjectURL(url), 10000); } }} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-sky-400 hover:bg-sky-500/10 transition-all" title="Preview HTML">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </button>
          )}
          <button onClick={() => copy()} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all" title="Copy">{copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}</button>
        </div>
      </div>
      <div className="overflow-y-auto max-h-64">
        <pre className="px-4 py-3 text-[13px] leading-relaxed font-mono text-[var(--text-primary)]"><code>{block.code}</code></pre>
      </div>
      <div className="flex items-center justify-between px-3 py-1 bg-[var(--bg-card)] border-t border-white/5">
        <span className="text-[9px] text-[var(--text-tertiary)]">{block.code.split('\n').length} lines &middot; {block.code.length} chars</span>
        <button onClick={download} className="text-[9px] font-semibold text-[var(--text-secondary)] hover:text-emerald-400 transition-all flex items-center gap-1"><Download size={10} /> Download</button>
      </div>
    </div>

    {showEdit && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEdit(false)}>
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)] flex-shrink-0">
            <div className="flex items-center gap-2"><Pencil size={16} className="text-amber-400" /><h3 className="font-bold text-[var(--text-white)] text-sm">Edit Code</h3><span className="text-[10px] text-[var(--text-tertiary)]">{block.language}</span></div>
            <button onClick={() => setShowEdit(false)} className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all"><X size={16} /></button>
          </div>
          <textarea value={ec} onChange={e => setEc(e.target.value)} className="flex-1 min-h-[300px] p-4 bg-[var(--bg-code)] text-[13px] leading-relaxed font-mono text-[var(--text-primary)] outline-none resize-none border-0" spellCheck={false} />
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-default)] flex-shrink-0">
            <span className="text-[10px] text-[var(--text-tertiary)]">{ec.split('\n').length} lines &middot; {ec.length} chars</span>
            <div className="flex gap-2">
              <button onClick={async () => { await navigator.clipboard.writeText(ec); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-3 py-1.5 rounded-xl text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all flex items-center gap-1.5">{copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}</button>
              <button onClick={() => { copy(ec); setShowEdit(false); }} className="px-4 py-1.5 rounded-xl bg-emerald-500 text-black text-[10px] font-bold hover:bg-emerald-400 transition-all active:scale-95 flex items-center gap-1.5"><Check size={11} /> Done</button>
            </div>
          </div>
        </div>
      </div>
    )}

    {showFileDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowFileDialog(false)}>
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><FilePlus size={18} className="text-emerald-400" /><h3 className="font-bold text-[var(--text-white)] text-sm">Create File</h3></div><button onClick={() => setShowFileDialog(false)} className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all"><X size={16} /></button></div>
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 block">File Path</label>
          <div className="flex items-center gap-2 mb-3"><FolderOpen size={14} className="text-[var(--text-tertiary)] flex-shrink-0" /><input value={filePath} onChange={e => setFilePath(e.target.value)} className="flex-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-white)] font-mono outline-none focus:border-emerald-500/40 transition-all" placeholder="src/app/something/page.tsx" /></div>
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 block">Preview</label>
          <pre className="bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)] p-3 max-h-40 overflow-auto text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed mb-4">{block.code}</pre>
          {we && <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]"><AlertCircle size={12} />{we}<button onClick={() => createFile(true)} className="ml-auto text-[10px] font-bold uppercase tracking-wider hover:text-red-300">Overwrite</button></div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFileDialog(false)} className="px-4 py-2 rounded-xl text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all">Cancel</button>
            <button onClick={() => createFile()} disabled={ws === 'writing' || !filePath.trim()} className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[11px] font-bold hover:bg-emerald-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 flex items-center gap-1.5">
              {ws === 'writing' ? <>Writing...</> : ws === 'done' ? <><Check size={12} /> Created</> : <><FilePlus size={12} /> Create File</>}
            </button>
          </div>
        </div>
      </div>
    )}
  </>);
}

/* ─── Message Bubble ─── */
function MessageBubble({ msg, onEdit, onDelete, onRegenerate, showActions }: {
  msg: Message; onEdit?: (id: string, newText: string) => void;
  onDelete?: (id: string) => void; onRegenerate?: (id: string) => void; showActions?: boolean;
}) {
  const isUser = msg.role === 'user';
  const segments = parseCodeBlocks(msg.content);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== msg.content) onEdit?.(msg.id, editText);
    setEditing(false);
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in group`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-[var(--border-default)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={16} className="text-violet-400" />
        </div>
      )}

      <div className={`max-w-[90%] sm:max-w-[75%] ${isUser ? 'order-first' : ''}`}>
        {editing ? (
          <div className="bg-[var(--bg-card)] border border-emerald-500/40 rounded-2xl p-3">
            <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none resize-none min-h-[60px]" autoFocus />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setEditing(false)} className="px-3 py-1 rounded-lg text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-white)] transition-all">Cancel</button>
              <button onClick={handleSaveEdit} className="px-3 py-1 rounded-lg bg-emerald-500 text-black text-[10px] font-bold hover:bg-emerald-400 transition-all">Save</button>
            </div>
          </div>
        ) : (
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? 'bg-emerald-500/10 border border-emerald-500/20 text-[var(--text-primary)]' : 'bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)]'}`}>
            {isUser ? (
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            ) : (
              <div className="space-y-1">
                {segments.map((seg, i) => seg.type === 'text' ? <div key={i} className="whitespace-pre-wrap break-words">{seg.content}</div> : <CodeBlockRenderer key={i} block={seg.block} />)}
              </div>
            )}
          </div>
        )}

        {/* Actions bar */}
        {showActions && !editing && (
          <div className={`flex items-center gap-1 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[9px] text-[var(--text-tertiary)] mr-1">{fmtFullTime(msg.timestamp)}</span>
            {isUser && onEdit && (
              <button onClick={() => { setEditText(msg.content); setEditing(true); }} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-amber-400 transition-all opacity-0 group-hover:opacity-100" title="Edit message"><Pencil size={11} /></button>
            )}
            {!isUser && onRegenerate && (
              <button onClick={() => onRegenerate(msg.id)} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-emerald-400 transition-all opacity-0 group-hover:opacity-100" title="Regenerate"><Undo2 size={11} /></button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(msg.id)} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-red-400 transition-all opacity-0 group-hover:opacity-100" title="Delete message"><Trash2 size={11} /></button>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={16} className="text-emerald-400" />
        </div>
      )}
    </div>
  );
}

/* ─── Voice Button ─── */
function VoiceButton({ onResult }: { onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggle = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Voice input not supported in this browser.'); return; }
    const r = new SpeechRecognition();
    r.lang = 'en-US';
    r.interimResults = false;
    r.onresult = (e: any) => { onResult(e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    recognitionRef.current = r;
    setListening(true);
  };

  return (
    <button onClick={toggle} className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 ${listening ? 'bg-red-500/15 border border-red-500/30 text-red-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)]'}`} title={listening ? 'Stop listening' : 'Voice input'}>
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}

/* ─── Scroll To Bottom ─── */
function ScrollToBottom({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 flex items-center justify-center hover:bg-emerald-400 transition-all active:scale-95 animate-fade-in">
      <ArrowDown size={16} />
    </button>
  );
}

/* ─── Main Chat Page ─── */
export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sc, setSc] = useState(''); // streaming content
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showParams, setShowParams] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [slashCmd, setSlashCmd] = useState('');
  const [showSlash, setShowSlash] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeConv = conversations.find(c => c.id === activeId) || null;

  useEffect(() => { document.body.classList.add('chat-active'); return () => document.body.classList.remove('chat-active'); }, []);

  useEffect(() => {
    try { const s = localStorage.getItem('chromaai-chats-v3'); if (s) { const p: Conversation[] = JSON.parse(s); setConversations(p); if (p.length > 0) setActiveId(p[0].id); } } catch { }
    fetchModels();
    fetchProjectTree();
  }, []);

  useEffect(() => { localStorage.setItem('chromaai-chats-v3', JSON.stringify(conversations)); }, [conversations]);

  // Auto-scroll with user scroll detection
  useEffect(() => {
    if (!userScrolledUp) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages, sc, userScrolledUp]);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setUserScrolledUp(!atBottom);
  }, []);

  const scrollToBottom = () => { setUserScrolledUp(false); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  const fetchModels = async () => {
    try { const r = await fetch('/api/ollama/models'); const d = await r.json(); const n = (d.models || []).map((m: any) => m.name); setModels(n); if (n.length > 0 && !selectedModel) setSelectedModel(n[0]); } catch { }
  };
  const fetchProjectTree = async () => { try { const r = await fetch('/api/project/tree'); const d = await r.json(); if (d.tree) setProjectTree(d.tree); } catch { } };

  const getActive = () => conversations.find(c => c.id === activeId) || null;

  const createNewChat = useCallback(() => {
    const id = genId();
    setConversations(p => [{ id, title: 'New Chat', messages: [], model: selectedModel, createdAt: Date.now(), updatedAt: Date.now(), temperature: 0.7, topP: 0.9, maxTokens: 2048, customPrompt: '' }, ...p]);
    setActiveId(id); setSc(''); setShowParams(false); setShowPromptEditor(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [selectedModel]);

  const deleteChat = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversations(p => { const f = p.filter(c => c.id !== id); if (activeId === id) setActiveId(f[0]?.id || null); return f; });
  }, [activeId]);

  const updMsgs = useCallback((fn: (msgs: Message[]) => Message[]) => {
    setConversations(p => p.map(c => c.id === activeId ? { ...c, messages: fn(c.messages), updatedAt: Date.now() } : c));
  }, [activeId]);

  const updConv = useCallback((fn: (c: Conversation) => Conversation) => {
    setConversations(p => p.map(c => c.id === activeId ? fn(c) : c));
  }, [activeId]);

  const editMessage = useCallback((msgId: string, newText: string) => {
    updMsgs(msgs => msgs.map(m => m.id === msgId ? { ...m, content: newText } : m));
  }, [updMsgs]);

  const deleteMessage = useCallback((msgId: string) => {
    updMsgs(msgs => msgs.filter(m => m.id !== msgId));
  }, [updMsgs]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride || input).trim();
    if (!text || !activeId || !selectedModel) return;
    setInput('');

    const userMsg: Message = { id: genId(), role: 'user', content: text, timestamp: Date.now() };

    setConversations(p => p.map(c =>
      c.id === activeId
        ? { ...c, title: c.messages.length === 0 ? trunc(text) : c.title, messages: [...c.messages, userMsg], updatedAt: Date.now() }
        : c
    ));

    setStreaming(true); setSc('');
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const conv = getActive();
      const allMsgs = conv ? [...conv.messages, userMsg] : [userMsg];
      const apiMsgs = allMsgs.map(m => ({ role: m.role, content: m.content }));
      if (conv?.customPrompt) apiMsgs.unshift({ role: 'system', content: conv.customPrompt });

      const body: any = { model: selectedModel, messages: apiMsgs };
      if (conv) { body.temperature = conv.temperature; body.top_p = conv.topP; body.max_tokens = conv.maxTokens; }

      const res = await fetch('/api/ollama/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error('Request failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) { const { done, value } = await reader.read(); if (done) break; full += decoder.decode(value, { stream: true }); setSc(full); }

      const asstMsg: Message = { id: genId(), role: 'assistant', content: full, timestamp: Date.now() };
      updMsgs(msgs => [...msgs, asstMsg]);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      updMsgs(msgs => [...msgs, { id: genId(), role: 'assistant', content: 'Sorry, the request failed. Is Ollama running?', timestamp: Date.now() }]);
    } finally { setStreaming(false); setSc(''); abortRef.current = null; }
  };

  const regenerate = useCallback((msgId: string) => {
    const conv = getActive();
    if (!conv) return;
    const idx = conv.messages.findIndex(m => m.id === msgId);
    if (idx < 1) return; // Need at least user + assistant
    // Remove this message and all after it
    const msgs = conv.messages.slice(0, idx);
    updMsgs(() => msgs);
    // Rebuild the last user message
    const lastUser = msgs[msgs.length - 1];
    if (lastUser?.role === 'user') {
      setInput(lastUser.content);
    }
  }, [getActive, updMsgs]);

  const stopGeneration = () => {
    abortRef.current?.abort();
    if (sc) { updMsgs(msgs => [...msgs, { id: genId(), role: 'assistant', content: sc, timestamp: Date.now() }]); }
    setStreaming(false); setSc('');
  };

  // Slash commands
  const slashCommands: SlashCommand[] = [
    { name: '/clear', desc: 'Clear all messages in this chat', action: () => { if (confirm('Clear all messages?')) updMsgs(() => []); } },
    { name: '/export-md', desc: 'Export as Markdown', action: () => { const c = getActive(); if (c) exportChat(c, 'md'); } },
    { name: '/export-json', desc: 'Export as JSON', action: () => { const c = getActive(); if (c) exportChat(c, 'json'); } },
    { name: '/help', desc: 'Show available commands', action: () => { alert('/clear - Clear chat\n/export-md - Export as Markdown\n/export-json - Export as JSON\n/help - Show this help'); } },
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (streaming) { stopGeneration(); return; }
      if (slashCmd) {
        const cmd = slashCommands.find(c => c.name === slashCmd);
        if (cmd) cmd.action();
        setSlashCmd(''); setShowSlash(false); setInput('');
        return;
      }
      sendMessage();
    }
    if (e.key === '/' && input === '') { setShowSlash(true); }
    if (e.key === 'Escape') { setShowSlash(false); setSlashCmd(''); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) { setSlashCmd(val.split(' ')[0]); setShowSlash(true); }
    else { setShowSlash(false); setSlashCmd(''); }
  };

  const handleVoiceResult = (text: string) => {
    setInput(p => p + text);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const clearAllChats = () => { setConversations([]); setActiveId(null); };

  const displayModel = selectedModel.split(':')[0];

  // Filter conversations by search
  const filteredConvs = (searchQuery
    ? conversations.filter(c =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    : conversations
  ).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex-1 flex screen-full overflow-hidden">
      {sidebarOpen && <div className="chat-sidebar-backdrop md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ─── Sidebar ─── */}
      <aside className={`${sidebarOpen ? 'w-72 md:w-72' : 'w-0'} chat-sidebar transition-all duration-300 md:border-r md:border-[var(--border-default)] md:bg-[var(--bg-footer)] bg-[var(--bg-elevated)] flex flex-col overflow-hidden flex-shrink-0`}>
        <div className="flex flex-col h-full min-w-72">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[var(--border-default)]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center"><Sparkles size={14} className="text-[var(--text-white)]" /></div>
              <span className="font-bold text-sm text-[var(--text-white)]">AI Chat</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-colors"><PanelLeftClose size={16} /></button>
          </div>

          <div className="px-3 pt-3"><button onClick={createNewChat} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 font-semibold text-xs transition-all active:scale-95"><Plus size={14} /> New Chat</button></div>

          {/* Search */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-tertiary)]">
              <Search size={13} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search chats..." className="flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder-[var(--text-tertiary)]" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><X size={13} /></button>}
            </div>
          </div>

          {/* Model selector */}
          <div className="px-3 pt-3 relative">
            <button onClick={() => setModelMenuOpen(!modelMenuOpen)} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-xs font-medium transition-all">
              <div className="flex items-center gap-2 truncate"><Bot size={14} className="text-violet-400 flex-shrink-0" /><span className="truncate">{displayModel || 'Select model'}</span></div>
              <ChevronDown size={14} className={`text-[var(--text-secondary)] transition-transform flex-shrink-0 ${modelMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {modelMenuOpen && (
              <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden shadow-xl">
                {models.map(m => (
                  <button key={m} onClick={() => { setSelectedModel(m); setModelMenuOpen(false); }} className={`w-full text-left px-3 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${m === selectedModel ? 'bg-emerald-500/10 text-emerald-400' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)]'}`}>
                    <Bot size={12} /><span>{m.split(':')[0]}</span>{m.includes(':') && <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">{m.split(':')[1]}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {filteredConvs.length === 0 && (
              <div className="text-center py-10"><MessageSquare size={28} className="mx-auto text-[var(--text-tertiary)]" />
                <p className="text-xs text-[var(--text-tertiary)] mt-2">{searchQuery ? 'No matching chats' : 'No conversations yet'}</p></div>
            )}
            {filteredConvs.map(conv => {
              const lastMsg = conv.messages[conv.messages.length - 1];
              return (
                <button key={conv.id} onClick={() => setActiveId(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 group ${conv.id === activeId ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)] border border-transparent'}`}>
                  <MessageSquare size={14} className="flex-shrink-0 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{conv.title}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5">
                      <span>{fmtTime(conv.updatedAt)}</span>
                      {lastMsg && <><span>&middot;</span><span className="truncate">{lastMsg.content.slice(0, 25)}...</span></>}
                    </div>
                  </div>
                  <button onClick={e => deleteChat(e, conv.id)} className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all flex-shrink-0"><Trash2 size={12} /></button>
                </button>
              );
            })}
          </div>

          {/* Bottom area */}
          <div className="px-3 pb-3 space-y-1">
            {conversations.length > 0 && <button onClick={clearAllChats} className="w-full py-2 rounded-xl text-[10px] font-semibold text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/5 transition-all">Clear all chats</button>}
          </div>
        </div>
      </aside>

      {/* ─── Main Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-default)] bg-[var(--bg-header)]">
          <div className="flex items-center gap-2">
            {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-colors"><PanelLeftOpen size={18} /></button>}
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Bot size={14} className="text-violet-400" />
              <span className="hidden sm:inline">{displayModel || 'Model'}</span>
              {streaming && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeConv && (<>
              {/* Parameters */}
              <button onClick={() => setShowParams(!showParams)} className={`p-1.5 rounded-lg transition-all ${showParams ? 'bg-emerald-500/10 text-emerald-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)]'}`} title="AI Parameters"><SlidersHorizontal size={15} /></button>
              {/* System prompt */}
              <button onClick={() => setShowPromptEditor(true)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-all" title="Custom system prompt"><Quote size={15} /></button>
              {/* Export */}
              <div className="relative">
                <button onClick={() => setShowExportMenu(!showExportMenu)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-all" title="Export"><FileDown size={15} /></button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden shadow-xl min-w-[140px]">
                    <button onClick={() => { const c = getActive(); if (c) exportChat(c, 'md'); setShowExportMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)] transition-colors">Export as Markdown</button>
                    <button onClick={() => { const c = getActive(); if (c) exportChat(c, 'json'); setShowExportMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)] transition-colors">Export as JSON</button>
                  </div>
                )}
              </div>
              {/* Message count */}
              <span className="text-[10px] text-[var(--text-tertiary)] ml-1 hidden sm:inline">{activeConv.messages.length} msgs</span>
            </>)}
          </div>
        </div>

        {/* Parameters panel */}
        {showParams && activeConv && (
          <div className="border-b border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-3 animate-fade-in">
            <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-4">
              {([['Temperature', 'temperature', 0, 2, 0.1], ['Top P', 'topP', 0, 1, 0.05], ['Max Tokens', 'maxTokens', 64, 8192, 64]] as const).map(([label, key, min, max, step]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider min-w-[60px]">{label}</span>
                  <input type="range" min={min} max={max} step={step} value={activeConv[key]} onChange={e => updConv(c => ({ ...c, [key]: parseFloat(e.target.value) }))} className="w-20 accent-emerald-500" />
                  <span className="text-[11px] font-mono text-[var(--text-primary)] w-10 text-right">{activeConv[key]}</span>
                </div>
              ))}
              <button onClick={() => updConv(c => ({ ...c, temperature: 0.7, topP: 0.9, maxTokens: 2048 }))} className="text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline ml-auto">Reset</button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 chat-messages-scroll relative" ref={messagesRef} onScroll={handleScroll}>
          {!activeConv ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/10 to-emerald-500/10 border border-[var(--border-default)] flex items-center justify-center mb-5"><Sparkles size={36} className="text-violet-400" /></div>
              <h2 className="text-2xl font-bold text-[var(--text-white)] mb-2">AI Chat</h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-md leading-relaxed">Chat with local AI models via Ollama. Ask coding questions, generate components, or get help with the project.</p>
              <button onClick={createNewChat} className="mt-6 px-5 py-2.5 rounded-xl bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 transition-all active:scale-95">Start a conversation</button>
            </div>
          ) : activeConv.messages.length === 0 && !streaming ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-[var(--border-default)] flex items-center justify-center mb-4"><MessageSquare size={28} className="text-violet-400" /></div>
              <h3 className="text-lg font-bold text-[var(--text-white)] mb-1">{trunc(activeConv.title)}</h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-6">Send a message to start chatting with <span className="text-[var(--text-primary)]">{displayModel}</span>.</p>
              <div className="flex flex-wrap gap-2 max-w-md justify-center">
                {['Create a new React component', 'Show me the project structure', 'Explain the video matting pipeline', 'Add a dark mode toggle'].map(q => (
                  <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }} className="px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-all">{q}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 space-y-3">
              {activeConv.messages.map((msg, i) => (
                <MessageBubble key={msg.id} msg={msg} onEdit={editMessage} onDelete={deleteMessage} onRegenerate={regenerate} showActions />
              ))}

              {streaming && sc && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-[var(--border-default)] flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={16} className="text-violet-400" /></div>
                  <div className="max-w-[90%] sm:max-w-[75%]"><div className="px-4 py-3 rounded-2xl text-sm leading-relaxed bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)]"><StreamingContentRenderer content={sc} /><span className="inline-block w-1.5 h-4 bg-emerald-400 ml-0.5 animate-pulse align-text-bottom rounded-sm" /></div></div>
                </div>
              )}

              {streaming && !sc && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-[var(--border-default)] flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={16} className="text-violet-400" /></div>
                  <div className="px-4 py-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)]"><div className="flex gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '300ms' }} /></div></div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {userScrolledUp && activeConv && activeConv.messages.length > 0 && <ScrollToBottom onClick={scrollToBottom} />}
        </div>

        {/* Input Area */}
        {activeConv && (
          <div className="border-t border-[var(--border-default)] bg-[var(--bg-header)] backdrop-blur-md px-3 sm:px-4 py-3">
            <div className="max-w-3xl mx-auto">
              {/* Slash command suggestions */}
              {showSlash && input.startsWith('/') && (
                <div className="mb-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden shadow-lg animate-fade-in">
                  {slashCommands.filter(c => c.name.startsWith(slashCmd)).map(cmd => (
                    <button key={cmd.name} onClick={() => { cmd.action(); setShowSlash(false); setSlashCmd(''); setInput(''); }} className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)] transition-colors flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-400">{cmd.name}</span>
                      <span className="text-[var(--text-tertiary)]">{cmd.desc}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <VoiceButton onResult={handleVoiceResult} />
                <textarea
                  ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
                  placeholder={streaming ? 'Generating...' : 'Ask something... (/ for commands)'}
                  rows={1} disabled={streaming}
                  className="flex-1 resize-none rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-white)] placeholder-[var(--text-tertiary)] outline-none focus:border-emerald-500/40 focus:bg-[var(--bg-hover)] transition-all disabled:opacity-50"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                  onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }}
                />
                <button onClick={streaming ? stopGeneration : () => sendMessage()}
                  disabled={(!input.trim() && !streaming) || !selectedModel}
                  className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 ${streaming ? 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25' : 'bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.15)]'}`}>
                  {streaming ? <span className="w-3.5 h-3.5 rounded-sm border-2 border-red-400" /> : <Send size={16} />}
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[10px] text-[var(--text-tertiary)]">{displayModel} &middot; Enter to send &middot; Shift+Enter new line{showParams && ' &middot; Parameters active'}</p>
                {streaming && <p className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />Generating...</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* System Prompt Editor */}
      {showPromptEditor && activeConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPromptEditor(false)}>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl w-full max-w-2xl mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2"><Quote size={16} className="text-emerald-400" /><h3 className="font-bold text-[var(--text-white)] text-sm">Custom System Prompt</h3></div>
              <button onClick={() => setShowPromptEditor(false)} className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all"><X size={16} /></button>
            </div>
            <textarea value={activeConv.customPrompt} onChange={e => updConv(c => ({ ...c, customPrompt: e.target.value }))} className="w-full min-h-[200px] p-4 bg-[var(--bg-code)] text-[13px] leading-relaxed font-mono text-[var(--text-primary)] outline-none resize-none border-0" placeholder="Optional: Set a custom system prompt for this conversation..." />
            <div className="flex justify-end px-5 py-3 border-t border-[var(--border-default)]">
              <button onClick={() => setShowPromptEditor(false)} className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[11px] font-bold hover:bg-emerald-400 transition-all active:scale-95">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StreamingContentRenderer({ content }: { content: string }) {
  return <div className="whitespace-pre-wrap break-words">{content}</div>;
}
