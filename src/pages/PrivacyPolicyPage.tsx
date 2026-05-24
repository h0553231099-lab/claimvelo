import { Page } from '../types';
import { Shield, Mail, Globe, Building, ArrowRight } from 'lucide-react';

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

export default function PrivacyPolicyPage({ onNav }: Props) {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Hero */}
      <div className="bg-[#0f2744] text-white text-center py-14 px-5">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-[11px] font-semibold mb-4 uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5" /> Legal
        </div>
        <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold leading-tight mb-2">Privacy Policy</h1>
        <p className="text-[14px] opacity-70">Last Updated: January 6, 2026</p>
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
            <p className="text-[13px] text-[#64748b]">4604 New Utrecht Ave #1008, Brooklyn, NY 11219, United States</p>
          </div>
          <div className="space-y-2 text-[13px]">
            <a href="mailto:info@claimvelo.com" className="flex items-center gap-2 text-[#2563eb] hover:underline">
              <Mail className="w-3.5 h-3.5" /> info@claimvelo.com
            </a>
            <a href="https://claimvelo.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#2563eb] hover:underline">
              <Globe className="w-3.5 h-3.5" /> claimvelo.com
            </a>
          </div>
        </div>

        <Section num="1" title="Company Information">
          <p>ClaimVelo Ltd. provides flight compensation and passenger rights claim services.</p>
        </Section>

        <Section num="2" title="Scope & Applicability">
          <p>This Privacy Policy explains how we collect, use, store, and protect personal data when users access our website or use our services. This Policy applies to users located in:</p>
          <List items={['European Union (EU)', 'United Kingdom (UK)', 'United States', 'Canada', 'Israel', 'Brazil']} />
        </Section>

        <Section num="3" title="GDPR & UK GDPR Representatives">
          <div className="space-y-4">
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4">
              <div className="font-semibold text-[#0f172a] mb-1">EU GDPR Article 27 Representative</div>
              <p>Euverify Ltd (Ireland)</p>
              <p className="text-[#64748b]">Unit 3D North Point House, North Point Business Park, New Mallow Road, Cork, T23 AT2P, Ireland</p>
              <a href="mailto:gdpr@euverify.com" className="text-[#2563eb] hover:underline mt-1 inline-block">gdpr@euverify.com</a>
            </div>
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4">
              <div className="font-semibold text-[#0f172a] mb-1">UK GDPR Article 27 Representative</div>
              <p>Euverify Ltd (UK)</p>
              <p className="text-[#64748b]">3rd Floor, 86–90 Paul Street, London, EC2A 4NE, United Kingdom</p>
              <a href="mailto:gdpr@euverify.com" className="text-[#2563eb] hover:underline mt-1 inline-block">gdpr@euverify.com</a>
            </div>
          </div>
        </Section>

        <Section num="4" title="Why We Collect Personal Data">
          <p>We collect and process personal data only because it is necessary to:</p>
          <List items={[
            'Evaluate eligibility for flight compensation',
            'Prepare, submit, negotiate, and enforce claims',
            'Assign claims to our company',
            'Communicate with airlines, regulators, courts, and legal partners',
            'Engage external lawyers when court action is required',
            'Verify identity and prevent fraud',
            'Process payments and payouts',
            'Comply with legal and regulatory obligations',
            'Improve website functionality, analytics, and marketing effectiveness',
          ]} />
          <p className="mt-3 text-[#64748b] italic">If you do not provide the required data, we cannot provide our services.</p>
        </Section>

        <Section num="5" title="Personal Data We Collect">
          <p>We may collect and process the following categories of data:</p>
          <List items={[
            'Full name',
            'Email address',
            'Phone number',
            'Residential address',
            'Passport or government ID',
            'Boarding passes',
            'Flight and booking details',
            'Bank or payout details (processed via Wise Banking USA Inc.)',
            'Uploaded documents (PDFs, images)',
            'IP address, browser, and device data',
            'Cookies and tracking identifiers',
            'Marketing interaction data',
          ]} />
        </Section>

        <Section num="6" title="Legal Bases for Processing">
          <p>Where required by law (EU/UK GDPR), we rely on the following legal bases:</p>
          <List items={[
            'Performance of a contract',
            'Legitimate business interests',
            'Legal obligations',
            'User consent (where applicable)',
            'Explicit consent for sensitive identity documents',
          ]} />
        </Section>

        <Section num="7" title="Claim Assignment & Legal Authorization">
          <p>By submitting a claim, you expressly authorize ClaimVelo Ltd. to:</p>
          <List items={[
            'Act on your behalf',
            'Assign your claim to the company',
            'Share necessary personal data with airlines, courts, regulators, and external law firms',
          ]} />
          <p className="mt-3 font-medium text-[#0f172a]">This processing is essential to the service and cannot be restricted once a claim is submitted.</p>
        </Section>

        <Section num="8" title="Minors">
          <p>Claims involving individuals under 18 years of age are accepted only with verified consent and documentation from a parent or legal guardian.</p>
        </Section>

        <Section num="9" title="Third Parties & Data Processors">
          <p>We may share personal data with trusted third parties, including:</p>
          <div className="mt-3 space-y-2">
            {[
              { label: 'Payments', value: 'Wise Banking USA Inc.' },
              { label: 'Cloud Hosting & CRM', value: 'Amazon Web Services (AWS – US-East-1)' },
              { label: 'Email Services', value: 'Microsoft Outlook' },
              { label: 'Analytics & Marketing', value: 'Google Analytics, Meta (Facebook)' },
              { label: 'Legal Services', value: 'External partner law firms (when required)' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-4 py-2.5">
                <span className="font-semibold text-[#0f172a] shrink-0 min-w-[140px]">{label}:</span>
                <span className="text-[#64748b]">{value}</span>
              </div>
            ))}
          </div>
          <p className="mt-3">All third parties are contractually required to protect personal data.</p>
        </Section>

        <Section num="10" title="International Data Transfers">
          <p>Your data may be transferred to and stored in countries outside your own, including the United States. Where required, we rely on:</p>
          <List items={[
            'EU Standard Contractual Clauses (SCCs)',
            'UK International Data Transfer Agreement (IDTA)',
            'Other lawful safeguards',
          ]} />
        </Section>

        <Section num="11" title="Cookies & Tracking">
          <p>We use:</p>
          <List items={[
            'Essential session cookies',
            'Analytics cookies',
            'Marketing and retargeting cookies',
          ]} />
          <p className="mt-2">A cookie consent banner is implemented on our website.</p>
        </Section>

        <Section num="12" title="Your Rights & Requests">
          <p>Depending on your location, you may request:</p>
          <List items={[
            'Access to your personal data',
            'Correction of inaccurate data',
            'Deletion (where legally permitted)',
            'Restriction or objection to processing',
            'Data portability',
            'Withdrawal of consent',
          ]} />
          <div className="mt-4 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-3.5 flex items-start gap-3">
            <Mail className="w-4 h-4 text-[#2563eb] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#0f172a]">Submit requests to:</p>
              <a href="mailto:support@claimvelo.com" className="text-[#2563eb] hover:underline">support@claimvelo.com</a>
              <p className="text-[13px] text-[#64748b] mt-1">We may request identity verification. Certain requests may be lawfully denied where data is required for legal claims or compliance.</p>
            </div>
          </div>
        </Section>

        <Section num="13" title="Data Retention">
          <p>We retain personal data for up to <strong>three (3) years</strong>, or until the related claim has been completed, resolved, or closed — whichever occurs first — unless a longer retention period is required by law or for legal defense purposes.</p>
          <p className="mt-2">After this period, data is securely deleted or anonymized.</p>
        </Section>

        <Section num="14" title="Data Security">
          <p>We apply reasonable administrative, technical, and organizational safeguards. However, no system can be guaranteed to be completely secure.</p>
        </Section>

        <Section num="15" title="Personal Data Breaches">
          <p>If a personal data breach occurs:</p>
          <List items={[
            'We will assess the risk',
            'Notify authorities where legally required',
            'Inform affected users when required by law',
          ]} />
        </Section>

        <Section num="16" title="Limitation of Responsibility">
          <p>To the maximum extent permitted by law, we are not responsible for unauthorized access beyond our reasonable control.</p>
        </Section>

        {/* CTA */}
        <div className="mt-12 bg-[#0f2744] text-white rounded-2xl p-8 text-center">
          <h3 className="text-[20px] font-extrabold mb-2">Questions about your data?</h3>
          <p className="text-[14px] opacity-80 mb-6">Our privacy team is here to help with any questions or requests.</p>
          <a
            href="mailto:support@claimvelo.com"
            className="inline-flex items-center gap-2 bg-white text-[#0f2744] px-6 py-3 rounded-xl text-[14px] font-bold hover:bg-[#f0f4ff] transition-colors"
          >
            Contact Privacy Team <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
