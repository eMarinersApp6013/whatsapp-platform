import React, { useState, useEffect } from 'react';
import { Send, Users, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import api from '../utils/api';
import { formatDate, formatDateTime } from '../utils/helpers';

const AUDIENCES = [
  { value: 'all', label: 'All Customers', icon: Users },
  { value: 'vip', label: 'VIP Only', icon: CheckCircle },
  { value: 'inactive_30days', label: 'Inactive 30 Days', icon: Clock },
  { value: 'custom', label: 'Custom List', icon: Users },
];

export default function Broadcast() {
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all');
  const [customPhones, setCustomPhones] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState(0);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await api.get('/api/broadcast');
      setHistory(res.data.broadcasts || res.data || []);
    } catch (err) {
      console.error('Load broadcast history error:', err);
    } finally {
      setLoading(false);
    }
  };

  const prepareSend = async () => {
    if (!message.trim()) return alert('Please enter a message');
    try {
      const res = await api.get('/api/clients', { params: { audience } });
      const count = res.data.clients?.length || res.data?.length || 0;
      setEstimatedCount(audience === 'custom' ? customPhones.split('\n').filter(Boolean).length : count);
      setConfirmModal(true);
    } catch {
      setEstimatedCount(0);
      setConfirmModal(true);
    }
  };

  const sendBroadcast = async () => {
    setSending(true);
    setConfirmModal(false);
    try {
      const payload = { message, audience };
      if (audience === 'custom') {
        payload.phones = customPhones.split('\n').map((p) => p.trim()).filter(Boolean);
      }
      await api.post('/api/broadcast', payload);
      setMessage('');
      setCustomPhones('');
      await loadHistory();
    } catch (err) {
      alert('Broadcast failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Compose Broadcast</h2>

          {/* Audience Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Audience</label>
            <div className="grid grid-cols-2 gap-2">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAudience(a.value)}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition ${
                    audience === a.value
                      ? 'border-primary-500 bg-primary-50 text-primary-600'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <a.icon className="w-4 h-4" />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom phones */}
          {audience === 'custom' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Numbers (one per line)</label>
              <textarea
                value={customPhones}
                onChange={(e) => setCustomPhones(e.target.value)}
                rows={4}
                placeholder="919876543210&#10;919876543211"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none font-mono"
              />
            </div>
          )}

          {/* Message */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Type your broadcast message..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              maxLength={4096}
            />
            <p className="text-xs text-gray-400 mt-1">{message.length}/4096</p>
          </div>

          <button
            onClick={prepareSend}
            disabled={sending || !message.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">WhatsApp Preview</h2>
          <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-[300px]">
            <div className="bg-[#dcf8c6] max-w-[80%] ml-auto rounded-lg px-3 py-2 shadow-sm">
              <p className="text-sm whitespace-pre-wrap text-gray-800">
                {message || 'Your message will appear here...'}
              </p>
              <p className="text-[10px] text-gray-500 text-right mt-1">
                {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Broadcast History</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No broadcasts sent yet</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Message</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Audience</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Sent</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Failed</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">{b.message}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-primary-50 text-primary-600 text-xs rounded-full">
                      {b.audience}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-green-600 font-medium">{b.sent_count || 0}</td>
                  <td className="px-4 py-3 text-sm text-center text-red-600 font-medium">{b.failed_count || 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Confirm Broadcast</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              This will send to <strong>{estimatedCount}</strong> customers. Are you sure?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={sendBroadcast}
                className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
              >
                Confirm Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
