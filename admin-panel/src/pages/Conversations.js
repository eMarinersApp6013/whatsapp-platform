import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, User, Bot, Send, Hand, ArrowLeftRight, FileText, CreditCard, Truck } from 'lucide-react';
import api from '../utils/api';
import { formatTime, formatCurrency, statusColor, truncate } from '../utils/helpers';

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [clientInfo, setClientInfo] = useState(null);
  const [clientOrder, setClientOrder] = useState(null);
  const [inputMsg, setInputMsg] = useState('');
  const [aiHandling, setAiHandling] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await api.get('/api/clients');
      const clients = res.data.clients || res.data || [];
      setConversations(clients);
    } catch (err) {
      console.error('Load conversations error:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectConversation = async (client) => {
    setSelected(client);
    setClientInfo(client);
    setAiHandling(true);
    try {
      const [msgRes, orderRes] = await Promise.all([
        api.get(`/api/clients/${client.id}/conversations`).catch(() => ({ data: [] })),
        api.get(`/api/orders?client_phone=${client.phone}&limit=1`).catch(() => ({ data: { orders: [] } })),
      ]);
      setMessages(msgRes.data.conversations || msgRes.data || []);
      setClientOrder(orderRes.data.orders?.[0] || null);
    } catch (err) {
      console.error('Load messages error:', err);
    }
  };

  const sendMessage = async () => {
    if (!inputMsg.trim() || aiHandling) return;
    try {
      await api.post(`/api/clients/${selected.id}/send-message`, { message: inputMsg });
      setMessages([...messages, {
        role: 'staff',
        message: inputMsg,
        created_at: new Date().toISOString(),
      }]);
      setInputMsg('');
    } catch (err) {
      console.error('Send error:', err);
    }
  };

  const toggleAI = () => setAiHandling(!aiHandling);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Left: Conversation List */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No conversations yet</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`flex items-center px-4 py-3 cursor-pointer border-b border-gray-50 transition ${
                  selected?.id === conv.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-medium">
                    {(conv.name || conv.phone || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white bg-green-400"></span>
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {conv.name || conv.phone}
                    </p>
                    <span className="text-xs text-gray-400">{formatTime(conv.updated_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{conv.last_message || 'No messages'}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Center: Chat Thread */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-3 text-gray-300" />
              <p>Select a conversation to start</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white flex-shrink-0">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-medium">
                  {(selected.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-800">{selected.name || selected.phone}</p>
                  <p className="text-xs text-gray-500">
                    {selected.rank || 'Customer'} {selected.is_vip && <span className="text-gold-500 font-medium">VIP</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {aiHandling ? (
                  <button
                    onClick={toggleAI}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition"
                  >
                    <Hand className="w-3.5 h-3.5" />
                    Take Over from AI
                  </button>
                ) : (
                  <button
                    onClick={toggleAI}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-medium hover:bg-green-100 transition"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    Hand Back to AI
                  </button>
                )}
                <button
                  onClick={() => setShowOrderPanel(!showOrderPanel)}
                  className="p-1.5 text-gray-500 hover:text-primary-500 rounded-lg hover:bg-gray-100 transition"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.length === 0 ? (
                <p className="text-center text-gray-400 text-sm mt-8">No messages in this conversation</p>
              ) : (
                messages.map((msg, idx) => {
                  const isClient = msg.role === 'user' || msg.role === 'client';
                  const isStaff = msg.role === 'staff';
                  return (
                    <div key={idx} className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[70%] px-4 py-2.5 text-sm ${
                          isClient
                            ? 'chat-bubble-client'
                            : isStaff
                            ? 'chat-bubble-staff'
                            : 'chat-bubble-ai'
                        }`}
                      >
                        <p className="text-gray-800 whitespace-pre-wrap">{msg.message}</p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          {!isClient && (
                            <span className="text-[10px] text-gray-400">
                              {isStaff ? 'Staff' : 'AI'}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">{formatTime(msg.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="h-16 border-t border-gray-200 flex items-center px-4 bg-white flex-shrink-0">
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder={aiHandling ? 'AI is handling this conversation...' : 'Type a message...'}
                disabled={aiHandling}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button
                onClick={sendMessage}
                disabled={aiHandling || !inputMsg.trim()}
                className="ml-2 p-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right: Order Panel */}
      {showOrderPanel && selected && (
        <div className="w-72 border-l border-gray-200 bg-white p-4 overflow-y-auto flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Client Info</h3>
          <div className="space-y-2 text-sm mb-6">
            <p><span className="text-gray-500">Name:</span> {selected.name || '-'}</p>
            <p><span className="text-gray-500">Phone:</span> {selected.phone}</p>
            <p><span className="text-gray-500">Rank:</span> {selected.rank || 'New'}</p>
            <p><span className="text-gray-500">Orders:</span> {selected.order_count || 0}</p>
            <p><span className="text-gray-500">Total Spent:</span> {formatCurrency(selected.total_spent)}</p>
            {selected.is_vip && (
              <span className="inline-block px-2 py-0.5 bg-gold-100 text-gold-700 text-xs rounded-full font-medium">VIP Customer</span>
            )}
          </div>

          {clientOrder && (
            <>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Current Order</h3>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Order#</span>
                  <span className="font-medium">{clientOrder.order_number || clientOrder.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${statusColor(clientOrder.status)}`}>
                    {clientOrder.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-medium">{formatCurrency(clientOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment</span>
                  <span>{clientOrder.payment_method || '-'}</span>
                </div>
              </div>
            </>
          )}

          <h3 className="text-sm font-semibold text-gray-800 mt-6 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition">
              <CreditCard className="w-4 h-4" />
              Generate Payment Link
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition">
              <FileText className="w-4 h-4" />
              Approve Invoice
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition">
              <Truck className="w-4 h-4" />
              Approve Courier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
