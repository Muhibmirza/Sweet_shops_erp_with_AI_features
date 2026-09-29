import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, ShieldCheck, WandSparkles, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, unwrap } from '../../api/client';
import type { AssistantMessage, AssistantPlan, AssistantStatus } from '../../types/assistant';

const initialMessages: AssistantMessage[] = [{ role: 'assistant', text: 'Assalam-o-Alaikum! Main Eastern Sweets ERP Help hoon. POS, stock, packaging, kitchen, production, reports ya kisi error ke bare mein pooch sakte hain.' }];

export function ErpAiAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { unwrap<AssistantStatus>(api.get('/api/assistant/status')).then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(() => { if (chatOpen) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, chatOpen]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const nextMessages = [...messages, { role: 'user' as const, text }];
    setMessages(nextMessages);
    setChatInput('');
    setChatBusy(true);
    try {
      const result = await unwrap<{ reply: string }>(api.post('/api/assistant/chat', { messages: nextMessages, currentPath: location.pathname }));
      setMessages((current) => [...current, { role: 'assistant', text: result.reply }]);
    } catch (error: any) {
      setMessages((current) => [...current, { role: 'assistant', text: error.response?.data?.message || 'ERP Help abhi response nahi de saka.' }]);
    } finally { setChatBusy(false); }
  };

  const submitAgentCommand = async () => {
    const text = commandInput.trim();
    if (!text || agentBusy) return;
    setPlan(null);
    setAgentBusy(true);
    try {
      const result = await unwrap<AssistantPlan>(api.post('/api/assistant/command', { text, currentPath: location.pathname }));
      setPlan(result);
      if (result.action?.type === 'NAVIGATE') navigate(result.action.path);
    } catch (error: any) {
      setPlan({ reply: error.response?.data?.message || 'Agent abhi response nahi de saka.', requiresConfirmation: false, action: null });
    } finally { setAgentBusy(false); }
  };

  return <>
    <button type="button" className="fixed right-4 top-20 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#c88421] text-white shadow-2xl transition hover:bg-[#aa6d16]" onClick={() => { setAgentOpen((open) => !open); setChatOpen(false); }} aria-label="Open ERP Agent"><WandSparkles size={24} /></button>
    {agentOpen && <section className="fixed right-4 top-36 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-[#dac197] bg-[#fffaf0] p-4 text-[#123b39] shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-serif text-lg font-bold text-[#0f615d]"><WandSparkles size={19} /> ERP Agent</div><p className="mt-1 text-xs text-[#55716d]">ERP sawal poochein ya module kholne ko kahen. Agent read-only hai.</p></div><button className="touch grid place-items-center rounded-xl" onClick={() => setAgentOpen(false)} aria-label="Close ERP agent"><X size={18} /></button></div>
      <div className="mt-3 flex gap-2"><textarea className="touch min-h-20 min-w-0 flex-1 resize-none rounded-xl border border-[#dac197] bg-white px-3 py-2 text-sm outline-none" value={commandInput} onChange={(event) => setCommandInput(event.target.value)} placeholder="Example: aaj kitni sale hui ya Production kholo" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitAgentCommand(); } }} /><button className="touch self-end rounded-xl bg-[#0f615d] px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={!commandInput.trim() || agentBusy} onClick={submitAgentCommand}>Ask</button></div>
      {(agentBusy || plan) && <div className="mt-3 rounded-xl bg-[#f1e3cb] p-3 text-sm"><div className="flex items-start gap-2">{agentBusy ? <Loader2 className="mt-0.5 animate-spin" size={17} /> : <ShieldCheck className="mt-0.5 text-[#0f615d]" size={17} />}<div className="whitespace-pre-wrap">{agentBusy ? 'ERP data check ho raha hai…' : plan?.reply}</div></div></div>}
      {!status?.configured && <p className="mt-3 text-xs font-medium text-amber-700">AI provider key pending: local ERP help phir bhi available hai.</p>}
    </section>}

    <button type="button" className="fixed bottom-20 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#0f615d] text-white shadow-2xl transition hover:bg-[#0b504d] lg:bottom-6" onClick={() => { setChatOpen((open) => !open); setAgentOpen(false); }} aria-label="Open ERP Help Chat"><Bot size={25} /></button>
    {chatOpen && <section className="fixed bottom-36 right-4 z-50 flex h-[min(34rem,calc(100vh-10rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#dac197] bg-[#fffaf0] shadow-2xl lg:bottom-24">
      <header className="flex items-center justify-between bg-[#0f615d] px-4 py-3 text-white"><div><div className="flex items-center gap-2 font-serif font-bold"><Bot size={19} /> Eastern ERP Help</div><div className="text-[11px] text-white/75">Urdu · Roman Urdu · Hindi · English</div></div><button className="touch grid place-items-center rounded-xl" onClick={() => setChatOpen(false)} aria-label="Close ERP Help"><X size={18} /></button></header>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${message.role === 'user' ? 'ml-auto bg-[#c88421] text-white' : 'bg-white text-[#123b39] shadow-sm ring-1 ring-[#ead8bb]'}`}>{message.text}</div>)}{chatBusy && <div className="flex w-fit items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-[#ead8bb]"><Loader2 size={15} className="animate-spin" /> Soch raha hoon…</div>}</div>
      <div className="border-t border-[#ead8bb] p-3"><div className="flex gap-2"><input className="touch min-w-0 flex-1 rounded-xl border border-[#dac197] bg-white px-3 text-sm outline-none focus:border-[#c88421]" placeholder="ERP ka masla poochein…" value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendChat()} /><button className="touch grid place-items-center rounded-xl bg-[#0f615d] px-3 text-white disabled:opacity-50" onClick={sendChat} disabled={!chatInput.trim() || chatBusy} aria-label="Send message"><Send size={18} /></button></div><p className="mt-2 text-[10px] text-[#7b8f8b]">Read-only ERP assistant. Sensitive credentials kabhi share na karein.</p></div>
    </section>}
  </>;
}
