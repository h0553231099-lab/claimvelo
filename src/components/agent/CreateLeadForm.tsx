import { useState } from 'react';
import { Plane, CheckCircle, AlertCircle, User, Mail, Phone } from 'lucide-react';

interface Props {
  agentCode: string;
  onCreated?: (claimRef: string) => void;
}

/**
 * Agent "Create Lead" form.
 *
 * Submits to the existing secure create-claim edge function with the agent's
 * code in the body. The server validates the code against worker_profiles and
 * attaches the permanent agent_id — the frontend never sets agent_id directly.
 * No Authorization header is sent, so customer_user_id stays null (the lead's
 * client is not the agent's own account).
 */
export default function CreateLeadForm({ agentCode, onCreated }: Props) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    flight: '', fdate: '', dep: '', arr: '', airline: '', issue: 'Delay',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const ISSUES = ['Delay', 'Cancellation', 'Denied Boarding', 'Missed Connection'];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('First name, last name, and email are required.');
      return;
    }
    if (!form.flight.trim() || !form.dep.trim() || !form.arr.trim()) {
      setError('Flight number, departure, and arrival are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          claim: {
            passenger_first_name: form.firstName.trim(),
            passenger_last_name: form.lastName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            address: '',
            country: 'United Kingdom',
            flight_number: form.flight.trim().toUpperCase(),
            flight_date: form.fdate || null,
            departure: form.dep.trim().toUpperCase(),
            arrival: form.arr.trim().toUpperCase(),
            airline: form.airline.trim(),
            issue_type: form.issue,
            airline_reason: '',
            // Attribution — server validates this code and resolves agent_id
            agent: agentCode || '—',
            loa_signed: false,
            signature_data: '',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed');
      setSuccess(`Lead created — ${data.claim_ref}. Attributed to your agent code ${agentCode}.`);
      setForm({ firstName: '', lastName: '', email: '', phone: '', flight: '', fdate: '', dep: '', arr: '', airline: '', issue: 'Delay' });
      onCreated?.(data.claim_ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead');
    }
    setSubmitting(false);
  }

  const inputCls = 'w-full px-3.5 py-2.5 border border-[#e2e8f0] rounded-[9px] text-[13px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 transition-all bg-white';
  const labelCls = 'block text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1.5';

  return (
    <div className="max-w-[640px]">
      <div className="mb-6">
        <h2 className="text-[20px] font-black text-[#0f172a]">Create a Lead</h2>
        <p className="text-[13px] text-[#64748b] mt-1">
          Submit a new claim on behalf of a client. It will be automatically attributed to your code{' '}
          <span className="font-mono font-bold text-[#2563eb]">{agentCode}</span>.
        </p>
      </div>

      <form onSubmit={submit} className="bg-white border border-[#e2e8f0] rounded-[14px] p-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>First name</label>
            <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Jane" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Last name</label>
            <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Smith" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}><Mail className="w-3 h-3 inline mr-1" />Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@email.com" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}><Phone className="w-3 h-3 inline mr-1" />Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Optional" className={inputCls} />
          </div>
        </div>

        <div className="border-t border-[#f1f5f9] pt-4">
          <div className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider mb-3">Flight details</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}><Plane className="w-3 h-3 inline mr-1" />Flight number</label>
              <input value={form.flight} onChange={e => setForm(f => ({ ...f, flight: e.target.value }))} placeholder="BA123" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={form.fdate} onChange={e => setForm(f => ({ ...f, fdate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Departure</label>
              <input value={form.dep} onChange={e => setForm(f => ({ ...f, dep: e.target.value }))} placeholder="LHR" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Arrival</label>
              <input value={form.arr} onChange={e => setForm(f => ({ ...f, arr: e.target.value }))} placeholder="JFK" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Airline</label>
              <input value={form.airline} onChange={e => setForm(f => ({ ...f, airline: e.target.value }))} placeholder="British Airways" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Issue type</label>
              <select value={form.issue} onChange={e => setForm(f => ({ ...f, issue: e.target.value }))} className={inputCls}>
                {ISSUES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[9px] text-[12px] text-[#dc2626]">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f0fdf4] border border-[#86efac] rounded-[9px] text-[12px] text-[#16a34a]">
            <CheckCircle className="w-4 h-4 shrink-0" />{success}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || !agentCode}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-[9px] text-[13px] font-semibold border-none cursor-pointer disabled:opacity-60 transition-colors"
          >
            <User className="w-4 h-4" />{submitting ? 'Creating...' : 'Create Lead'}
          </button>
          {!agentCode && <span className="text-[11px] text-[#dc2626]">No agent code — contact your manager.</span>}
        </div>
      </form>
    </div>
  );
}
