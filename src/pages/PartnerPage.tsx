import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface PartnerPageProps {
  onNav: (p: import('../types').Page) => void;
}

export default function PartnerPage({ onNav }: PartnerPageProps) {
  const [tickets, setTickets] = useState(500);
  const [agency, setAgency] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  const claims = Math.round(tickets * 0.15);
  const monthly = claims * 20;
  const yearly = monthly * 12;
  const pct = Math.round(((tickets - 10) / (2000 - 10)) * 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: err } = await supabase
      .from('partner_registrations')
      .insert({ agency_name: agency, full_name: name, email });
    setSubmitting(false);
    if (err) {
      setError('Something went wrong. Please try again.');
    } else {
      setSubmitted(true);
    }
  }

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen bg-white">

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pt-14 pb-20 text-white" style={{ background: 'linear-gradient(135deg, #0b1e4d 0%, #132a6b 50%, #1e40af 100%)' }}>
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px,#fff 1px,transparent 0)', backgroundSize: '18px 18px' }} />
        <div className="relative mx-auto max-w-2xl text-center">
          <span className="mb-4 inline-block rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-blue-200 ring-1 ring-white/20">Claim Velo · B2B Partner Network</span>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-[40px]">
            Turn Flight Disruptions<br />
            <span className="text-blue-300">Into a New Revenue Stream</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-blue-100">
            Join our partner program and help your travelers claim financial compensation for canceled or delayed flights. Zero overhead for you — pure passive profit for your agency.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button onClick={scrollToForm} className="rounded-lg bg-[#2563eb] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_10px_30px_-10px_rgba(37,99,235,0.8)] transition hover:bg-[#1d4ed8] border-none cursor-pointer">
              Become a Partner
            </button>
            <a href="#calculator" className="rounded-lg border border-white/25 bg-white/5 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-white/10">
              Calculate Your Earnings
            </a>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[11px] font-semibold text-blue-200">
            <span className="flex items-center gap-2"><span className="text-[#38bdf8] text-sm font-bold">€0</span> Setup Costs</span>
            <span className="flex items-center gap-2"><span className="text-[#38bdf8] text-sm font-bold">€20</span> Per Approved Claim</span>
            <span className="flex items-center gap-2"><span className="text-[#38bdf8] text-sm font-bold">24h</span> Activation</span>
            <span className="flex items-center gap-2"><span className="text-[#38bdf8] text-sm font-bold">15%</span> Flights Eligible</span>
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-[0.25em] text-blue-300/80">EU · UK · US · IL</p>
        </div>
      </section>

      {/* CALCULATOR */}
      <section id="calculator" className="relative px-6 pb-16 pt-10 bg-[#f8fafc]">
        <div className="mx-auto -mt-14 max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.15)] sm:p-8">
            <div className="flex justify-center">
              <span className="inline-block rounded-full bg-blue-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 ring-1 ring-blue-200/60">Revenue Calculator</span>
            </div>
            <h3 className="mt-4 text-center text-lg font-bold text-slate-900 sm:text-xl">How Much Can Your Agency Earn?</h3>
            <p className="mt-2 text-center text-xs text-slate-500">~15% of all flights experience compensable disruptions. At €20 per approved claim, see what that means for your bottom line — monthly and annually.</p>
            <div className="mt-6 space-y-6">
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-center text-[11px] leading-relaxed text-blue-800">
                <span className="font-bold">Did you know?</span> On average, <span className="font-bold text-[#2563eb]">15% of flights</span> experience delays or cancellations that qualify passengers for financial compensation under EU261 and similar regulations.
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">Monthly Flight Tickets Sold</span>
                  <span className="rounded-md bg-blue-50 px-2.5 py-1 text-sm font-black text-blue-700 ring-1 ring-blue-200">{tickets.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="2000"
                  step="10"
                  value={tickets}
                  onChange={e => setTickets(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg"
                  style={{ background: `linear-gradient(to right, #2563eb ${pct}%, #e2e8f0 ${pct}%)` }}
                />
                <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
                  <span>10</span><span>500</span><span>1,000</span><span>1,500</span><span>2,000</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Tickets / mo</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{tickets.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">15% Eligible</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{claims.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3.5 text-center ring-1 ring-blue-200">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-blue-700">Commission</p>
                  <p className="mt-1 text-lg font-bold text-blue-700">€20 / claim</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-3.5 text-center ring-1 ring-green-200">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-green-700">Per Month</p>
                  <p className="mt-1 text-lg font-bold text-green-700">€{monthly.toLocaleString()}</p>
                </div>
              </div>
              <div className="rounded-2xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 p-5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-green-700">Estimated Annual Revenue</p>
                <p className="mt-1 text-3xl font-black text-green-700 sm:text-4xl">
                  €{yearly.toLocaleString()}<span className="ml-1 text-base font-semibold text-green-600">/ year</span>
                </p>
                <p className="mt-2 text-[10px] text-green-600/80">{tickets.toLocaleString()} tickets × 15% disruptions × €20 commission × 12 months</p>
              </div>
              <p className="text-center text-[10px] text-slate-400">* Based on ~15% claimable flight disruptions and a fixed €20 agency commission per approved passenger claim.</p>
              <div className="flex justify-center">
                <button onClick={scrollToForm} className="rounded-lg bg-[#2563eb] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_10px_30px_-10px_rgba(37,99,235,0.8)] transition hover:bg-[#1d4ed8] border-none cursor-pointer">
                  Start Earning Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT INTEGRATES */}
      <section id="how" className="px-6 py-16 bg-white">
        <div className="mx-auto max-w-4xl">
          <div className="flex justify-center">
            <span className="inline-block rounded-full bg-blue-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 ring-1 ring-blue-200/60">Distribution</span>
          </div>
          <h2 className="mt-3 text-center text-2xl font-bold text-slate-900 sm:text-[28px]">How It Integrates Into Your Business</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-500">Two effortless distribution tools — no developer code required.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-[0_10px_30px_-15px_rgba(37,99,235,0.25)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600 ring-1 ring-blue-100">🔳</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Custom QR Codes for Physical Offices</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">Perfect for brick-and-mortar agencies. We provide premium desk displays for your agents' counters. When a client faces a delay, they scan the code on their mobile, and our platform automatically ties that lead to your payout account.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-[0_10px_30px_-15px_rgba(37,99,235,0.25)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600 ring-1 ring-blue-100">🔗</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Digital Tracking Links for Automation</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">Perfect for online bookings or digital communication. Seamlessly append your unique partner link inside automated ticket confirmations, digital itineraries, or post-booking "Fly Safe" transactional emails.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 STEPS */}
      <section className="bg-slate-50 px-6 py-16 ring-1 ring-slate-100">
        <div className="mx-auto max-w-4xl">
          <div className="flex justify-center">
            <span className="inline-block rounded-full bg-blue-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 ring-1 ring-blue-200/60">Simple Process</span>
          </div>
          <h2 className="mt-3 text-center text-2xl font-bold text-slate-900 sm:text-[28px]">Earning in Three Simple Steps</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">From application to your first payout — built to be effortless.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { n: '01', title: 'Apply & Get Approved', desc: 'Sign up in under two minutes. We verify your agency and activate your partner dashboard the same day.' },
              { n: '02', title: 'Distribute Your Assets', desc: 'Print your branded QR displays or drop your tracking link into emails and itineraries. No code required.' },
              { n: '03', title: 'Travelers Claim, You Earn', desc: 'When a passenger files a disruption claim, we handle everything and pay you €20 for every approved case.' },
            ].map(s => (
              <div key={s.n} className="relative rounded-2xl border border-slate-200 bg-white p-6 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#2563eb] text-xs font-bold text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.6)]">{s.n}</div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <button onClick={scrollToForm} className="rounded-lg bg-[#2563eb] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_10px_30px_-10px_rgba(37,99,235,0.8)] transition hover:bg-[#1d4ed8] border-none cursor-pointer">
              Apply Today
            </button>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section id="benefits" className="relative overflow-hidden px-6 py-16 text-white" style={{ background: 'linear-gradient(135deg, #0b1e4d 0%, #132a6b 50%, #1e40af 100%)' }}>
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px,#fff 1px,transparent 0)', backgroundSize: '18px 18px' }} />
        <div className="relative mx-auto max-w-4xl">
          <div className="flex justify-center">
            <span className="inline-block rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200 ring-1 ring-white/20">The Advantage</span>
          </div>
          <h2 className="mt-3 text-center text-2xl font-bold sm:text-[28px]">Why Do Travel Agencies Choose Us?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-blue-200">Everything you need to deliver high-quality client support and unlock an effective B2B asset.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '⚡', title: 'Instant Code-Free Setup', desc: 'Skip long tech backlogs. No APIs, complex tokens, or developer integration required. Deploy your QR assets right away.' },
              { icon: '🛡️', title: 'Zero Financial Risk', desc: 'No subscription costs, monthly retainers, or hidden fees. We only make money on a commission basis when your travelers win their cases.' },
              { icon: '📊', title: '100% Dashboard Transparency', desc: 'Access a comprehensive backend portal to track user scans, monitor real-time claim status pipelines, and evaluate pending payouts.' },
              { icon: '⚖️', title: 'Dedicated Legal Claims Engine', desc: 'Our in-house legal experts handle the entire compensation process end-to-end, from airline negotiation to litigation, so you never lift a finger.' },
            ].map(b => (
              <div key={b.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-sm">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-lg">{b.icon}</div>
                <h4 className="mt-3 text-sm font-bold text-white">{b.title}</h4>
                <p className="mt-2 text-[11px] leading-relaxed text-blue-200">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-6 py-16 bg-white">
        <div className="mx-auto max-w-3xl">
          <div className="flex justify-center">
            <span className="inline-block rounded-full bg-blue-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 ring-1 ring-blue-200/60">Questions</span>
          </div>
          <h2 className="mt-3 text-center text-2xl font-bold text-slate-900 sm:text-[28px]">Frequently Asked Questions</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-500">Everything you need to know before becoming a partner.</p>
          <div className="mt-10 space-y-3">
            {[
              { q: 'How much does it cost to join?', a: 'Absolutely nothing. There are no signup fees, monthly retainers, or hidden costs. You only earn — we take a share only when a passenger\'s claim is successfully paid out.' },
              { q: 'Do I need a developer to integrate?', a: 'No. Both our QR codes and tracking links work out of the box. Print a display or paste a link into your confirmation emails and you\'re live.' },
              { q: 'When and how do I get paid?', a: 'Commissions are aggregated in your dashboard and paid out monthly via bank transfer once an approved claim is settled with the airline.' },
              { q: 'Which flights are eligible for compensation?', a: 'Most delays over 3 hours, cancellations, and denied boardings under EU261 and similar regulations qualify. Our engine automatically screens eligibility.' },
            ].map(faq => (
              <details key={faq.q} className="group rounded-xl border border-slate-200 bg-white p-5 text-sm open:shadow-[0_10px_30px_-15px_rgba(15,23,42,0.2)]">
                <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-900 list-none">
                  {faq.q}
                  <span className="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600 transition-transform duration-200 group-open:rotate-45 group-open:bg-blue-600 group-open:text-white">+</span>
                </summary>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* REGISTER FORM */}
      <section className="relative overflow-hidden px-6 py-16 text-white" style={{ background: 'linear-gradient(135deg, #0b1e4d 0%, #132a6b 50%, #1e40af 100%)' }}>
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px,#fff 1px,transparent 0)', backgroundSize: '18px 18px' }} />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-[28px]">Start Earning Passive Revenue Today</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-blue-200">Be among the first agencies to partner with Claim Velo and turn flight disruptions into profit. Free to join, live within 24 hours.</p>
        </div>
        <div ref={formRef} className="relative mx-auto mt-8 max-w-xl scroll-mt-20">
          {submitted ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-green-200 bg-white p-10 text-center shadow-[0_20px_60px_-20px_rgba(16,185,129,0.25)]">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl ring-1 ring-green-200">✅</div>
              <h3 className="text-xl font-bold text-slate-900">Application Received!</h3>
              <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">
                Thanks, <span className="font-semibold text-slate-900">{name}</span>. The Claim Velo partnerships team will reach out within 1 business day to set up your account.
              </p>
              <button
                onClick={() => onNav('home')}
                className="mt-6 rounded-lg bg-[#2563eb] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#1d4ed8] border-none cursor-pointer"
              >
                Back to Home
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] sm:p-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">Agency / Company</label>
                  <input
                    required
                    placeholder="Acme Travel Co."
                    value={agency}
                    onChange={e => setAgency(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">Full Name</label>
                  <input
                    required
                    placeholder="Jane Doe"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">Business Email</label>
                <input
                  required
                  type="email"
                  placeholder="jane@acmetravel.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-lg bg-[#2563eb] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-[0_10px_30px_-10px_rgba(37,99,235,0.8)] transition hover:bg-[#1d4ed8] disabled:opacity-60 disabled:cursor-not-allowed border-none cursor-pointer"
              >
                {submitting ? 'Sending...' : 'Become a Partner →'}
              </button>
              <p className="text-center text-[10px] text-slate-400">No setup fees · No subscriptions · Cancel anytime</p>
            </form>
          )}
        </div>
      </section>

    </div>
  );
}
