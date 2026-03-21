/**
 * Unified multi-courier service — supports iCarry, Shiprocket, Delhivery, Xpressbees, ShipMozo.
 * Each courier implements: getRates, createShipment, trackShipment, cancelShipment.
 */

const { pool } = require('../config/db');

// Token cache per courier
const tokens = {};

// ─── SHIPROCKET ───────────────────────────────────────────────

async function shiprocketLogin() {
  if (tokens.shiprocket && tokens.shiprocket.expiry > Date.now()) return tokens.shiprocket.token;
  const res = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('Shiprocket login failed');
  tokens.shiprocket = { token: data.token, expiry: Date.now() + 9 * 24 * 60 * 60 * 1000 };
  return data.token;
}

const shiprocket = {
  name: 'shiprocket',
  async getRates(pickup, delivery, weight, cod = false) {
    const token = await shiprocketLogin();
    const res = await fetch(
      `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickup}&delivery_postcode=${delivery}&weight=${weight}&cod=${cod ? 1 : 0}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    const couriers = data.data?.available_courier_companies || [];
    return couriers.map((c) => ({
      courier: 'shiprocket',
      courier_company: c.courier_name,
      courier_company_id: c.courier_company_id,
      rate: parseFloat(c.rate),
      estimated_days: c.estimated_delivery_days,
      cod_available: c.cod === 1,
    }));
  },
  async createShipment(order, courierCompanyId) {
    const token = await shiprocketLogin();
    const address = typeof order.address_json === 'string' ? JSON.parse(order.address_json) : (order.address_json || {});
    const items = order.items_json || [];
    const res = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: order.order_number,
        order_date: new Date().toISOString().slice(0, 10),
        billing_customer_name: address.name || order.client_name,
        billing_address: address.flat || '',
        billing_address_2: address.area || '',
        billing_city: address.city || '',
        billing_pincode: address.pincode || '',
        billing_state: address.state || '',
        billing_country: 'India',
        billing_phone: order.client_phone,
        shipping_is_billing: true,
        order_items: items.map((i) => ({
          name: i.name, sku: i.sku || 'SKU', units: i.qty || 1,
          selling_price: parseFloat(i.price || 0), hsn: i.hsn_code || '',
        })),
        payment_method: order.payment_method === 'COD' ? 'COD' : 'Prepaid',
        sub_total: parseFloat(order.total),
        length: 20, breadth: 15, height: 10,
        weight: items.reduce((w, i) => w + (parseFloat(i.weight_kg) || 0.5) * (i.qty || 1), 0),
        courier_id: courierCompanyId,
      }),
    });
    const data = await res.json();
    return { awb: data.awb_code || data.shipment_id, shipment_id: data.shipment_id, label_url: data.label_url };
  },
  async trackShipment(awb) {
    const token = await shiprocketLogin();
    const res = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const activities = data.tracking_data?.shipment_track_activities || [];
    const current = data.tracking_data?.shipment_track?.[0] || {};
    return { status: current.current_status || 'UNKNOWN', city: current.current_city || '', activities };
  },
  async cancelShipment(awb) {
    const token = await shiprocketLogin();
    const res = await fetch('https://apiv2.shiprocket.in/v1/external/orders/cancel', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ awbs: [awb] }),
    });
    return res.json();
  },
};

// ─── DELHIVERY ────────────────────────────────────────────────

const delhivery = {
  name: 'delhivery',
  async getRates(pickup, delivery, weight, cod = false) {
    const token = process.env.DELHIVERY_TOKEN;
    if (!token) return [];
    const res = await fetch(
      `https://track.delhivery.com/api/kinko/v1/invoice/charges/.json?md=S&ss=Delivered&d_pin=${delivery}&o_pin=${pickup}&cgm=${weight * 1000}&pt=${cod ? 'COD' : 'Pre-paid'}`,
      { headers: { Authorization: `Token ${token}` } }
    );
    const data = await res.json();
    if (!data || data.length === 0) return [];
    const d = Array.isArray(data) ? data[0] : data;
    return [{
      courier: 'delhivery', courier_company: 'Delhivery Surface',
      rate: parseFloat(d.total_amount || 0), estimated_days: 5, cod_available: true,
    }];
  },
  async createShipment(order) {
    const token = process.env.DELHIVERY_TOKEN;
    const address = typeof order.address_json === 'string' ? JSON.parse(order.address_json) : (order.address_json || {});
    const items = order.items_json || [];
    const shipment = {
      shipments: [{
        name: address.name || order.client_name,
        add: [address.flat, address.area].filter(Boolean).join(', '),
        pin: address.pincode, city: address.city, state: address.state, country: 'India',
        phone: order.client_phone, order: order.order_number,
        payment_mode: order.payment_method === 'COD' ? 'COD' : 'Pre-paid',
        total_amount: parseFloat(order.total),
        weight: items.reduce((w, i) => w + (parseFloat(i.weight_kg) || 0.5) * (i.qty || 1), 0) * 1000,
        products_desc: items.map((i) => i.name).join(', '),
      }],
    };
    const formData = `format=json&data=${encodeURIComponent(JSON.stringify(shipment))}`;
    const res = await fetch('https://track.delhivery.com/api/cmu/create.json', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });
    const data = await res.json();
    const pkg = data.packages?.[0] || {};
    return { awb: pkg.waybill || '', shipment_id: pkg.refnum || '' };
  },
  async trackShipment(awb) {
    const token = process.env.DELHIVERY_TOKEN;
    const res = await fetch(`https://track.delhivery.com/api/v1/packages/json/?waybill=${awb}`, {
      headers: { Authorization: `Token ${token}` },
    });
    const data = await res.json();
    const shipment = data.ShipmentData?.[0]?.Shipment || {};
    return { status: shipment.Status?.Status || 'UNKNOWN', city: shipment.Status?.StatusLocation || '' };
  },
  async cancelShipment(awb) {
    const token = process.env.DELHIVERY_TOKEN;
    const res = await fetch('https://track.delhivery.com/api/p/edit', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ waybill: awb, cancellation: true }),
    });
    return res.json();
  },
};

// ─── XPRESSBEES ───────────────────────────────────────────────

async function xpressbeesLogin() {
  if (tokens.xpressbees && tokens.xpressbees.expiry > Date.now()) return tokens.xpressbees.token;
  const res = await fetch('https://shipment.xpressbees.com/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.XPRESSBEES_EMAIL,
      password: process.env.XPRESSBEES_PASSWORD,
    }),
  });
  const data = await res.json();
  if (!data.data?.token) throw new Error('Xpressbees login failed');
  tokens.xpressbees = { token: data.data.token, expiry: Date.now() + 24 * 60 * 60 * 1000 };
  return data.data.token;
}

const xpressbees = {
  name: 'xpressbees',
  async getRates(pickup, delivery, weight, cod = false) {
    try {
      const token = await xpressbeesLogin();
      const res = await fetch('https://shipment.xpressbees.com/api/courier/serviceability', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: pickup, destination: delivery, weight, payment_type: cod ? 'cod' : 'prepaid' }),
      });
      const data = await res.json();
      return (data.data || []).map((c) => ({
        courier: 'xpressbees', courier_company: c.name || 'Xpressbees',
        rate: parseFloat(c.freight_charge || 0), estimated_days: c.estimated_days || 5, cod_available: !!c.cod,
      }));
    } catch { return []; }
  },
  async createShipment(order) {
    const token = await xpressbeesLogin();
    const address = typeof order.address_json === 'string' ? JSON.parse(order.address_json) : (order.address_json || {});
    const res = await fetch('https://shipment.xpressbees.com/api/shipments2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_number: order.order_number,
        consignee_name: address.name || order.client_name,
        consignee_address: [address.flat, address.area].filter(Boolean).join(', '),
        consignee_city: address.city, consignee_state: address.state,
        consignee_pincode: address.pincode, consignee_phone: order.client_phone,
        payment_type: order.payment_method === 'COD' ? 'cod' : 'prepaid',
        order_amount: parseFloat(order.total),
        weight: (order.items_json || []).reduce((w, i) => w + (parseFloat(i.weight_kg) || 0.5) * (i.qty || 1), 0),
      }),
    });
    const data = await res.json();
    return { awb: data.data?.awb_number || '', shipment_id: data.data?.shipment_id || '' };
  },
  async trackShipment(awb) {
    const token = await xpressbeesLogin();
    const res = await fetch(`https://shipment.xpressbees.com/api/shipments2/track/${awb}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return { status: data.data?.status || 'UNKNOWN', city: data.data?.location || '' };
  },
  async cancelShipment(awb) {
    const token = await xpressbeesLogin();
    const res = await fetch(`https://shipment.xpressbees.com/api/shipments2/cancel/${awb}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

// ─── ICARRY ───────────────────────────────────────────────────

const icarry = {
  name: 'icarry',
  async getRates(pickup, delivery, weight, cod = false) {
    const token = process.env.ICARRY_TOKEN;
    if (!token) return [];
    try {
      const res = await fetch(`${process.env.ICARRY_BASE_URL || 'https://api.icarry.in'}/api/v1/rates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup_pincode: pickup, delivery_pincode: delivery, weight, cod }),
      });
      const data = await res.json();
      return (data.rates || []).map((r) => ({
        courier: 'icarry', courier_company: r.courier_name || 'iCarry',
        rate: parseFloat(r.total || 0), estimated_days: r.estimated_days || 4, cod_available: !!r.cod,
      }));
    } catch { return []; }
  },
  async createShipment(order) {
    const token = process.env.ICARRY_TOKEN;
    const address = typeof order.address_json === 'string' ? JSON.parse(order.address_json) : (order.address_json || {});
    const res = await fetch(`${process.env.ICARRY_BASE_URL || 'https://api.icarry.in'}/api/v1/shipments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: order.order_number, name: address.name || order.client_name,
        address: [address.flat, address.area].filter(Boolean).join(', '),
        city: address.city, state: address.state, pincode: address.pincode,
        phone: order.client_phone, amount: parseFloat(order.total),
        payment_mode: order.payment_method === 'COD' ? 'COD' : 'Prepaid',
        weight: (order.items_json || []).reduce((w, i) => w + (parseFloat(i.weight_kg) || 0.5) * (i.qty || 1), 0),
      }),
    });
    const data = await res.json();
    return { awb: data.awb || '', shipment_id: data.shipment_id || '' };
  },
  async trackShipment(awb) {
    const token = process.env.ICARRY_TOKEN;
    const res = await fetch(`${process.env.ICARRY_BASE_URL || 'https://api.icarry.in'}/api/v1/track/${awb}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return { status: data.status || 'UNKNOWN', city: data.location || '' };
  },
  async cancelShipment(awb) {
    const token = process.env.ICARRY_TOKEN;
    const res = await fetch(`${process.env.ICARRY_BASE_URL || 'https://api.icarry.in'}/api/v1/cancel/${awb}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

// ─── SHIPMOZO ─────────────────────────────────────────────────

const shipmozo = {
  name: 'shipmozo',
  async getRates(pickup, delivery, weight, cod = false) {
    const token = process.env.SHIPMOZO_TOKEN;
    if (!token) return [];
    try {
      const res = await fetch('https://app.shipmozo.com/api/v1/courier/serviceability', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup_pincode: pickup, delivery_pincode: delivery, weight, cod: cod ? 1 : 0 }),
      });
      const data = await res.json();
      return (data.data || []).map((c) => ({
        courier: 'shipmozo', courier_company: c.courier_name || 'ShipMozo',
        rate: parseFloat(c.rate || 0), estimated_days: c.estimated_days || 5, cod_available: !!c.cod,
      }));
    } catch { return []; }
  },
  async createShipment(order) {
    const token = process.env.SHIPMOZO_TOKEN;
    const address = typeof order.address_json === 'string' ? JSON.parse(order.address_json) : (order.address_json || {});
    const res = await fetch('https://app.shipmozo.com/api/v1/orders/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_number: order.order_number, name: address.name || order.client_name,
        address: [address.flat, address.area].filter(Boolean).join(', '),
        city: address.city, state: address.state, pincode: address.pincode,
        phone: order.client_phone, amount: parseFloat(order.total),
        payment_mode: order.payment_method === 'COD' ? 'COD' : 'Prepaid',
      }),
    });
    const data = await res.json();
    return { awb: data.awb || '', shipment_id: data.order_id || '' };
  },
  async trackShipment(awb) {
    const token = process.env.SHIPMOZO_TOKEN;
    const res = await fetch(`https://app.shipmozo.com/api/v1/track/${awb}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return { status: data.status || 'UNKNOWN', city: data.location || '' };
  },
  async cancelShipment(awb) {
    const token = process.env.SHIPMOZO_TOKEN;
    const res = await fetch(`https://app.shipmozo.com/api/v1/cancel/${awb}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

// ─── UNIFIED INTERFACE ───────────────────────────────────────

const COURIERS = { shiprocket, delhivery, xpressbees, icarry, shipmozo };

/**
 * Get configured (env vars present) couriers.
 */
function getActiveCouriers() {
  const active = [];
  if (process.env.SHIPROCKET_EMAIL) active.push(shiprocket);
  if (process.env.DELHIVERY_TOKEN) active.push(delhivery);
  if (process.env.XPRESSBEES_EMAIL) active.push(xpressbees);
  if (process.env.ICARRY_TOKEN) active.push(icarry);
  if (process.env.SHIPMOZO_TOKEN) active.push(shipmozo);
  return active;
}

/**
 * Fetch rates from ALL active couriers simultaneously.
 * @returns {Array} sorted by price ascending
 */
async function getAllRates(pickup, delivery, weight, cod = false) {
  const couriers = getActiveCouriers();
  if (couriers.length === 0) return [];

  const results = await Promise.allSettled(
    couriers.map((c) => c.getRates(pickup, delivery, weight, cod))
  );

  const allRates = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allRates.push(...result.value);
    }
  }

  return allRates.sort((a, b) => a.rate - b.rate);
}

/**
 * Pick recommended courier based on weight, payment method.
 */
function recommendCourier(rates, weight, isPrepaid) {
  if (rates.length === 0) return null;
  // Prepaid → fastest, COD → only COD-enabled cheapest, <1kg → cheapest
  if (isPrepaid) {
    const fastest = [...rates].sort((a, b) => a.estimated_days - b.estimated_days);
    return fastest[0];
  }
  const codRates = rates.filter((r) => r.cod_available);
  if (codRates.length > 0) return codRates[0]; // already sorted by price
  return rates[0]; // cheapest overall
}

/**
 * Create shipment on a specific courier.
 */
async function createShipment(courierName, order, extraParams) {
  const courier = COURIERS[courierName];
  if (!courier) throw new Error(`Unknown courier: ${courierName}`);
  return courier.createShipment(order, extraParams);
}

/**
 * Track shipment on a specific courier.
 */
async function trackShipment(courierName, awb) {
  const courier = COURIERS[courierName];
  if (!courier) throw new Error(`Unknown courier: ${courierName}`);
  return courier.trackShipment(awb);
}

/**
 * Cancel shipment on a specific courier.
 */
async function cancelShipment(courierName, awb) {
  const courier = COURIERS[courierName];
  if (!courier) throw new Error(`Unknown courier: ${courierName}`);
  return courier.cancelShipment(awb);
}

/**
 * Normalize different courier status strings to our internal statuses.
 */
function normalizeStatus(rawStatus) {
  const s = (rawStatus || '').toUpperCase();
  if (s.includes('DELIVER') && !s.includes('OUT')) return 'DELIVERED';
  if (s.includes('OUT') && s.includes('DELIVERY')) return 'OUT_FOR_DEL';
  if (s.includes('TRANSIT') || s.includes('IN-TRANSIT')) return 'IN_TRANSIT';
  if (s.includes('PICK')) return 'PICKED_UP';
  if (s.includes('FAIL') || s.includes('UNDELIVER')) return 'FAILED';
  if (s.includes('CANCEL')) return 'CANCELLED';
  if (s.includes('DISPATCH') || s.includes('SHIPPED')) return 'DISPATCHED';
  return rawStatus;
}

module.exports = {
  getAllRates, recommendCourier, createShipment, trackShipment, cancelShipment,
  normalizeStatus, getActiveCouriers, COURIERS,
};
