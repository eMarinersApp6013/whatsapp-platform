import React, { useEffect, useState, useRef, useCallback } from 'react';
import api from '../utils/api';
import { io } from 'socket.io-client';

const BASE_URL = process.env.REACT_APP_API_URL || 'https://whatsapp.nodesurge.tech';

const STATUS_COLORS = {
  open:     '#25d366',
  resolved: '#718096',
  pending:  '#f59e0b',
};

function Avatar({ name, size = 40 }) {
  const letter = (name || '?')[0].toUpperCase();
  const colors = ['#25d366','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
  const color  = colors[letter.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>
      {letter}
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Conversations() {
  const [convs,      setConvs]      = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [messages,   setMessages]   = useState([]);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState('all');
  const [replyText,  setReplyText]  = useState('');
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'chat'
  const messagesEndRef = useRef(null);
  const socketRef      = useRef(null);

  // ── Load conversations ────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    try {
      const params = { search };
      if (filter !== 'all') params.status = filter;
      const res = await api.get('/api/clients', { params });
      setConvs(res.data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // ── Load messages for selected conv ──────────────────────────────────────
  useEffect(() => {
    if (!selected) return;
    api.get(`/api/clients/${selected.id}/messages`)
      .then(r => setMessages(r.data.data || []))
      .catch(console.error);
  }, [selected]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Socket.io (create ONCE, use ref for selected) ─────────────────────────
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    const socket = io(BASE_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (selectedRef.current) {
        socket.emit('join_conversation', selectedRef.current.id);
      }
    });

    socket.on('new_message', (msg) => {
      const cur = selectedRef.current;
      if (cur && msg.conversation_id === cur.id) {
        setMessages(prev => {
          // Avoid duplicate messages
          if (prev.some(m => m.id === msg.id && msg.id)) return prev;
          return [...prev, { ...msg, direction: msg.direction || 'inbound' }];
        });
      }
      // Refresh conversation list
      setConvs(prev => prev.map(c =>
        c.id === msg.conversation_id
          ? { ...c, last_message: msg.content, last_message_at: msg.created_at }
          : c
      ));
    });

    return () => socket.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Join room when conversation selected
  useEffect(() => {
    if (selected && socketRef.current?.connected) {
      socketRef.current.emit('join_conversation', selected.id);
    }
  }, [selected]);

  // ── Send reply ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      await api.post(`/api/clients/${selected.id}/reply`, { content: replyText });
      const newMsg = { direction: 'outbound', content: replyText, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, newMsg]);
      setReplyText('');
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStatusChange = async (convId, status) => {
    try {
      await api.patch(`/api/clients/${convId}/status`, { status });
      setConvs(prev => prev.map(c => c.id === convId ? { ...c, status } : c));
      if (selected?.id === convId) setSelected(s => ({ ...s, status }));
    } catch (e) { console.error(e); }
  };

  const selectConv = (conv) => {
    setSelected(conv);
    setMobileView('chat');
  };

  // ── Filter tabs ────────────────────────────────────────────────────────────
  const TABS = ['all','open','resolved','pending'];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
      <div style={{
        width: 320,
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2d3748', marginBottom: 12 }}>Conversations</h2>
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
              marginBottom: 10,
            }}
          />
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  background: filter === tab ? '#25d366' : '#f7fafc',
                  color: filter === tab ? '#fff' : '#718096',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: '#718096', fontSize: 14 }}>Loading...</div>}
          {!loading && convs.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#718096', fontSize: 14 }}>
              No conversations found
            </div>
          )}
          {convs.map(conv => (
            <div
              key={conv.id}
              onClick={() => selectConv(conv)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                background: selected?.id === conv.id ? '#f0fff4' : 'transparent',
                borderBottom: '1px solid #f7fafc',
                borderLeft: selected?.id === conv.id ? '3px solid #25d366' : '3px solid transparent',
              }}
            >
              <Avatar name={conv.name || conv.phone} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#2d3748', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conv.name || conv.phone}
                  </span>
                  <span style={{ fontSize: 10, color: '#a0aec0', flexShrink: 0, marginLeft: 4 }}>
                    {timeAgo(conv.last_message_at)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#718096', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>
                  {conv.last_message || 'No messages yet'}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 600,
                    background: STATUS_COLORS[conv.status] + '22',
                    color: STATUS_COLORS[conv.status],
                  }}>
                    {conv.status || 'open'}
                  </span>
                  {conv.phone && (
                    <span style={{ fontSize: 10, color: '#a0aec0' }}>{conv.phone}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL: Chat ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f7fafc' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#a0aec0' }}>
            <span style={{ fontSize: 48 }}>💬</span>
            <p style={{ fontSize: 15 }}>Select a conversation to start chatting</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{
              padding: '12px 20px',
              background: '#fff',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <Avatar name={selected.name || selected.phone} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#2d3748' }}>{selected.name || selected.phone}</div>
                <div style={{ fontSize: 12, color: '#718096' }}>{selected.phone}</div>
              </div>
              {/* Status change */}
              <select
                value={selected.status || 'open'}
                onChange={e => handleStatusChange(selected.id, e.target.value)}
                style={{
                  padding: '5px 10px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  background: '#fff',
                }}
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>
              <a
                href={`https://wa.me/${selected.phone}`}
                target="_blank"
                rel="noreferrer"
                style={{ padding: '5px 12px', background: '#25d366', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}
              >
                Open WA
              </a>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#a0aec0', fontSize: 13, marginTop: 40 }}>
                  No messages yet. Waiting for customer to message...
                </div>
              )}
              {messages.map((msg, i) => {
                const isOut = msg.direction === 'outbound' || msg.direction === 'out';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isOut ? '#25d366' : '#e8f4fd',
                      color: isOut ? '#fff' : '#1a202c',
                      fontSize: 13,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      wordBreak: 'break-word',
                      border: isOut ? 'none' : '1px solid #bee3f8',
                    }}>
                      {!isOut && <div style={{ fontSize: 10, fontWeight: 600, color: '#3182ce', marginBottom: 3 }}>Customer</div>}
                      <div>{msg.content}</div>
                      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7, textAlign: 'right' }}>
                        {timeAgo(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            <div style={{
              padding: 16,
              background: '#fff',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-end',
            }}>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                rows={2}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 13,
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !replyText.trim()}
                style={{
                  padding: '10px 20px',
                  background: sending || !replyText.trim() ? '#a0aec0' : '#25d366',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  height: 44,
                }}
              >
                {sending ? '...' : 'Send ➤'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
