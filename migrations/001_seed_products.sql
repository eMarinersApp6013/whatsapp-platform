-- NavyStore — Seed 10 Demo Products + 2 Bundles + Shipping Rates
-- Run AFTER 000_initial_schema.sql
-- psql -U postgres -p 5433 -d navystore_agent -f migrations/001_seed_products.sql

BEGIN;

INSERT INTO products (tenant_id, sku, name, description, price, compare_price, stock_qty, category, image_urls, weight_kg, rank_tags, is_active, custom_options) VALUES

(1, 'UNI-001', 'Navy Officer Uniform Set',
 'Complete officer uniform: shirt, trousers, tie. Premium polyester-viscose. Wrinkle-resistant. Available in all sizes.',
 2499, 2999, 12, 'Uniforms',
 ARRAY['https://placehold.co/400x400/1a365d/ffffff?text=Officer+Uniform'],
 0.8, ARRAY['officer','captain','2nd_officer'], true, NULL),

(1, 'UNI-002', 'Boiler Suit Coverall',
 'Engine room coverall. Fire-retardant fabric. Reflective safety strips. Multiple tool pockets. Available S-3XL.',
 1800, 2200, 20, 'Uniforms',
 ARRAY['https://placehold.co/400x400/c53030/ffffff?text=Boiler+Suit'],
 0.6, ARRAY['engineer','rating','motorman'], true, NULL),

(1, 'UNI-003', 'Tropical White Uniform',
 'Lightweight cotton blend for warm ports. Gold buttons. Includes shirt and shorts. Cool and breathable.',
 1950, 2400, 8, 'Uniforms',
 ARRAY['https://placehold.co/400x400/f7fafc/1a365d?text=Tropical+White'],
 0.5, ARRAY['officer','captain'], true, NULL),

(1, 'SAF-001', 'Safety Helmet White SOLAS',
 'SOLAS approved safety helmet. Adjustable ratchet headband. Ventilation slots. UV resistant ABS shell.',
 1200, 1500, 15, 'Safety',
 ARRAY['https://placehold.co/400x400/f6e05e/1a365d?text=Safety+Helmet'],
 0.4, ARRAY['all','safety','engineer','rating'], true, NULL),

(1, 'SAF-002', 'Life Jacket SOLAS Approved',
 'SOLAS approved life jacket with whistle and self-activating light. 150N buoyancy. Auto & manual inflation.',
 2200, 2800, 30, 'Safety',
 ARRAY['https://placehold.co/400x400/e53e3e/ffffff?text=Life+Jacket'],
 0.9, ARRAY['all','safety'], true, NULL),

(1, 'ACC-001', '2nd Officer Epaulette Pair',
 'Hand-embroidered gold bullion wire epaulettes. 2 stripes. Clip-on style. Sold as matching pair.',
 450, 600, 25, 'Accessories',
 ARRAY['https://placehold.co/400x400/d69e2e/1a365d?text=Epaulettes+2nd'],
 0.1, ARRAY['2nd_officer','junior_officer'], true, NULL),

(1, 'ACC-002', 'Captain Peak Cap Navy',
 'Premium peaked cap with gold badge and chin strap. Adjustable inner sweatband. Navy wool blend.',
 650, 850, 12, 'Accessories',
 ARRAY['https://placehold.co/400x400/1a365d/d69e2e?text=Captain+Cap'],
 0.3, ARRAY['captain','chief_officer'], true, NULL),

(1, 'ACC-003', 'Navigation Divider Set',
 'Brass navigation dividers. 7-inch arm length. Precision engineering. Comes in velvet-lined wooden box.',
 750, 950, 18, 'Accessories',
 ARRAY['https://placehold.co/400x400/2d3748/d69e2e?text=Divider+Set'],
 0.3, ARRAY['officer','cadet','navigation'], true, NULL),

(1, 'CUS-001', 'Brass Nameplate — Custom Engraved',
 'Premium brass nameplate with your name, rank, and ship. Hand-engraved lettering. Wall mount or desk stand option. 3-5 days production.',
 499, 699, 99, 'Custom',
 ARRAY['https://placehold.co/400x400/d69e2e/1a365d?text=Custom+Nameplate'],
 0.2, ARRAY['all','gift'], true,
 '{"is_customizable":true,"fields":[{"name":"your_name","label":"Your Name","type":"text","required":true,"placeholder":"e.g. Rajesh Kumar"},{"name":"rank","label":"Rank","type":"text","required":true,"placeholder":"e.g. Chief Officer"},{"name":"ship_name","label":"Ship Name","type":"text","required":false,"placeholder":"e.g. MV Pacific Star"},{"name":"logo","label":"Logo Symbol","type":"select","options":["⚓ Anchor","🔱 Trident","⭐ Star","🦅 Eagle","🛳️ Ship","📤 Upload My Logo"]},{"name":"material","label":"Material","type":"select","options":["Gold Brass","Silver Chrome","Matte Black"]}],"production_days":"3-5"}'::jsonb),

(1, 'CUS-002', 'Custom Embroidered T-Shirt',
 'Premium 100% cotton tee with custom embroidery. Add name, rank, ship logo. Front + back options. Bulk order discounts available.',
 899, 1199, 99, 'Custom',
 ARRAY['https://placehold.co/400x400/2d3748/ffffff?text=Custom+TShirt'],
 0.3, ARRAY['all','gift','casual'], true,
 '{"is_customizable":true,"fields":[{"name":"your_name","label":"Name to Embroider","type":"text","required":true},{"name":"rank","label":"Rank (optional)","type":"text","required":false},{"name":"logo","label":"Logo Symbol","type":"select","options":["⚓ Anchor","🔱 Trident","⭐ Star","🦅 Eagle","🛳️ Ship","📤 Upload My Logo"]},{"name":"color","label":"T-Shirt Color","type":"select","options":["White","Black","Navy Blue","Dark Gray"]},{"name":"placement","label":"Embroidery Placement","type":"select","options":["Front Center","Back Full","Left Chest","Right Sleeve"]}],"production_days":"5-7"}'::jsonb)

ON CONFLICT (sku) DO NOTHING;

-- ── Bundles ──────────────────────────────────────────────────────────────────
INSERT INTO bundles (tenant_id, name, description, product_ids, bundle_price, savings, is_active)
SELECT 1, '2nd Officer Starter Pack', 'Uniform + Epaulettes + Peak Cap. Everything to look the part! Save ₹200.',
  ARRAY[
    (SELECT id FROM products WHERE sku='UNI-001' AND tenant_id=1),
    (SELECT id FROM products WHERE sku='ACC-001' AND tenant_id=1),
    (SELECT id FROM products WHERE sku='ACC-002' AND tenant_id=1)
  ], 3399, 200, true
WHERE NOT EXISTS (SELECT 1 FROM bundles WHERE name='2nd Officer Starter Pack' AND tenant_id=1);

INSERT INTO bundles (tenant_id, name, description, product_ids, bundle_price, savings, is_active)
SELECT 1, 'Safety Essentials Kit', 'Helmet + Life Jacket combo. SOLAS compliant for all crew. Save ₹300.',
  ARRAY[
    (SELECT id FROM products WHERE sku='SAF-001' AND tenant_id=1),
    (SELECT id FROM products WHERE sku='SAF-002' AND tenant_id=1)
  ], 3100, 300, true
WHERE NOT EXISTS (SELECT 1 FROM bundles WHERE name='Safety Essentials Kit' AND tenant_id=1);

-- ── Shipping Rates ───────────────────────────────────────────────────────────
INSERT INTO shipping_rates (tenant_id, zone, states, rate_500g, rate_1kg, rate_2kg, per_kg_extra) VALUES
(1, 'North', ARRAY['Delhi','Haryana','Punjab','Uttar Pradesh','Rajasthan','Himachal Pradesh','Uttarakhand','J&K'], 60, 85, 120, 40),
(1, 'South', ARRAY['Karnataka','Tamil Nadu','Kerala','Telangana','Andhra Pradesh','Puducherry'], 70, 99, 140, 45),
(1, 'East',  ARRAY['West Bengal','Odisha','Bihar','Jharkhand','Assam','Meghalaya','Tripura','Manipur'], 75, 105, 150, 50),
(1, 'West',  ARRAY['Maharashtra','Gujarat','Madhya Pradesh','Chhattisgarh','Goa'], 65, 90, 130, 42),
(1, 'Remote',ARRAY['A&N Islands','Lakshadweep','Ladakh','Sikkim','Arunachal Pradesh','Nagaland','Mizoram'], 120, 160, 220, 70)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'Seed data inserted' AS status,
       (SELECT COUNT(*) FROM products WHERE tenant_id=1) AS products,
       (SELECT COUNT(*) FROM bundles  WHERE tenant_id=1) AS bundles,
       (SELECT COUNT(*) FROM shipping_rates WHERE tenant_id=1) AS shipping_zones;
