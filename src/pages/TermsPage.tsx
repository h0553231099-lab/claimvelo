import { Page } from '../types';
import { FileText, Mail, Phone, Globe, Building, ArrowRight } from 'lucide-react';

interface Props { onNav: (p: Page) => void; }

const Section = ({ num, title, children }: { num: string; title: string; children: React.ReactNode }) => (
  <div className="mb-10">
    <div className="flex items-start gap-3 mb-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-[#0f2744] text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{num}</span>
      <h2 className="text-[18px] font-extrabold text-[#0f172a]">{title}</h2>
    </div>
    <div className="pl-10 text-[14px] text-[#374151] leading-relaxed space-y-2">{children}</div>
  </div>
);

const List = ({ items }: { items: string[] }) => (
  <ul className="space-y-1.5 mt-2">
    {items.map(item => (
      <li key={item} className="flex items-start gap-2">
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2563eb] shrink-0" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

// Placeholder banner shown for sections where final legal wording is pending.
const PendingApproval = () => (
  <div className="mt-3 inline-flex items-center gap-1.5 bg-[#fffbeb] border border-[#fde68a] rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[#92400e]">
    <FileText className="w-3.5 h-3.5" />
    Draft copy — pending final business/legal approval
  </div>
);

export default function TermsPage({ onNav }: Props) {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Hero */}
      <div className="bg-[#0f2744] text-white text-center py-14 px-5">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-[11px] font-semibold mb-4 uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" /> Legal
        </div>
        <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold leading-tight mb-2">Terms of Service</h1>
        <p className="text-[14px] opacity-70">Last Updated: September 6, 2026</p>
      </div>

      <div className="max-w-[760px] mx-auto px-5 py-12">

        {/* Company card */}
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 mb-10 flex flex-col sm:flex-row gap-5">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Building className="w-4 h-4 text-[#2563eb]" />
              <span className="font-extrabold text-[15px] text-[#0f172a]">ClaimVelo Ltd.</span>
            </div>
            <p className="text-[13px] text-[#64748b]">New York State LLC – DOS ID: 7794857</p>
            <p className="text-[13px] text-[#64748b]">1265 55th St, Brooklyn, NY 11219, United States</p>
          </div>
          <div className="space-y-2 text-[13px]">
            <a href="mailto:support@claimvelo.com" className="flex items-center gap-2 text-[#2563eb] hover:underline">
              <Mail className="w-3.5 h-3.5" /> support@claimvelo.com
            </a>
            <a href="tel:+13477688926" className="flex items-center gap-2 text-[#2563eb] hover:underline">
              <Phone className="w-3.5 h-3.5" /> 347 768 8926
            </a>
            <a href="https://claimvelo.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#2563eb] hover:underline">
              <Globe className="w-3.5 h-3.5" /> claimvelo.com
            </a>
          </div>
        </div>

        <Section num="1" title="Acceptance of Terms">
          <p>By accessing the ClaimVelo website or submitting a claim, you agree to be bound by these Terms of Service and our <button onClick={() => onNav('privacy')} className="text-[#2563eb] hover:underline bg-transparent border-none cursor-pointer p-0 font-inherit">Privacy Policy</button>. If you do not agree, do not use our services.</p>
          <PendingApproval />
        </Section>

        <Section num="2" title="Our Service">
          <p>ClaimVelo Ltd. provides flight compensation claim management services. We evaluate eligibility, prepare and submit claims to airlines, negotiate on your behalf, and escalate to legal proceedings when necessary — all on a no-win, no-fee basis.</p>
          <List items={[
            'Free eligibility check and case review',
            'Claim preparation and submission to the airline',
            'Negotiation and follow-up with the airline',
            'Legal escalation when the airline refuses to pay',
          ]} />
        </Section>

        <Section num="3" title="Fees & Commission">
          <p>Our fee structure is simple and transparent — you pay nothing unless we win your claim:</p>
          <List items={[
            '30% success fee for claims settled directly with the airline',
            '50% success fee if legal action is required',
            'No charge for the eligibility check, case review, or unsuccessful claims',
            'Fees are deducted from the recovered compensation — no upfront costs',
          ]} />
          <p className="mt-2">Full fee details and worked examples are available on our <button onClick={() => onNav('fees')} className="text-[#2563eb] hover:underline bg-transparent border-none cursor-pointer p-0 font-inherit">Fees page</button>.</p>
        </Section>

        <Section num="4" title="Letter of Authority & Assignment">
          <p>By submitting a claim, you sign a Letter of Authority authorising ClaimVelo Ltd. to act as your representative and assigning your claim to us. This authorisation:</p>
          <List items={[
            'Grants us authority to communicate with the airline on your behalf',
            'Allows us to access flight records and relevant documentation',
            'Permits us to instruct legal counsel and commence proceedings if needed',
            'Authorises us to receive compensation on your behalf',
          ]} />
          <p className="mt-2">You may withdraw this authority at any time before a claim is submitted to the airline or court.</p>
        </Section>

        <Section num="5" title="Your Responsibilities">
          <p>To process your claim, you agree to:</p>
          <List items={[
            'Provide accurate and truthful information',
            'Submit required documents (booking confirmation, passport/ID, boarding passes)',
            'Respond to information requests in a timely manner',
            'Notify us of any direct communication or payment from the airline',
            'Not submit duplicate claims through other services simultaneously',
          ]} />
          <PendingApproval />
        </Section>

        <Section num="6" title="Compensation & Payout">
          <p>When compensation is recovered:</p>
          <List items={[
            'ClaimVelo deducts the applicable success fee (30% or 50%)',
            'The remaining balance is transferred to your bank account',
            'Payouts are processed within a reasonable timeframe after receipt of funds',
          ]} />
          <p className="mt-2 text-[#64748b] italic">Payout method and timing details to be finalised.</p>
          <PendingApproval />
        </Section>

        <Section num="7" title="Limitation of Liability">
          <p>To the maximum extent permitted by law, ClaimVelo Ltd. is not liable for:</p>
          <List items={[
            'Unsuccessful claim outcomes — you owe nothing if we do not win',
            'Delays caused by airlines, courts, or third parties',
            'Indirect or consequential losses',
          ]} />
          <p className="mt-2">Our total liability is limited to the success fee amount received for your claim.</p>
          <PendingApproval />
        </Section>

        <Section num="8" title="Termination">
          <p>Either party may terminate the service relationship:</p>
          <List items={[
            'You may withdraw your claim before it is submitted to the airline',
            'ClaimVelo may decline or close a claim if eligibility is not established',
            'If compensation is received directly from the airline after termination, our success fee may still apply',
          ]} />
          <PendingApproval />
        </Section>

        <Section num="9" title="Governing Law">
          <p>These Terms are governed by the laws applicable to your claim jurisdiction. Disputes will be resolved in the courts of the relevant jurisdiction.</p>
          <PendingApproval />
        </Section>

        <Section num="10" title="Changes to These Terms">
          <p>We may update these Terms from time to time. The most current version will always be available on this page with the updated date.</p>
        </Section>

        {/* CTA */}
        <div className="mt-12 bg-[#0f2744] text-white rounded-2xl p-8 text-center">
          <h3 className="text-[20px] font-extrabold mb-2">Questions about our terms?</h3>
          <p className="text-[14px] opacity-80 mb-6">We're happy to clarify anything before you start your claim.</p>
          <a
            href="mailto:support@claimvelo.com"
            className="inline-flex items-center gap-2 bg-white text-[#0f2744] px-6 py-3 rounded-xl text-[14px] font-bold hover:bg-[#f0f4ff] transition-colors"
          >
            Contact Us <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
