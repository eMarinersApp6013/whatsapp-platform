require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: '/var/run/postgresql',
  port: 5433,
  user: 'postgres',
  database: 'navystore_agent',
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

async function initTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        waba_id VARCHAR(100),
        phone_number_id VARCHAR(100),
        wa_token TEXT,
        plan VARCHAR(50) DEFAULT 'free',
        is_active BOOLEAN DEFAULT true,
        invoice_provider VARCHAR(20) DEFAULT 'builtin',
        store_name VARCHAR(255),
        store_address TEXT,
        store_gstin VARCHAR(20),
        store_phone VARCHAR(20),
        bank_name VARCHAR(255),
        bank_account VARCHAR(50),
        bank_ifsc VARCHAR(20),
        upi_id VARCHAR(100),
        zoho_enabled BOOLEAN DEFAULT false,
        cod_extra_charge NUMERIC(10,2) DEFAULT 0,
        loyalty_discount_pct NUMERIC(5,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        phone VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        rank VARCHAR(50),
        address_json JSONB,
        order_count INTEGER DEFAULT 0,
        total_spent NUMERIC(12,2) DEFAULT 0,
        is_vip BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        sku VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        gst_rate NUMERIC(5,2) DEFAULT 0,
        hsn_code VARCHAR(20),
        stock_qty INTEGER DEFAULT 0,
        stock_alert_threshold INTEGER DEFAULT 5,
        rank_tags TEXT[] DEFAULT '{}',
        image_urls TEXT[] DEFAULT '{}',
        weight_kg NUMERIC(6,3) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        client_id INTEGER NOT NULL REFERENCES clients(id),
        order_number VARCHAR(50) UNIQUE,
        status VARCHAR(50) DEFAULT 'PENDING',
        items_json JSONB,
        subtotal NUMERIC(10,2) DEFAULT 0,
        gst_amount NUMERIC(10,2) DEFAULT 0,
        shipping_charge NUMERIC(10,2) DEFAULT 0,
        total NUMERIC(10,2) DEFAULT 0,
        payment_method VARCHAR(50),
        payment_status VARCHAR(50) DEFAULT 'UNPAID',
        cashfree_order_id VARCHAR(100),
        address_json JSONB,
        zoho_invoice_id VARCHAR(100),
        invoice_approved BOOLEAN DEFAULT false,
        awb_number VARCHAR(100),
        courier_slip_approved BOOLEAN DEFAULT false,
        courier_partner VARCHAR(100),
        payment_link_sent_at TIMESTAMPTZ,
        cod_nudge_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id),
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        phone VARCHAR(20) NOT NULL,
        role VARCHAR(20) NOT NULL,
        message TEXT,
        message_type VARCHAR(20) DEFAULT 'text',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS courier_slips (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        status VARCHAR(50) DEFAULT 'PENDING',
        weight_kg NUMERIC(6,3) DEFAULT 0,
        dimensions_json JSONB,
        courier_partner VARCHAR(100),
        awb_number VARCHAR(100),
        label_url TEXT,
        rate_comparison_json JSONB,
        selected_by VARCHAR(255),
        approved_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS shipping_rates (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        zone VARCHAR(50),
        states TEXT[] DEFAULT '{}',
        rate_500g NUMERIC(10,2) DEFAULT 0,
        rate_1kg NUMERIC(10,2) DEFAULT 0,
        rate_2kg NUMERIC(10,2) DEFAULT 0,
        per_kg_extra NUMERIC(10,2) DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS staff_numbers (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        phone VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        is_active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        client_id INTEGER REFERENCES clients(id),
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        issue_type VARCHAR(100),
        description TEXT,
        status VARCHAR(50) DEFAULT 'OPEN',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        invoice_number VARCHAR(100) UNIQUE NOT NULL,
        pdf_path TEXT,
        zoho_invoice_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'DRAFT',
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS broadcasts (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        template VARCHAR(255),
        template_params JSONB,
        audience VARCHAR(50),
        audience_count INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Add new columns if they don't exist (safe for existing DBs)
      DO $$ BEGIN
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_provider VARCHAR(20) DEFAULT 'builtin';
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS store_name VARCHAR(255);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS store_address TEXT;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS store_gstin VARCHAR(20);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS store_phone VARCHAR(20);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100);
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS zoho_enabled BOOLEAN DEFAULT false;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cod_extra_charge NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS loyalty_discount_pct NUMERIC(5,2) DEFAULT 0;
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0;
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_alert_threshold INTEGER DEFAULT 5;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_sent_at TIMESTAMPTZ;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_nudge_sent BOOLEAN DEFAULT false;
        ALTER TABLE courier_slips ADD COLUMN IF NOT EXISTS rate_comparison_json JSONB;
        ALTER TABLE courier_slips ADD COLUMN IF NOT EXISTS selected_by VARCHAR(255);
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);
    console.log('All database tables ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initTables };
