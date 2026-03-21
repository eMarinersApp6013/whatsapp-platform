import React, { useState, useEffect, useRef } from 'react';
import { Plus, Upload, Search, Edit3, Trash2, X, Package } from 'lucide-react';
import api from '../utils/api';
import { formatCurrency } from '../utils/helpers';

const EMPTY_PRODUCT = {
  name: '', sku: '', description: '', price: '', mrp: '', gst_percent: '18',
  stock_qty: '', weight_grams: '', hsn_code: '', image_url: '',
  rank_tags: '', is_active: true, stock_alert_threshold: '5',
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | product obj for edit
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const params = search ? { search } : {};
      const res = await api.get('/api/products', { params });
      setProducts(res.data.products || res.data || []);
    } catch (err) {
      console.error('Load products error:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setForm(EMPTY_PRODUCT);
    setModal('add');
  };

  const openEdit = (product) => {
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      description: product.description || '',
      price: product.price || '',
      mrp: product.mrp || '',
      gst_percent: product.gst_percent || '18',
      stock_qty: product.stock_qty || '',
      weight_grams: product.weight_grams || '',
      hsn_code: product.hsn_code || '',
      image_url: product.image_url || '',
      rank_tags: Array.isArray(product.rank_tags) ? product.rank_tags.join(', ') : (product.rank_tags || ''),
      is_active: product.is_active !== false,
      stock_alert_threshold: product.stock_alert_threshold || '5',
    });
    setModal(product);
  };

  const saveProduct = async () => {
    setSaving(true);
    try {
      const data = {
        ...form,
        price: parseFloat(form.price) || 0,
        mrp: parseFloat(form.mrp) || 0,
        gst_percent: parseFloat(form.gst_percent) || 0,
        stock_qty: parseInt(form.stock_qty) || 0,
        weight_grams: parseInt(form.weight_grams) || 0,
        stock_alert_threshold: parseInt(form.stock_alert_threshold) || 5,
        rank_tags: typeof form.rank_tags === 'string'
          ? form.rank_tags.split(',').map((s) => s.trim()).filter(Boolean)
          : form.rank_tags,
      };

      if (modal === 'add') {
        await api.post('/api/products', data);
      } else {
        await api.put(`/api/products/${modal.id}`, data);
      }
      setModal(null);
      setLoading(true);
      await loadProducts();
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.delete(`/api/products/${id}`);
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      alert('Delete failed');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/api/products/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      setLoading(true);
      await loadProducts();
    } catch (err) {
      alert('Import failed: ' + (err.response?.data?.error || err.message));
    }
    e.target.value = '';
  };

  const updateStock = async (product, newQty) => {
    try {
      await api.put(`/api/products/${product.id}`, { stock_qty: parseInt(newQty) || 0 });
      setProducts(products.map((p) => p.id === product.id ? { ...p, stock_qty: parseInt(newQty) || 0 } : p));
    } catch (err) {
      alert('Update failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); setLoading(true); loadProducts(); }} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none w-64"
            />
          </form>
        </div>
        <div className="flex items-center gap-2">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-primary-500 text-primary-500 rounded-lg text-sm hover:bg-primary-50 transition"
          >
            <Upload className="w-4 h-4" />
            Import Excel
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
          <div className="text-sm">
            <span className="text-green-600 font-medium">{importResult.imported || 0} imported</span>
            {importResult.skipped > 0 && <span className="ml-3 text-yellow-600">{importResult.skipped} skipped</span>}
            {importResult.errors > 0 && <span className="ml-3 text-red-600">{importResult.errors} errors</span>}
          </div>
          <button onClick={() => setImportResult(null)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Product Grid */}
      {products.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center text-gray-400 shadow-sm border border-gray-100">
          <Package className="w-16 h-16 mx-auto mb-3 text-gray-300" />
          <p>No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
              {/* Image */}
              <div className="h-40 bg-gray-100 flex items-center justify-center">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <Package className="w-12 h-12 text-gray-300" />
                )}
              </div>
              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 line-clamp-1">{product.name}</h3>
                    <p className="text-xs text-gray-500">{product.sku || 'No SKU'}</p>
                  </div>
                  {!product.is_active && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full">Inactive</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-lg font-bold text-primary-500">{formatCurrency(product.price)}</p>
                  {product.mrp > product.price && (
                    <p className="text-sm text-gray-400 line-through">{formatCurrency(product.mrp)}</p>
                  )}
                </div>
                {/* Stock - inline editable */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Stock:</span>
                  <input
                    type="number"
                    defaultValue={product.stock_qty || 0}
                    onBlur={(e) => updateStock(product, e.target.value)}
                    className={`w-16 px-2 py-0.5 border rounded text-sm text-center ${
                      (product.stock_qty || 0) <= (product.stock_alert_threshold || 5)
                        ? 'border-red-300 bg-red-50 text-red-700'
                        : 'border-gray-200'
                    }`}
                  />
                  {(product.stock_qty || 0) <= (product.stock_alert_threshold || 5) && (
                    <span className="text-xs text-red-500">Low</span>
                  )}
                </div>
                {/* Tags */}
                {product.rank_tags && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(Array.isArray(product.rank_tags) ? product.rank_tags : [product.rank_tags]).map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gold-50 text-gold-700 text-xs rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openEdit(product)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-sm text-primary-500 hover:bg-primary-50 rounded-lg transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => deleteProduct(product.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {modal === 'add' ? 'Add Product' : 'Edit Product'}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input
                  type="text" value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
                <input
                  type="text" value={form.hsn_code}
                  onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
                <input
                  type="number" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">MRP</label>
                <input
                  type="number" value={form.mrp}
                  onChange={(e) => setForm({ ...form, mrp: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GST %</label>
                <input
                  type="number" value={form.gst_percent}
                  onChange={(e) => setForm({ ...form, gst_percent: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Qty</label>
                <input
                  type="number" value={form.stock_qty}
                  onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight (grams)</label>
                <input
                  type="number" value={form.weight_grams}
                  onChange={(e) => setForm({ ...form, weight_grams: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alert Threshold</label>
                <input
                  type="number" value={form.stock_alert_threshold}
                  onChange={(e) => setForm({ ...form, stock_alert_threshold: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input
                  type="text" value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Rank Tags (comma separated)</label>
                <input
                  type="text" value={form.rank_tags}
                  onChange={(e) => setForm({ ...form, rank_tags: e.target.value })}
                  placeholder="wholesale, premium, retail"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox" checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label className="text-sm text-gray-700">Active</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={saveProduct}
                disabled={saving || !form.name || !form.price}
                className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition disabled:opacity-60"
              >
                {saving ? 'Saving...' : modal === 'add' ? 'Add Product' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
