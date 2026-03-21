import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Store, MessageSquare, FileText, Truck, CreditCard, Users, Bot, Bell } from 'lucide-react';
import api from '../utils/api';

const TABS = [
  { key: 'store', label: 'Store Info', icon: Store },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { key: 'invoice', label: 'Invoice', icon: FileText },
  { key: 'shipping', label: 'Shipping', icon: Truck },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'staff', label: 'Staff Numbers', icon: Users },
  { key: 'ai', label: 'AI Prompt', icon: Bot },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('store');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffNumbers, setStaffNumbers] = useState([]);
  const [newStaff, setNewStaff] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await api.get('/api/settings');
      const data = res.data.settings || res.data || {};
      setSettings(data);
      setStaffNumbers(data.staff_numbers || []);
    } catch (err) {
      console.error('Load settings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updates) => {
    setSaving(true);
    try {
      await api.put('/api/settings', updates || settings);
      await loadSettings();
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  const addStaff = () => {
    if (!newStaff.trim()) return;
    const updated = [...staffNumbers, newStaff.trim()];
    setStaffNumbers(updated);
    setNewStaff('');
    saveSettings({ ...settings, staff_numbers: updated });
  };

  const removeStaff = (phone) => {
    const updated = staffNumbers.filter((s) => s !== phone);
    setStaffNumbers(updated);
    saveSettings({ ...settings, staff_numbers: updated });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'store':
        return (
          <div className="space-y-4">
            <Field label="Store Name" value={settings.store_name} onChange={(v) => updateField('store_name', v)} />
            <Field label="Store Address" value={settings.store_address} onChange={(v) => updateField('store_address', v)} multiline />
            <Field label="GSTIN" value={settings.store_gstin} onChange={(v) => updateField('store_gstin', v)} />
            <Field label="Phone" value={settings.store_phone} onChange={(v) => updateField('store_phone', v)} />
            <Field label="Logo URL" value={settings.logo_url} onChange={(v) => updateField('logo_url', v)} />
          </div>
        );
      case 'whatsapp':
        return (
          <div className="space-y-4">
            <Field label="Phone Number ID" value={settings.wa_phone_number_id} onChange={(v) => updateField('wa_phone_number_id', v)} />
            <Field label="WhatsApp Business Account ID" value={settings.wa_business_account_id} onChange={(v) => updateField('wa_business_account_id', v)} />
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700">
              WhatsApp is connected via Meta Cloud API. Access token is configured in environment variables.
            </div>
          </div>
        );
      case 'invoice':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Invoice Provider</label>
              <select
                value={settings.invoice_provider || 'builtin'}
                onChange={(e) => updateField('invoice_provider', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="builtin">Built-in PDFKit</option>
                <option value="zoho">Zoho Books</option>
              </select>
            </div>
            {settings.invoice_provider === 'zoho' && (
              <>
                <Field label="Zoho Client ID" value={settings.zoho_client_id} onChange={(v) => updateField('zoho_client_id', v)} />
                <Field label="Zoho Client Secret" value={settings.zoho_client_secret} onChange={(v) => updateField('zoho_client_secret', v)} type="password" />
                <Field label="Zoho Refresh Token" value={settings.zoho_refresh_token} onChange={(v) => updateField('zoho_refresh_token', v)} type="password" />
                <Field label="Zoho Organization ID" value={settings.zoho_org_id} onChange={(v) => updateField('zoho_org_id', v)} />
              </>
            )}
            <h3 className="text-sm font-semibold text-gray-800 mt-4">Bank Details (for COD invoices)</h3>
            <Field label="Bank Name" value={settings.bank_name} onChange={(v) => updateField('bank_name', v)} />
            <Field label="Account Number" value={settings.bank_account} onChange={(v) => updateField('bank_account', v)} />
            <Field label="IFSC Code" value={settings.bank_ifsc} onChange={(v) => updateField('bank_ifsc', v)} />
            <Field label="UPI ID" value={settings.upi_id} onChange={(v) => updateField('upi_id', v)} />
          </div>
        );
      case 'shipping':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Courier Partners</h3>
            <div className="space-y-2">
              {['iCarry', 'Shiprocket', 'Delhivery', 'Xpressbees', 'ShipMozo'].map((courier) => (
                <div key={courier} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <span className="text-sm text-gray-800">{courier}</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings[`courier_${courier.toLowerCase()}_enabled`] !== false}
                      onChange={(e) => updateField(`courier_${courier.toLowerCase()}_enabled`, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-primary-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  </label>
                </div>
              ))}
            </div>
            <h3 className="text-sm font-semibold text-gray-800 mt-4">Zone Shipping Rates</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Zone</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">0-500g</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">500g-1kg</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">1-2kg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {['Local', 'North', 'South', 'East', 'West', 'NorthEast', 'Remote'].map((zone) => (
                    <tr key={zone}>
                      <td className="px-4 py-2 text-sm text-gray-800">{zone}</td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          defaultValue={settings[`shipping_${zone.toLowerCase()}_500`] || 50}
                          onBlur={(e) => updateField(`shipping_${zone.toLowerCase()}_500`, parseInt(e.target.value))}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-center"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          defaultValue={settings[`shipping_${zone.toLowerCase()}_1000`] || 80}
                          onBlur={(e) => updateField(`shipping_${zone.toLowerCase()}_1000`, parseInt(e.target.value))}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-center"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          defaultValue={settings[`shipping_${zone.toLowerCase()}_2000`] || 120}
                          onBlur={(e) => updateField(`shipping_${zone.toLowerCase()}_2000`, parseInt(e.target.value))}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-center"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'payment':
        return (
          <div className="space-y-4">
            <Field label="Cashfree App ID" value={settings.cashfree_app_id} onChange={(v) => updateField('cashfree_app_id', v)} />
            <Field label="Cashfree Secret Key" value={settings.cashfree_secret_key} onChange={(v) => updateField('cashfree_secret_key', v)} type="password" />
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.cod_enabled !== false}
                onChange={(e) => updateField('cod_enabled', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label className="text-sm text-gray-700">Enable COD (Cash on Delivery)</label>
            </div>
            <Field label="COD Extra Charge" value={settings.cod_extra_charge} onChange={(v) => updateField('cod_extra_charge', v)} type="number" />
            <Field label="Prepaid Discount" value={settings.prepaid_discount} onChange={(v) => updateField('prepaid_discount', v)} type="number" />
          </div>
        );
      case 'staff':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newStaff}
                onChange={(e) => setNewStaff(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStaff()}
                placeholder="919876543210"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <button
                onClick={addStaff}
                className="flex items-center gap-1 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
            <div className="space-y-2">
              {staffNumbers.map((phone) => (
                <div key={phone} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <span className="text-sm text-gray-800 font-mono">{phone}</span>
                  <button
                    onClick={() => removeStaff(phone)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {staffNumbers.length === 0 && (
                <p className="text-sm text-gray-400">No staff numbers configured</p>
              )}
            </div>
          </div>
        );
      case 'ai':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custom AI System Prompt</label>
              <textarea
                value={settings.custom_ai_prompt || ''}
                onChange={(e) => updateField('custom_ai_prompt', e.target.value)}
                rows={12}
                placeholder="Add custom instructions for the AI assistant. This will be appended to the default system prompt."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none font-mono"
              />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
              The AI uses GPT-4o with a system prompt that includes your store name, product catalog, client info, and conversation history. Custom instructions above will be appended.
            </div>
          </div>
        );
      case 'notifications':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">Daily Sales Summary</p>
                <p className="text-xs text-gray-500">Receive daily summary at 7pm IST</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.daily_summary_enabled !== false}
                  onChange={(e) => updateField('daily_summary_enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-primary-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">Low Stock Alerts</p>
                <p className="text-xs text-gray-500">Alert when stock drops below threshold</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.stock_alert_enabled !== false}
                  onChange={(e) => updateField('stock_alert_enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-primary-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
            <Field
              label="Default Stock Alert Threshold"
              value={settings.default_stock_threshold || 5}
              onChange={(v) => updateField('default_stock_threshold', v)}
              type="number"
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      {/* Tabs sidebar */}
      <div className="w-48 bg-white rounded-xl shadow-sm border border-gray-100 p-2 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition mb-1 ${
              activeTab === tab.key
                ? 'bg-primary-50 text-primary-600 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-800">
            {TABS.find((t) => t.key === activeTab)?.label}
          </h2>
          <button
            onClick={() => saveSettings()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        {renderTab()}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', multiline = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        />
      )}
    </div>
  );
}
