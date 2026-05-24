import { Page } from '../types';
import { Plane, ShieldCheck, Clock, Star, Award, TrendingUp, Globe, Heart, Users, Scale } from 'lucide-react';

interface Props { onNav: (p: Page) => void; }


const VALUES = [
  {
    icon: ShieldCheck,
    title: 'Transparent & Fair',
    desc: 'We charge 30% on standard claims. 50% only if a lawyer is needed. No upfront fees, ever.',
    color: '#2563eb',
    bg: '#eff6ff',
  },
  {
    icon: Clock,
    title: 'Fast Resolution',
    desc: 'Our streamlined process handles your claim efficiently. Average resolution time: 28 days.',
    color: '#059669',
    bg: '#f0fdf4',
  },
  {
    icon: Star,
    title: 'Expert Knowledge',
    desc: 'Our specialists know every airline tactic and regulation inside out. We fight back on your behalf.',
    color: '#d97706',
    bg: '#fffbeb',
  },
  {
    icon: Heart,
    title: 'Passenger First',
    desc: 'We built every feature around the passenger experience. Clear updates, plain language, zero jargon.',
    color: '#dc2626',
    bg: '#fef2f2',
  },
];

const TEAM = [
  {
    name: 'Legal & Compliance',
    desc: 'Our aviation law specialists know EU261, UK261, and Israeli law inside out — and challenge every unlawful airline rejection.',
    icon: Scale,
    color: '#2563eb',
    bg: '#eff6ff',
  },
  {
    name: 'Claims Operations',
    desc: 'Dedicated claim handlers manage every step of your case — from initial submission to final payout.',
    icon: Users,
    color: '#059669',
    bg: '#f0fdf4',
  },
  {
    name: 'Customer Support',
    desc: 'Real people available to answer your questions at every stage. No bots, no runaround.',
    icon: Heart,
    color: '#d97706',
    bg: '#fffbeb',
  },
];

export default function AboutPage({ onNav }: Props) {
  return (
    <div className="bg-[#f8fafc] min-h-screen">

      {/* Hero */}
      <div className="relative overflow-hidden bg-[#0f172a]">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 30% 50%, #2563eb 0%, transparent 60%), radial-gradient(circle at 80% 20%, #0891b2 0%, transparent 50%)',
          }}
        />
        <div className="relative max-w-[900px] mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-6">
            <Plane className="w-3.5 h-3.5 text-[#60a5fa]" />
            <span className="text-[12px] font-bold text-[#93c5fd] tracking-wider uppercase">Passenger Rights Specialists</span>
          </div>
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-black text-white mb-5 leading-tight">
            Winning Compensation<br />for Passengers, Every Day.
          </h1>
          <p className="text-[16px] text-[#94a3b8] max-w-[580px] mx-auto leading-relaxed mb-8">
            ClaimVelo was built on a simple belief: every passenger delayed, cancelled, or denied boarding deserves to be compensated — without having to battle airlines alone.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => onNav('claim')}
              className="px-7 py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-[14px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              Start Your Claim
            </button>
            <button
              onClick={() => onNav('signin')}
              className="px-7 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-[14px] rounded-xl border border-white/20 cursor-pointer transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>


      {/* Our Story */}
      <div className="max-w-[900px] mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#eff6ff] rounded-full px-3 py-1 mb-4">
              <Globe className="w-3.5 h-3.5 text-[#2563eb]" />
              <span className="text-[11px] font-bold text-[#2563eb] uppercase tracking-wider">Our Mission</span>
            </div>
            <h2 className="text-[26px] font-black text-[#0f172a] leading-tight mb-4">
              We fight the airlines so you don't have to
            </h2>
            <p className="text-[14px] text-[#475569] leading-relaxed mb-4">
              Airlines receive billions in compensation claims each year — yet most passengers never see a penny. They count on passengers not knowing their rights, or giving up out of frustration.
            </p>
            <p className="text-[14px] text-[#475569] leading-relaxed mb-4">
              Under EU Regulation 261/2004, UK261, and Israeli Aviation Services Law, passengers are entitled to up to €600 per person for qualifying delays, cancellations, and denied boardings. These rights exist whether or not your airline tells you about them.
            </p>
            <p className="text-[14px] text-[#475569] leading-relaxed">
              ClaimVelo was built to level the playing field. Our specialist team checks eligibility in seconds, handles every letter and legal step, and you only pay when we win.
            </p>
          </div>
          <div className="relative">
            <img
              src="https://images.pexels.com/photos/358319/pexels-photo-358319.jpeg?auto=compress&cs=tinysrgb&w=600"
              alt="Airport terminal departure board"
              className="w-full rounded-2xl shadow-lg object-cover h-[320px]"
            />
            <div className="absolute -bottom-4 -left-4 bg-white rounded-xl border border-[#e2e8f0] shadow-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#f0fdf4] flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-[#059669]" />
                </div>
                <div>
                  <div className="text-[11px] text-[#64748b]">This month</div>
                  <div className="font-bold text-[13px] text-[#0f172a]">800+ claims filed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coverage */}
      <div className="bg-white border-y border-[#e2e8f0]">
        <div className="max-w-[900px] mx-auto px-6 py-14">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-[#eff6ff] rounded-full px-3 py-1 mb-4">
              <Globe className="w-3.5 h-3.5 text-[#2563eb]" />
              <span className="text-[11px] font-bold text-[#2563eb] uppercase tracking-wider">Regulations We Cover</span>
            </div>
            <h2 className="text-[24px] font-black text-[#0f172a] mb-2">Four Jurisdictions. One Service.</h2>
            <p className="text-[14px] text-[#64748b] max-w-[520px] mx-auto">We handle claims under all major passenger rights frameworks — so no matter where you flew, we've got you covered.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { flag: '🇪🇺', reg: 'EU261/2004', max: '€600', detail: 'Flights departing EU airports or operated by EU airlines into the EU' },
              { flag: '🇬🇧', reg: 'UK261', max: '£520', detail: 'Flights departing UK airports or operated by UK airlines into the UK' },
              { flag: '🇮🇱', reg: 'Israeli Aviation Law', max: '₪3,530', detail: 'Flights departing Israeli airports' },
              { flag: '🇺🇸', reg: 'US DOT Rules', max: '400%', detail: 'Denied boarding on US domestic and international flights' },
            ].map(r => (
              <div key={r.reg} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 text-center">
                <div className="text-3xl mb-2">{r.flag}</div>
                <div className="font-extrabold text-[13px] text-[#0f172a] mb-1">{r.reg}</div>
                <div className="text-[16px] font-black text-[#2563eb] mb-1.5">Up to {r.max}</div>
                <div className="text-[11px] text-[#64748b] leading-relaxed">{r.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Values */}
      <div className="bg-[#f8fafc]">
        <div className="max-w-[900px] mx-auto px-6 py-14">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-[#fffbeb] rounded-full px-3 py-1 mb-4">
              <Award className="w-3.5 h-3.5 text-[#d97706]" />
              <span className="text-[11px] font-bold text-[#d97706] uppercase tracking-wider">Our Values</span>
            </div>
            <h2 className="text-[24px] font-black text-[#0f172a]">How We Work</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {VALUES.map(v => (
              <div key={v.title} className="rounded-2xl border border-[#e2e8f0] p-5 hover:shadow-md transition-shadow bg-white">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: v.bg }}>
                  <v.icon className="w-5 h-5" style={{ color: v.color }} />
                </div>
                <div className="font-extrabold text-[13px] text-[#0f172a] mb-1.5">{v.title}</div>
                <div className="text-[12px] text-[#64748b] leading-relaxed">{v.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team functions */}
      <div className="bg-white border-y border-[#e2e8f0]">
        <div className="max-w-[900px] mx-auto px-6 py-14">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-[#f0fdf4] rounded-full px-3 py-1 mb-4">
              <Users className="w-3.5 h-3.5 text-[#059669]" />
              <span className="text-[11px] font-bold text-[#059669] uppercase tracking-wider">Our Team</span>
            </div>
            <h2 className="text-[24px] font-black text-[#0f172a] mb-2">Specialists in Your Corner</h2>
            <p className="text-[14px] text-[#64748b] max-w-[500px] mx-auto">Every claim is handled by real aviation law and claims experts — not automated scripts.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TEAM.map(t => (
              <div key={t.name} className="rounded-2xl border border-[#e2e8f0] p-6 hover:shadow-md transition-shadow bg-[#f8fafc]">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: t.bg }}>
                  <t.icon className="w-6 h-6" style={{ color: t.color }} />
                </div>
                <div className="font-extrabold text-[14px] text-[#0f172a] mb-2">{t.name}</div>
                <div className="text-[13px] text-[#64748b] leading-relaxed">{t.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-white border-t border-[#e2e8f0]">
        <div className="max-w-[600px] mx-auto px-6 py-14 text-center">
          <h2 className="text-[22px] font-black text-[#0f172a] mb-3">Ready to Claim What You're Owed?</h2>
          <p className="text-[14px] text-[#64748b] mb-6">It takes under 2 minutes to submit your claim. No win, no fee — ever.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => onNav('claim')}
              className="px-7 py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-[13px] rounded-xl border-none cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              Start My Claim — Free
            </button>
            <button
              onClick={() => onNav('home')}
              className="px-7 py-3 bg-[#f8fafc] hover:bg-[#e2e8f0] text-[#0f172a] font-bold text-[13px] rounded-xl border border-[#e2e8f0] cursor-pointer transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
