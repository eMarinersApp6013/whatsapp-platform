import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const COLORS = {
  navy:        '#0A1628',
  navyLight:   '#112240',
  gold:        '#C9A84C',
  goldLight:   '#E8C97A',
  green:       '#1DB954',
  greenLight:  '#25D366',
  bg:          '#F0F4F8',
  surface:     '#FFFFFF',
  border:      '#E2E8F0',
  text:        '#1A202C',
  textMuted:   '#718096',
  danger:      '#E53E3E',
  warning:     '#D69E2E',
  info:        '#3182CE',
};

// ─── Utility helpers ──────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const PLATFORM_META = {
  Amazon:   { color: '#FF9900', bg: '#FFF3CD', char: 'A' },
  Flipkart: { color: '#2874F0', bg: '#EBF4FF', char: 'F' },
  Meesho:   { color: '#F43397', bg: '#FEE2F0', char: 'M' },
  Etsy:     { color: '#F45800', bg: '#FFEDE0', char: 'E' },
};

const STATUS_META = {
  active:      { label: 'Active',      bg: '#C6F6D5', color: '#276749' },
  inactive:    { label: 'Inactive',    bg: '#FED7D7', color: '#9B2C2C' },
  discontinued:{ label: 'Discontinued',bg: '#E2E8F0', color: '#4A5568' },
  draft:       { label: 'Draft',       bg: '#FEFCBF', color: '#744210' },
};

// ─── Inline Styles ────────────────────────────────────────────────────────────
const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: COLORS.bg,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: COLORS.text,
  },
  header: {
    background: COLORS.navy,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  headerTitle: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '0.3px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headerBadge: {
    background: COLORS.gold,
    color: COLORS.navy,
    borderRadius: 12,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 700,
  },
  toolbar: {
    background: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  searchWrap: {
    position: 'relative',
    flex: 1,
    minWidth: 220,
  },
  searchInput: {
    width: '100%',
    padding: '9px 12px 9px 38px',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    background: COLORS.bg,
    color: COLORS.text,
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  searchIcon: {
    position: 'absolute',
    left: 11,
    top: '50%',
    transform: 'translateY(-50%)',
    color: COLORS.textMuted,
    pointerEvents: 'none',
    fontSize: 16,
  },
  select: {
    padding: '9px 12px',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    background: COLORS.surface,
    color: COLORS.text,
    cursor: 'pointer',
    minWidth: 150,
  },
  refreshBtn: {
    padding: '9px 16px',
    background: COLORS.navy,
    color: COLORS.gold,
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
  },
  tableWrap: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 24px',
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    background: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  th: {
    background: COLORS.navyLight,
    color: COLORS.goldLight,
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    borderBottom: `2px solid ${COLORS.gold}`,
    userSelect: 'none',
    cursor: 'pointer',
  },
  td: {
    padding: '12px 16px',
    fontSize: 14,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: 'middle',
  },
  trHover: {
    transition: 'background 0.1s',
  },
  skuBadge: {
    fontFamily: 'monospace',
    fontSize: 12,
    background: COLORS.bg,
    color: COLORS.textMuted,
    padding: '2px 7px',
    borderRadius: 4,
    border: `1px solid ${COLORS.border}`,
  },
  statusBadge: (status) => {
    const m = STATUS_META[status] || { label: status, bg: '#E2E8F0', color: '#4A5568' };
    return {
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: m.bg,
      color: m.color,
    };
  },
  platformChip: (p) => {
    const m = PLATFORM_META[p] || { color: '#718096', bg: '#EDF2F7', char: '?' };
    return {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: m.bg,
      color: m.color,
      fontSize: 11,
      fontWeight: 700,
      title: p,
      marginRight: 2,
      border: `1px solid ${m.color}33`,
    };
  },
  priceCell: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  stockLow: { color: COLORS.danger, fontWeight: 700 },
  stockOk:  { color: COLORS.green, fontWeight: 600 },
  footer: {
    background: COLORS.surface,
    borderTop: `1px solid ${COLORS.border}`,
    padding: '10px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 13,
    color: COLORS.textMuted,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  pageBtn: (active) => ({
    padding: '5px 11px',
    borderRadius: 6,
    border: active ? 'none' : `1px solid ${COLORS.border}`,
    background: active ? COLORS.navy : COLORS.surface,
    color: active ? COLORS.gold : COLORS.text,
    fontWeight: active ? 700 : 400,
    fontSize: 13,
    cursor: 'pointer',
  }),
  emptyState: {
    textAlign: 'center',
    padding: '60px 24px',
    color: COLORS.textMuted,
  },
  loader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    color: COLORS.textMuted,
    gap: 10,
    fontSize: 15,
  },
  errorBox: {
    margin: '24px',
    padding: '16px 20px',
    background: '#FFF5F5',
    border: `1px solid #FEB2B2`,
    borderRadius: 8,
    color: COLORS.danger,
    fontSize: 14,
  },
};

// ─── Spinning loader icon ─────────────────────────────────────────────────────
function Spinner() {
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAngle((a) => (a + 30) % 360), 80);
    return () => clearInterval(id);
  }, []);
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" style={{ transform: `rotate(${angle}deg)` }}>
      <circle cx="10" cy="10" r="8" fill="none" stroke={COLORS.border} strokeWidth="3" />
      <path d="M10 2 A8 8 0 0 1 18 10" fill="none" stroke={COLORS.gold} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ dir }) {
  if (!dir) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
  return <span style={{ marginLeft: 4 }}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Products() {
  const [products, setProducts]       = useState([]);
  const [categories, setCategories]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [search, setSearch]           = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [page, setPage]               = useState(1);
  const [pagination, setPagination]   = useState({ total: 0, pages: 1 });
  const [sort, setSort]               = useState({ col: 'created_at', dir: 'desc' });
  const [hoveredRow, setHoveredRow]   = useState(null);
  const LIMIT = 50;
  const searchTimeout = useRef(null);

  // ── Fetch categories once ────────────────────────────────────────────────
  useEffect(() => {
    axios
      .get('/api/products/catalog/categories')
      .then((r) => setCategories(r.data.data || []))
      .catch(() => {});
  }, []);

  // ── Fetch products ────────────────────────────────────────────────────────
  const fetchProducts = useCallback(
    async (opts = {}) => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          search:   opts.search   !== undefined ? opts.search   : search,
          category: opts.category !== undefined ? opts.category : categoryFilter,
          status:   opts.status   !== undefined ? opts.status   : statusFilter,
          page:     opts.page     !== undefined ? opts.page     : page,
          limit:    LIMIT,
        };
        const res = await axios.get('/api/products/catalog', { params });
        if (res.data.success) {
          setProducts(res.data.data || []);
          setPagination(res.data.pagination || { total: 0, pages: 1 });
        } else {
          setError(res.data.message || 'Unknown error');
        }
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to load products');
      } finally {
        setLoading(false);
      }
    },
    [search, categoryFilter, statusFilter, page] // eslint-disable-line
  );

  useEffect(() => {
    fetchProducts();
  }, [categoryFilter, statusFilter, page]); // eslint-disable-line

  // ── Debounced search ──────────────────────────────────────────────────────
  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchProducts({ search: val, page: 1 });
    }, 400);
  };

  // ── Client-side sort (sorts current page) ────────────────────────────────
  const handleSort = (col) => {
    setSort((prev) => ({
      col,
      dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sorted = [...products].sort((a, b) => {
    const { col, dir } = sort;
    let va = a[col], vb = b[col];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });

  const columns = [
    { key: 'name',          label: 'Product',      sortable: true  },
    { key: 'sku',           label: 'SKU',          sortable: true  },
    { key: 'category',      label: 'Category',     sortable: true  },
    { key: 'mrp',           label: 'MRP',          sortable: true  },
    { key: 'selling_price', label: 'Sale Price',   sortable: true  },
    { key: 'stock_qty',     label: 'Stock',        sortable: true  },
    { key: 'platforms',     label: 'Platforms',    sortable: false },
    { key: 'status',        label: 'Status',       sortable: true  },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          ProductVault Catalog
          {!loading && (
            <span style={styles.headerBadge}>{pagination.total} products</span>
          )}
        </div>
        <span style={{ color: COLORS.goldLight, fontSize: 12, opacity: 0.8 }}>NavyStore Admin</span>
      </div>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            style={styles.searchInput}
            placeholder="Search by name, SKU or description…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = COLORS.gold)}
            onBlur={(e)  => (e.target.style.borderColor = COLORS.border)}
          />
        </div>

        <select
          style={styles.select}
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          style={styles.select}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <button
          style={styles.refreshBtn}
          onClick={() => fetchProducts()}
          title="Refresh"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <strong>Error loading products:</strong> {error}
        </div>
      )}

      {/* Table */}
      <div style={styles.tableWrap}>
        {loading ? (
          <div style={styles.loader}>
            <Spinner /> Loading products from ProductVault…
          </div>
        ) : sorted.length === 0 ? (
          <div style={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={COLORS.border} strokeWidth="1.5" style={{ margin: '0 auto 12px', display: 'block' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p style={{ fontSize: 16, marginBottom: 4 }}>No products found</p>
            <p style={{ fontSize: 13 }}>Try adjusting your search or filters</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      ...styles.th,
                      ...(col.key === 'mrp' || col.key === 'selling_price' || col.key === 'stock_qty'
                        ? { textAlign: 'right' }
                        : {}),
                    }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    {col.label}
                    {col.sortable && (
                      <SortIcon dir={sort.col === col.key ? sort.dir : null} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.id}
                  style={{
                    ...styles.trHover,
                    background: hoveredRow === p.id ? '#F7FAFC' : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredRow(p.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Product Name */}
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    {p.description && (
                      <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.description}
                      </div>
                    )}
                  </td>

                  {/* SKU */}
                  <td style={styles.td}>
                    <span style={styles.skuBadge}>{p.sku || '—'}</span>
                  </td>

                  {/* Category */}
                  <td style={styles.td}>
                    {p.category ? (
                      <span style={{ fontSize: 13, color: COLORS.info, fontWeight: 500 }}>{p.category}</span>
                    ) : (
                      <span style={{ color: COLORS.border }}>—</span>
                    )}
                  </td>

                  {/* MRP */}
                  <td style={{ ...styles.td, ...styles.priceCell }}>
                    <span style={{ color: COLORS.textMuted, textDecoration: 'line-through', fontSize: 13 }}>
                      {fmt(p.mrp)}
                    </span>
                  </td>

                  {/* Selling Price */}
                  <td style={{ ...styles.td, ...styles.priceCell }}>
                    <span style={{ fontWeight: 700, color: COLORS.green, fontSize: 14 }}>
                      {fmt(p.selling_price)}
                    </span>
                    {p.mrp > p.selling_price && (
                      <div style={{ fontSize: 11, color: COLORS.warning }}>
                        {Math.round(((p.mrp - p.selling_price) / p.mrp) * 100)}% off
                      </div>
                    )}
                  </td>

                  {/* Stock */}
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <span style={p.stock_qty <= 5 ? styles.stockLow : styles.stockOk}>
                      {p.stock_qty}
                    </span>
                    {p.stock_qty <= 5 && p.stock_qty > 0 && (
                      <span style={{ fontSize: 10, color: COLORS.danger, display: 'block' }}>Low</span>
                    )}
                    {p.stock_qty === 0 && (
                      <span style={{ fontSize: 10, color: COLORS.danger, display: 'block' }}>Out</span>
                    )}
                  </td>

                  {/* Platforms */}
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {p.platforms && p.platforms.length > 0
                        ? p.platforms.map((plat) => (
                            <span
                              key={plat}
                              style={styles.platformChip(plat)}
                              title={plat}
                            >
                              {PLATFORM_META[plat]?.char || plat[0]}
                            </span>
                          ))
                        : <span style={{ color: COLORS.border, fontSize: 12 }}>—</span>
                      }
                    </div>
                  </td>

                  {/* Status */}
                  <td style={styles.td}>
                    <span style={styles.statusBadge(p.status)}>{STATUS_META[p.status]?.label || p.status || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer / Pagination */}
      {!loading && pagination.pages > 1 && (
        <div style={styles.footer}>
          <span>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, pagination.total)} of {pagination.total} products
          </span>
          <div style={styles.pagination}>
            <button
              style={styles.pageBtn(false)}
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ Prev
            </button>
            {Array.from({ length: Math.min(7, pagination.pages) }, (_, i) => {
              let p;
              if (pagination.pages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= pagination.pages - 3) {
                p = pagination.pages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <button
                  key={p}
                  style={styles.pageBtn(p === page)}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              );
            })}
            <button
              style={styles.pageBtn(false)}
              disabled={page === pagination.pages}
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            >
              Next ›
            </button>
          </div>
        </div>
      )}

      {!loading && pagination.pages <= 1 && (
        <div style={styles.footer}>
          <span>{pagination.total} product{pagination.total !== 1 ? 's' : ''} loaded from ProductVault</span>
        </div>
      )}
    </div>
  );
}
