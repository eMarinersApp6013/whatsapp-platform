import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Truck, CheckCircle } from 'lucide-react';
import api from '../utils/api';
import { formatCurrency, formatDate, statusColor } from '../utils/helpers';

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadOrder = async () => {
    try {
      const res = await api.get(`/api/orders/${id}`);
      setOrder(res.data);
      if (res.data.status === 'CONFIRMED' || res.data.status === 'PAID') {
        loadRates();
      }
    } catch (err) {
      console.error('Load order error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRates = async () => {
    try {
      const res = await api.get(`/api/courier/rates/${id}`);
      setRates(res.data.rates || []);
    } catch (err) {
      console.error('Load rates error:', err);
    }
  };

  const approveInvoice = async () => {
    setApproving(true);
    try {
      await api.post(`/api/orders/${id}/approve-invoice`);
      await loadOrder();
    } catch (err) {
      alert('Failed to approve invoice: ' + (err.response?.data?.error || err.message));
    } finally {
      setApproving(false);
    }
  };

  const approveCourier = async (courierName) => {
    setApproving(true);
    try {
      await api.post(`/api/orders/${id}/approve-courier`, { courier_name: courierName });
      await loadOrder();
    } catch (err) {
      alert('Failed to book courier: ' + (err.response?.data?.error || err.message));
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!order) {
    return <p className="text-gray-500">Order not found</p>;
  }

  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/orders')} className="p-2 hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Order #{order.order_number || order.id}</h2>
          <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full mt-1 ${statusColor(order.status)}`}>
            {order.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Order Items</h3>
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3 text-sm text-gray-800">{item.name || item.product_name}</td>
                    <td className="py-3 text-sm text-center text-gray-600">{item.qty || item.quantity}</td>
                    <td className="py-3 text-sm text-right text-gray-600">{formatCurrency(item.price)}</td>
                    <td className="py-3 text-sm text-right font-medium">{formatCurrency((item.qty || item.quantity) * item.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200">
                <tr>
                  <td colSpan="3" className="py-3 text-sm font-semibold text-right">Subtotal</td>
                  <td className="py-3 text-sm font-semibold text-right">{formatCurrency(order.subtotal || order.total_amount)}</td>
                </tr>
                {order.shipping_charge > 0 && (
                  <tr>
                    <td colSpan="3" className="py-1 text-sm text-gray-500 text-right">Shipping</td>
                    <td className="py-1 text-sm text-right">{formatCurrency(order.shipping_charge)}</td>
                  </tr>
                )}
                {order.gst_amount > 0 && (
                  <tr>
                    <td colSpan="3" className="py-1 text-sm text-gray-500 text-right">GST</td>
                    <td className="py-1 text-sm text-right">{formatCurrency(order.gst_amount)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan="3" className="py-3 text-base font-bold text-right">Total</td>
                  <td className="py-3 text-base font-bold text-right text-primary-500">{formatCurrency(order.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Invoice Approval */}
          {(order.status === 'CONFIRMED' || order.status === 'PAID') && !order.invoice_sent && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-yellow-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-yellow-600" />
                  <div>
                    <h3 className="font-semibold text-gray-800">Invoice Pending Approval</h3>
                    <p className="text-sm text-gray-500">Approve to generate and send invoice to customer</p>
                  </div>
                </div>
                <button
                  onClick={approveInvoice}
                  disabled={approving}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 transition disabled:opacity-60"
                >
                  {approving ? 'Approving...' : 'Approve Invoice'}
                </button>
              </div>
            </div>
          )}

          {/* Courier Comparison */}
          {rates.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="w-5 h-5 text-primary-500" />
                <h3 className="text-lg font-semibold text-gray-800">Courier Rates</h3>
              </div>
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Courier</th>
                    <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase">ETA</th>
                    <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase">COD</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rates.map((rate, idx) => (
                    <tr key={idx} className={rate.recommended ? 'bg-green-50' : ''}>
                      <td className="py-3 text-sm text-gray-800">
                        {rate.courier}
                        {rate.recommended && (
                          <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                            Recommended
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-sm text-center font-medium">{formatCurrency(rate.rate)}</td>
                      <td className="py-3 text-sm text-center text-gray-600">{rate.eta || '-'}</td>
                      <td className="py-3 text-sm text-center">
                        {rate.cod_available ? (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 text-sm text-right">
                        <button
                          onClick={() => approveCourier(rate.courier)}
                          disabled={approving}
                          className="px-3 py-1 bg-primary-500 text-white rounded-lg text-xs hover:bg-primary-600 transition disabled:opacity-60"
                        >
                          Book
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right side: Client + Payment + Delivery */}
        <div className="space-y-6">
          {/* Client Info */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Client</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Name:</span> {order.client_name || '-'}</p>
              <p><span className="text-gray-500">Phone:</span> {order.client_phone || '-'}</p>
              <p><span className="text-gray-500">Rank:</span> {order.client_rank || '-'}</p>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Payment</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Method:</span> {order.payment_method || '-'}</p>
              <p><span className="text-gray-500">Status:</span> {order.payment_status || '-'}</p>
              <p><span className="text-gray-500">Cashfree ID:</span> {order.cashfree_order_id || '-'}</p>
            </div>
          </div>

          {/* Delivery Info */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Delivery</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Address:</span> {order.delivery_address || '-'}</p>
              <p><span className="text-gray-500">Pincode:</span> {order.pincode || '-'}</p>
              <p><span className="text-gray-500">Zone:</span> {order.zone || '-'}</p>
              <p><span className="text-gray-500">Courier:</span> {order.courier_name || 'Not assigned'}</p>
              <p><span className="text-gray-500">AWB:</span> {order.awb_number || '-'}</p>
              <p><span className="text-gray-500">Tracking:</span> {order.tracking_status || '-'}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Timeline</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Created:</span> {formatDate(order.created_at)}</p>
              {order.paid_at && <p><span className="text-gray-500">Paid:</span> {formatDate(order.paid_at)}</p>}
              {order.dispatched_at && <p><span className="text-gray-500">Dispatched:</span> {formatDate(order.dispatched_at)}</p>}
              {order.delivered_at && <p><span className="text-gray-500">Delivered:</span> {formatDate(order.delivered_at)}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
