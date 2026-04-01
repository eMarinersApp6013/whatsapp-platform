import React, { useEffect, useState, useRef, useCallback } from 'react';
import api from '../utils/api';
import { io } from 'socket.io-client';

const BASE_URL = process.env.REACT_APP_API_URL || 'https://whatsapp.nodesurge.tech';
const PRIORITY_COLORS = { urgent: '#e53e3e', normal: '#f59e0b', low: '#3182ce' };
const STATUS_COLORS   = { open: '#25d366', resolved: '#718096', pending: '#f59e0b' };
const EMOJIS = ['😊','😂','❤️','👍','🙏','🎉','😢','😡','🤔','👋','✅','❌','📦','🚚','💰','🛒','⭐','🔥','📱','💬','🔔','⚙️','👀','💯','🎁','🚀','✨','💪','🙌','😍','🤝','👌','😎','🥳','🤗','💡','🎯','📊','🏆','🎶'];

// Notification sound (short 440 Hz beep via Web Audio API)
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}
}

function showBrowserNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

function Avatar({ name, size = 40 }) {
  const letter = (name || '?')[0].toUpperCase();
  const colors = ['#25d366','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
  const bg = colors[letter.charCodeAt(0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {letter}
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function Conversations() {
  // Core state
  const [convs,        setConvs]        = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);

  // Filters
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState('all');
  const [showFilters,  setShowFilters]  = useState(false);
  const [priFilter,    setPriFilter]    = useState('');
  const [labelFilter,  setLabelFilter]  = useState('');

  // Compose
  const [replyText,    setReplyText]    = useState('');
  const [isNoteMode,   setIsNoteMode]   = useState(false);
  const [attachFile,   setAttachFile]   = useState(null);
  const [attachPrev,   setAttachPrev]   = useState('');

  // Overlays
  const [showEmoji,    setShowEmoji]    = useState(false);
  const [showCanned,   setShowCanned]   = useState(false);
  const [cannedSearch, setCannedSearch] = useState('');

  // Data
  const [canned,       setCanned]       = useState([]);
  const [labels,       setLabels]       = useState([]);
  const [notes,        setNotes]        = useState([]);
  const [noteText,     setNoteText]     = useState('');
  const [clientInfo,   setClientInfo]   = useState(null);

  // Agents
  const [agents,       setAgents]       = useState([]);

  // UI
  const [showRight,    setShowRight]    = useState(true);

  // Refs
  const messagesEndRef = useRef(null);
  const socketRef      = useRef(null);
  const selectedRef    = useRef(null);
  const fileInputRef   = useRef(null);
  const textareaRef    = useRef(null);

  // Keep selectedRef in sync
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // ── Load labels, canned, agents on mount ─────────────────────────────────
  useEffect(() => {
    api.get('/api/chat/labels').then(r => setLabels(r.data.data || [])).catch(() => {});
    api.get('/api/chat/canned').then(r => setCanned(r.data.data || [])).catch(() => {});
    api.get('/api/agents').then(r => setAgents((r.data.data || []).filter(a => a.is_active))).catch(() => {});
    // Request notification permission
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }, []);

  // ── Load conversations ────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    try {
      const params = { search };
      if (filter === 'starred') { params.starred = 'true'; }
      else if (filter !== 'all') { params.status = filter; }
      if (priFilter)   params.priority = priFilter;
      if (labelFilter) params.label_filter = labelFilter;
      const res = await api.get('/api/clients', { params });
      setConvs(res.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, filter, priFilter, labelFilter]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // ── Load messages + info when conversation selected ───────────────────────
  useEffect(() => {
    if (!selected) return;
    api.get(`/api/clients/${selected.id}/messages`).then(r => setMessages(r.data.data || [])).catch(() => {});
    api.get(`/api/chat/conversations/${selected.id}/notes`).then(r => setNotes(r.data.data || [])).catch(() => {});
    api.get(`/api/chat/conversations/${selected.id}/client-info`).then(r => setClientInfo(r.data.data)).catch(() => {});
    api.patch(`/api/chat/conversations/${selected.id}/unread`).catch(() => {});
    setConvs(prev => prev.map(c => c.id === selected.id ? { ...c, unread_count: 0 } : c));
  }, [selected]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Socket (once) ─────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(BASE_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      if (selectedRef.current) socket.emit('join_conversation', selectedRef.current.id);
    });
    socket.on('new_message', (msg) => {
      const cur = selectedRef.current;
      if (cur && msg.conversation_id === cur.id) {
        setMessages(prev => prev.some(m => m.id === msg.id && msg.id) ? prev : [...prev, msg]);
        api.patch(`/api/chat/conversations/${cur.id}/unread`).catch(() => {});
      } else {
        setConvs(prev => prev.map(c =>
          c.id === msg.conversation_id
            ? { ...c, last_message: msg.content, last_message_at: msg.created_at, unread_count: (c.unread_count || 0) + 1 }
            : c
        ));
        // Notify agent of new message in other conversation
        if (msg.direction !== 'outbound') {
          playNotificationSound();
          showBrowserNotification('New WhatsApp Message', msg.content?.slice(0, 80) || 'New message received');
        }
      }
    });
    socket.on('conversation_update', (conv) => {
      setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, ...conv } : c));
      if (selectedRef.current?.id === conv.id) setSelected(s => ({ ...s, ...conv }));
    });
    return () => socket.disconnect();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (selected && socketRef.current?.connected) socketRef.current.emit('join_conversation', selected.id);
  }, [selected]);

  // ── Send reply ────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = replyText.trim();
    if ((!text && !attachFile) || !selected) return;
    setSending(true);
    try {
      if (attachFile) {
        const fd = new FormData();
        fd.append('file', attachFile);
        const r = await api.post(`/api/clients/${selected.id}/attachment`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setMessages(prev => [...prev, r.data.data]);
        setAttachFile(null); setAttachPrev('');
      }
      if (text) {
        if (isNoteMode) {
          const r = await api.post(`/api/chat/conversations/${selected.id}/notes`, { content: text, agent_name: 'Admin' });
          setNotes(prev => [...prev, r.data.data]);
        } else {
          await api.post(`/api/clients/${selected.id}/reply`, { content: text });
          setMessages(prev => [...prev, { direction: 'outbound', content: text, created_at: new Date().toISOString() }]);
          setConvs(prev => prev.map(c => c.id === selected.id ? { ...c, last_message: text, last_message_at: new Date().toISOString() } : c));
        }
        setReplyText('');
      }
    } catch (e) { alert(e.response?.data?.message || 'Failed to send'); }
    finally { setSending(false); }
  };

  const handleKeyDown = (e) => {
    if (showCanned && e.key === 'Escape') { setShowCanned(false); return; }
    if (e.key === 'Enter' && !e.shiftKey && !showCanned) { e.preventDefault(); handleSend(); }
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setReplyText(val);
    if (val.startsWith('/')) { setShowCanned(true); setCannedSearch(val.slice(1)); }
    else setShowCanned(false);
  };

  const insertCanned = (cr) => {
    setReplyText(cr.content);
    setShowCanned(false);
    textareaRef.current?.focus();
  };

  const selectConv = (conv) => {
    setSelected(conv);
    setMessages([]); setNotes([]); setClientInfo(null);
    setReplyText(''); setIsNoteMode(false);
    setAttachFile(null); setAttachPrev('');
    setShowEmoji(false); setShowCanned(false);
  };

  const handleStatusChange = async (convId, status) => {
    await api.patch(`/api/clients/${convId}/status`, { status }).catch(() => {});
    setConvs(prev => prev.map(c => c.id === convId ? { ...c, status } : c));
    if (selected?.id === convId) setSelected(s => ({ ...s, status }));
  };

  const handleResolve = async () => {
    if (!selected) return;
    const r = await api.patch(`/api/clients/${selected.id}/resolve`, { agent_name: 'Admin' }).catch(() => null);
    if (r) {
      setSelected(s => ({ ...s, status: 'resolved', resolved_at: r.data.data.resolved_at }));
      setConvs(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'resolved' } : c));
    }
  };

  const handleReopen = async () => {
    if (!selected) return;
    const r = await api.patch(`/api/clients/${selected.id}/reopen`).catch(() => null);
    if (r) {
      setSelected(s => ({ ...s, status: 'open', resolved_at: null }));
      setConvs(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'open' } : c));
    }
  };

  const handleStar = async () => {
    const starred = !selected.is_starred;
    await api.patch(`/api/chat/conversations/${selected.id}/star`, { starred }).catch(() => {});
    setSelected(s => ({ ...s, is_starred: starred }));
    setConvs(prev => prev.map(c => c.id === selected.id ? { ...c, is_starred: starred } : c));
  };

  const handlePriority = async (priority) => {
    await api.patch(`/api/chat/conversations/${selected.id}/priority`, { priority }).catch(() => {});
    setSelected(s => ({ ...s, priority }));
    setConvs(prev => prev.map(c => c.id === selected.id ? { ...c, priority } : c));
  };

  const handleAssign = async (assigned_to) => {
    await api.patch(`/api/chat/conversations/${selected.id}/assign`, { assigned_to }).catch(() => {});
    setSelected(s => ({ ...s, assigned_to }));
  };

  const toggleLabel = async (labelId) => {
    const current = selected.label_ids || [];
    const label_ids = current.includes(labelId) ? current.filter(x => x !== labelId) : [...current, labelId];
    await api.patch(`/api/chat/conversations/${selected.id}/labels`, { label_ids }).catch(() => {});
    setSelected(s => ({ ...s, label_ids }));
    setConvs(prev => prev.map(c => c.id === selected.id ? { ...c, label_ids } : c));
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    const r = await api.post(`/api/chat/conversations/${selected.id}/notes`, { content: noteText, agent_name: 'Admin' }).catch(() => null);
    if (r) { setNotes(prev => [...prev, r.data.data]); setNoteText(''); }
  };

  const deleteNote = async (nid) => {
    await api.delete(`/api/chat/conversations/${selected.id}/notes/${nid}`).catch(() => {});
    setNotes(prev => prev.filter(n => n.id !== nid));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachFile(file);
    if (file.type.startsWith('image/')) setAttachPrev(URL.createObjectURL(file));
    else setAttachPrev('');
  };

  const filteredCanned = canned.filter(c =>
    !cannedSearch || c.shortcut?.includes(cannedSearch) || c.title.toLowerCase().includes(cannedSearch.toLowerCase())
  );

  const TABS = ['all','open','pending','resolved','starred'];

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', background: '#f0f2f5', gap: 0, overflow: 'hidden' }}>

      {/* ── LEFT: Conversation List ────────────────────────────────────────── */}
      <div style={{ width: 300, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Search + header */}
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a202c', flex: 1, margin: 0 }}>💬 Conversations</h2>
            <button onClick={() => setShowFilters(x => !x)} style={{ background: showFilters ? '#ebf8ff' : '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: showFilters ? '#3182ce' : '#718096' }}>
              ⚙️ Filter
            </button>
          </div>
          <input type="text" placeholder="🔍 Search..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />

          {/* Advanced filters */}
          {showFilters && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <select value={priFilter} onChange={e => setPriFilter(e.target.value)}
                style={{ flex: 1, padding: '5px 6px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11 }}>
                <option value="">All Priority</option>
                <option value="urgent">🚨 Urgent</option>
                <option value="normal">🟡 Normal</option>
                <option value="low">🔵 Low</option>
              </select>
              <select value={labelFilter} onChange={e => setLabelFilter(e.target.value)}
                style={{ flex: 1, padding: '5px 6px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11 }}>
                <option value="">All Labels</option>
                {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setFilter(tab)} style={{
                flex: 1, padding: '5px 2px', border: 'none', borderRadius: 5, fontSize: 10,
                fontWeight: filter === tab ? 700 : 400, cursor: 'pointer', textTransform: 'capitalize',
                background: filter === tab ? '#25d366' : '#f7fafc',
                color: filter === tab ? '#fff' : '#718096',
              }}>
                {tab === 'starred' ? '⭐' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: '#a0aec0', fontSize: 13 }}>Loading...</div>}
          {!loading && convs.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#a0aec0', fontSize: 13 }}>No conversations</div>}
          {convs.map(conv => {
            const convLabels = labels.filter(l => (conv.label_ids || []).includes(l.id)).slice(0, 2);
            const priColor = PRIORITY_COLORS[conv.priority] || 'transparent';
            const isActive = selected?.id === conv.id;
            return (
              <div key={conv.id} onClick={() => selectConv(conv)} style={{
                display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer',
                background: isActive ? '#f0fff4' : 'transparent',
                borderBottom: '1px solid #f7fafc',
                borderLeft: `3px solid ${isActive ? '#25d366' : priColor}`,
              }}>
                {/* Avatar + unread badge */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar name={conv.name || conv.phone} size={38} />
                  {conv.unread_count > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -4, background: '#e53e3e', color: '#fff',
                      borderRadius: '50%', minWidth: 16, height: 16, fontSize: 9, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontWeight: conv.unread_count > 0 ? 700 : 600, fontSize: 13, color: '#1a202c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                      {conv.is_starred && '⭐ '}{conv.name || conv.phone}
                    </span>
                    <span style={{ fontSize: 10, color: '#a0aec0', flexShrink: 0 }}>{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#718096', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                    {conv.last_message || 'No messages yet'}
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    <span style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 600, background: (STATUS_COLORS[conv.status] || '#718096') + '22', color: STATUS_COLORS[conv.status] || '#718096' }}>
                      {conv.status || 'open'}
                    </span>
                    {convLabels.map(l => (
                      <span key={l.id} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 600, background: l.color + '22', color: l.color }}>
                        ● {l.name}
                      </span>
                    ))}
                    {conv.priority === 'urgent' && <span style={{ fontSize: 9 }}>🚨</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CENTER: Chat Area ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#a0aec0', background: '#f7fafc' }}>
            <span style={{ fontSize: 56 }}>💬</span>
            <p style={{ fontSize: 15 }}>Select a conversation to start chatting</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Avatar name={selected.name || selected.phone} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>{selected.name || selected.phone}</div>
                <div style={{ fontSize: 11, color: '#718096' }}>{selected.phone}</div>
              </div>
              {/* Controls */}
              <select value={selected.status || 'open'} onChange={e => handleStatusChange(selected.id, e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                <option value="open">● Open</option>
                <option value="pending">● Pending</option>
                <option value="resolved">● Resolved</option>
              </select>
              <select value={selected.priority || 'normal'} onChange={e => handlePriority(e.target.value)}
                style={{ padding: '5px 8px', border: `1px solid ${PRIORITY_COLORS[selected.priority] || '#e2e8f0'}`, borderRadius: 6, fontSize: 12, cursor: 'pointer', color: PRIORITY_COLORS[selected.priority] || '#718096' }}>
                <option value="urgent">🚨 Urgent</option>
                <option value="normal">🟡 Normal</option>
                <option value="low">🔵 Low</option>
              </select>
              <button onClick={handleStar} title={selected.is_starred ? 'Unstar' : 'Star'} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 14, cursor: 'pointer' }}>
                {selected.is_starred ? '⭐' : '☆'}
              </button>
              {selected.status !== 'resolved' ? (
                <button onClick={handleResolve} style={{ padding: '5px 12px', background: '#48bb78', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  ✓ Resolve
                </button>
              ) : (
                <button onClick={handleReopen} style={{ padding: '5px 12px', background: '#ed8936', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  ↩ Reopen
                </button>
              )}
              <a href={`https://wa.me/${selected.phone}`} target="_blank" rel="noreferrer"
                style={{ padding: '5px 10px', background: '#25d366', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 11, fontWeight: 600 }}>
                Open WA
              </a>
              <button onClick={() => setShowRight(x => !x)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}>
                {showRight ? '→' : '←'}
              </button>
            </div>

            {/* Label pills in header */}
            {(selected.label_ids || []).length > 0 && (
              <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '4px 16px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {labels.filter(l => (selected.label_ids || []).includes(l.id)).map(l => (
                  <span key={l.id} onClick={() => toggleLabel(l.id)} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: l.color + '22', color: l.color, cursor: 'pointer' }}>
                    ● {l.name} ×
                  </span>
                ))}
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8, background: '#f7fafc' }}>
              {messages.length === 0 && <div style={{ textAlign: 'center', color: '#a0aec0', fontSize: 13, marginTop: 40 }}>No messages yet</div>}
              {messages.map((msg, i) => {
                const isOut  = msg.direction === 'outbound' || msg.direction === 'out';
                const isNote = msg.is_note;
                if (isNote) return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ maxWidth: '75%', padding: '8px 14px', borderRadius: 10, background: '#fffbeb', border: '1px dashed #d69e2e', fontSize: 12, color: '#744210' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#d69e2e', marginBottom: 3 }}>🔒 Internal Note</div>
                      <div>{msg.content}</div>
                      <div style={{ fontSize: 10, marginTop: 3, opacity: 0.6, textAlign: 'right' }}>{timeAgo(msg.created_at)}</div>
                    </div>
                  </div>
                );
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isOut ? '#25d366' : '#e8f4fd', color: isOut ? '#fff' : '#1a202c',
                      fontSize: 13, boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                      border: isOut ? 'none' : '1px solid #bee3f8' }}>
                      {!isOut && <div style={{ fontSize: 10, fontWeight: 700, color: '#3182ce', marginBottom: 3 }}>Customer</div>}
                      {/* Media */}
                      {msg.media_url && msg.message_type === 'image' && (
                        <img src={msg.media_url} alt="attachment" style={{ maxWidth: 200, borderRadius: 8, marginBottom: 6, display: 'block' }} />
                      )}
                      {msg.media_url && msg.message_type === 'document' && (
                        <a href={msg.media_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 4, color: isOut ? '#fff' : '#3182ce', fontSize: 12 }}>
                          📄 {msg.content || 'Document'}
                        </a>
                      )}
                      {msg.message_type !== 'document' && <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>}
                      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7, textAlign: 'right' }}>{timeAgo(msg.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose area */}
            <div style={{ background: '#fff', borderTop: '1px solid #e2e8f0', padding: '10px 16px' }}>
              {/* Canned response picker */}
              {showCanned && filteredCanned.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8, maxHeight: 160, overflowY: 'auto', background: '#fff', boxShadow: '0 -4px 12px rgba(0,0,0,0.08)' }}>
                  {filteredCanned.map(cr => (
                    <div key={cr.id} onClick={() => insertCanned(cr)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f7fafc', fontSize: 13 }}
                      onMouseOver={e => e.currentTarget.style.background = '#f7fafc'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ fontWeight: 700, color: '#25d366', marginRight: 8 }}>/{cr.shortcut || '—'}</span>
                      <span style={{ color: '#2d3748' }}>{cr.title}</span>
                      <span style={{ color: '#a0aec0', marginLeft: 8, fontSize: 11 }}>{cr.content.slice(0, 40)}...</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Emoji picker */}
              {showEmoji && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8, padding: 10, background: '#fff', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {EMOJIS.map(em => (
                    <span key={em} onClick={() => { setReplyText(t => t + em); setShowEmoji(false); textareaRef.current?.focus(); }}
                      style={{ fontSize: 20, cursor: 'pointer', padding: 3, borderRadius: 4 }}
                      onMouseOver={e => e.currentTarget.style.background = '#f7fafc'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      {em}
                    </span>
                  ))}
                </div>
              )}

              {/* Attachment preview */}
              {attachFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', background: '#f7fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  {attachPrev ? <img src={attachPrev} alt="preview" style={{ height: 40, borderRadius: 4 }} /> : <span>📄</span>}
                  <span style={{ fontSize: 12, flex: 1 }}>{attachFile.name}</span>
                  <button onClick={() => { setAttachFile(null); setAttachPrev(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#e53e3e' }}>×</button>
                </div>
              )}

              {/* Toolbar */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx" style={{ display: 'none' }} onChange={handleFileChange} />
                <button onClick={() => fileInputRef.current?.click()} title="Attach file" style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 14, cursor: 'pointer' }}>📎</button>
                <button onClick={() => setShowEmoji(x => !x)} title="Emoji" style={{ background: showEmoji ? '#ebf8ff' : '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 14, cursor: 'pointer' }}>😊</button>
                <span style={{ fontSize: 11, color: '#a0aec0' }}>type / for quick replies</span>
                <div style={{ flex: 1 }} />
                {/* Reply / Note toggle */}
                <button onClick={() => setIsNoteMode(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: isNoteMode ? 400 : 700, background: isNoteMode ? '#f7fafc' : '#25d366', color: isNoteMode ? '#718096' : '#fff', cursor: 'pointer' }}>Reply</button>
                <button onClick={() => setIsNoteMode(true)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: isNoteMode ? 700 : 400, background: isNoteMode ? '#fffbeb' : '#f7fafc', color: isNoteMode ? '#d69e2e' : '#718096', cursor: 'pointer' }}>🔒 Note</button>
              </div>

              {/* Textarea + Send */}
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea ref={textareaRef} value={replyText} onChange={handleTextChange} onKeyDown={handleKeyDown}
                  placeholder={isNoteMode ? '🔒 Add internal note (only visible to team)...' : 'Type a message... (/ for canned responses)'}
                  rows={2}
                  style={{ flex: 1, padding: '10px 12px', border: `1px solid ${isNoteMode ? '#d69e2e' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', background: isNoteMode ? '#fffdf0' : '#fff' }} />
                <button onClick={handleSend} disabled={sending || (!replyText.trim() && !attachFile)}
                  style={{ padding: '10px 18px', background: sending || (!replyText.trim() && !attachFile) ? '#a0aec0' : (isNoteMode ? '#d69e2e' : '#25d366'), color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0, minWidth: 70 }}>
                  {sending ? '...' : (isNoteMode ? 'Note' : 'Send ➤')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT: Contact Detail Panel ───────────────────────────────────── */}
      {showRight && selected && (
        <div style={{ width: 280, background: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0 }}>
          {/* Contact Info */}
          <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar name={selected.name || selected.phone} size={44} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>{selected.name || selected.phone}</div>
                <div style={{ fontSize: 12, color: '#718096' }}>{selected.phone}</div>
              </div>
            </div>
            {clientInfo && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: '#f7fafc', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#25d366' }}>{clientInfo.order_count || 0}</div>
                  <div style={{ fontSize: 10, color: '#718096' }}>Orders</div>
                </div>
                <div style={{ flex: 1, background: '#f7fafc', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#3182ce' }}>₹{Number(clientInfo.total_spent || 0).toLocaleString('en-IN')}</div>
                  <div style={{ fontSize: 10, color: '#718096' }}>Spent</div>
                </div>
              </div>
            )}
          </div>

          {/* Labels */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏷️ Labels</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {labels.map(l => {
                const active = (selected.label_ids || []).includes(l.id);
                return (
                  <span key={l.id} onClick={() => toggleLabel(l.id)} style={{
                    padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: active ? l.color : l.color + '22',
                    color: active ? '#fff' : l.color,
                    border: `1px solid ${l.color}40`,
                  }}>
                    {active ? '✓ ' : ''}{l.name}
                  </span>
                );
              })}
              {labels.length === 0 && <span style={{ fontSize: 11, color: '#a0aec0' }}>No labels configured</span>}
            </div>
          </div>

          {/* Assign + Priority */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>👤 Assigned To</div>
            <select value={selected.assigned_to || ''} onChange={e => handleAssign(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
              <option value="">— Unassigned —</option>
              {agents.map(a => (
                <option key={a.id} value={a.name}>
                  {a.status === 'online' ? '🟢' : a.status === 'busy' ? '🟡' : '⚫'} {a.name} ({a.role})
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚡ Priority</div>
            <select value={selected.priority || 'normal'} onChange={e => handlePriority(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: `1px solid ${PRIORITY_COLORS[selected.priority] || '#e2e8f0'}`, borderRadius: 8, fontSize: 13, color: PRIORITY_COLORS[selected.priority] || '#718096' }}>
              <option value="urgent">🚨 Urgent</option>
              <option value="normal">🟡 Normal</option>
              <option value="low">🔵 Low</option>
            </select>
          </div>

          {/* Notes */}
          <div style={{ padding: '12px 16px', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📝 Team Notes ({notes.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {notes.length === 0 && <p style={{ fontSize: 12, color: '#a0aec0' }}>No notes yet</p>}
              {notes.map(n => (
                <div key={n.id} style={{ background: '#fffbeb', border: '1px solid #f6e05e', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#d69e2e' }}>{n.agent_name}</span>
                    <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#e53e3e', padding: 0 }}>×</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#744210', whiteSpace: 'pre-wrap' }}>{n.content}</div>
                  <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                </div>
              ))}
            </div>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a team note..."
              rows={3} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 6 }} />
            <button onClick={addNote} disabled={!noteText.trim()}
              style={{ width: '100%', padding: '8px', background: noteText.trim() ? '#d69e2e' : '#e2e8f0', color: noteText.trim() ? '#fff' : '#a0aec0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: noteText.trim() ? 'pointer' : 'not-allowed' }}>
              + Add Note
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
