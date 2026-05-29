import { useState, useRef, useEffect } from 'react';
import { AI_URL, AI_HEADERS } from '../lib/supabase';

interface Message { role: 'user' | 'ai'; text: string; }

const QUICK = [
  { label: '💶 How much can I claim?', msg: 'How much compensation can I get for a delayed flight?' },
  { label: '⚖️ What is EC 261?', msg: 'What is EC 261/2004 and how does it protect me?' },
  { label: '🚫 Airline refused', msg: 'The airline refused to pay my claim — what do I do?' },
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "Hi! I'm your ClaimVelo AI assistant.\n\nI can help with:\n• EC 261/2004 eligibility\n• Compensation amounts\n• Claim status questions\n• Airline refusal strategies\n\nWhat can I help you with?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const history = useRef<{ role: string; content: string }[]>([]);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages, loading]);

  async function send(msg: string) {
    if (!msg.trim()) return;
    setInput('');
    setShowQuick(false);
    setMessages(m => [...m, { role: 'user', text: msg }]);
    history.current.push({ role: 'user', content: msg });
    setLoading(true);
    try {
      const r = await fetch(AI_URL, {
        method: 'POST',
        headers: AI_HEADERS,
        body: JSON.stringify({
          system: `You are ClaimVelo's AI assistant, expert in EC 261/2004 and UK261. Help passengers with flight compensation questions. Be friendly, concise, and practical. Max 150 words per answer.`,
          messages: history.current,
          max_tokens: 400,
        }),
      });
      const d = await r.json();
      if (d.error) {
        const reply = 'The AI service is temporarily unavailable. Please try again later or contact support.';
        setMessages(m => [...m, { role: 'ai', text: reply }]);
        setLoading(false);
        return;
      }
      const reply = d.content?.map((b: { text?: string }) => b.text || '').join('') || 'Sorry, I could not respond. Please try again.';
      history.current.push({ role: 'assistant', content: reply });
      setMessages(m => [...m, { role: 'ai', text: reply }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Connection error. Please try again.' }]);
    }
    setLoading(false);
  }

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9999] font-sans">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center text-2xl text-white cursor-pointer transition-transform hover:scale-110 shadow-lg border-none"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', boxShadow: '0 4px 20px rgba(124,58,237,.4)' }}
      >
        🤖
      </button>

      {open && (
        <div className="absolute bottom-16 right-0 w-[calc(100vw-32px)] sm:w-[340px] max-w-[340px] bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#e2e8f0]">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 text-white" style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base">🤖</div>
            <div>
              <div className="font-bold text-sm">ClaimVelo AI</div>
              <div className="text-[11px] opacity-80">● Powered by Claude</div>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto bg-transparent border-none text-white text-xl cursor-pointer leading-none">×</button>
          </div>

          {/* Messages */}
          <div ref={msgsRef} className="h-[240px] sm:h-[280px] overflow-y-auto p-3.5 flex flex-col gap-2.5 bg-[#f8fafc]">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 items-start ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 text-white ${m.role === 'ai' ? 'bg-[#7c3aed]' : 'bg-[#2563eb]'}`}>
                  {m.role === 'ai' ? '🤖' : '👤'}
                </div>
                <div
                  className={`px-3 py-2.5 rounded-[10px] text-[13px] leading-relaxed max-w-[240px] ${
                    m.role === 'ai'
                      ? 'bg-white border border-[#e2e8f0] text-[#334155]'
                      : 'bg-[#2563eb] text-white'
                  }`}
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 items-start">
                <div className="w-7 h-7 rounded-full bg-[#7c3aed] flex items-center justify-center text-xs text-white shrink-0">🤖</div>
                <div className="bg-white border border-[#e2e8f0] rounded-[10px] px-3 py-2.5 flex gap-1 items-center">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              </div>
            )}
          </div>

          {/* Quick buttons */}
          {showQuick && (
            <div className="px-3 py-2 flex gap-1.5 flex-wrap border-t border-[#e2e8f0] bg-white">
              {QUICK.map(q => (
                <button
                  key={q.label}
                  onClick={() => send(q.msg)}
                  className="bg-[#eff6ff] text-[#2563eb] border-none px-2.5 py-1 rounded-xl text-[11px] font-semibold cursor-pointer hover:bg-[#bfdbfe] transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-[#e2e8f0] bg-white flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Ask about flight compensation..."
              className="flex-1 px-3 py-2 border-[1.5px] border-[#e2e8f0] rounded-lg text-[13px] outline-none font-sans focus:border-[#2563eb] transition-colors"
            />
            <button
              onClick={() => send(input)}
              className="bg-[#2563eb] text-white border-none w-9 h-9 rounded-lg text-base cursor-pointer flex items-center justify-center hover:bg-[#1d4ed8] transition-colors"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
