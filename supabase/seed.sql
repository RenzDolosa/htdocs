-- ============================================================================
-- Optional demo/seed data — mirrors app.js's seedGadgets(), seedInventoryAssets(),
-- seedUserAccounts(), seedWarehouses(), seedWarehouseLocations().
--
-- Run this ONCE, after schema.sql, only if you want the same starting demo
-- data the localStorage version shipped with. Skip it entirely for a real
-- deployment and let the app start empty.
--
-- Timestamps are computed the same way the JS did: now - N days, in epoch ms.
-- ============================================================================

insert into public.warehouses (id, "warehouseCode", name, "operationMode", "shortName", currency, country, region, city, "fullAddress", "contactPerson", "phoneNumber", email, "zipCode", "createdAt", "updatedAt")
values (
  'wh-seed-1', '1001', 'Warehouse 1', 'self-operate', 'main', 'PHP', 'Philippines', 'Cagayan Valley', 'Luna',
  'Purok 3, Poblacion, Luna, Cagayan Valley', 'Maria Santos', '09171234567', '', '3521',
  (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint
)
on conflict (id) do nothing;

insert into public.warehouse_locations (id, "warehouseId", zone, area, "locationCode", "positionNumber", property, enabled, "createdAt")
values
  ('loc-seed-1', 'wh-seed-1', 'main',   'Samples',       'Samples',       '9111820000000', 'goods',     true, (extract(epoch from now()) * 1000)::bigint),
  ('loc-seed-2', 'wh-seed-1', 'damage', 'Test Location', 'Test Location', '9111690000000', 'inventory', true, (extract(epoch from now()) * 1000)::bigint)
on conflict (id) do nothing;

insert into public.gadgets (id, "user", role, category, "serialNumber", "warehouseAssetTag", "assetTagDefault", "macAddress", password, merchant, remarks, description, "positionType", warehouse, owner, "createdAt", "updatedAt")
values
  ('gadget-seed-1', 'Maria Santos',   'Warehouse Associate', 'Laptop',            'SN-88213X', 'WH-0091', 'DELL-77213',  '3C:22:FB:AA:11:02', 'Wh0091!secure', 'Samples',       'Assigned on onboarding',        'Dell Latitude 5420, 16GB RAM, good condition', 'Good Position',      'Main Warehouse',   'Warehouse 1', (extract(epoch from now()) * 1000)::bigint - 30*86400000, (extract(epoch from now()) * 1000)::bigint),
  ('gadget-seed-2', 'Jun Dela Cruz',  'Forklift Operator',   'Handheld Scanner',  'SN-44120Q', 'WH-0114', 'ZEBRA-9931',  '',                  '',              'Samples',       '',                               'Zebra TC21 barcode scanner',                    'Good Position',      'Main Warehouse',   'Warehouse 1', (extract(epoch from now()) * 1000)::bigint - 30*86400000, (extract(epoch from now()) * 1000)::bigint),
  ('gadget-seed-3', '',               '',                     'Router',            'SN-77002A', 'WH-0203', 'TPLINK-4410', 'A0:B1:C2:D3:E4:F5', 'RtrAdm!n88',    'Kleenfant',     'Spare, not yet assigned',       'TP-Link AX3000, factory reset',                 'Temporary Damage',   'Damage Warehouse', 'Warehouse 2', (extract(epoch from now()) * 1000)::bigint - 30*86400000, (extract(epoch from now()) * 1000)::bigint),
  ('gadget-seed-4', 'Liza Bautista',  'Inventory Clerk',      'Tablet',            'SN-19087K', 'WH-0132', 'IPAD-2201',   '',                  '4821',          'Test Location', '',                               'iPad 9th gen with rugged case',                 'Inventory Position', 'Damage Warehouse', 'Warehouse 3', (extract(epoch from now()) * 1000)::bigint - 30*86400000, (extract(epoch from now()) * 1000)::bigint),
  ('gadget-seed-5', 'Rico Fernandez', 'Site Supervisor',      'Laptop',            'SN-33501P', 'WH-0077', 'HP-5591',     '5C:F9:38:AA:2B:10', 'SiteS3cure!',   'Shigetsu',      'Requested faster charger',      'HP EliteBook 840, 32GB RAM',                    'Temporary Returned', 'Main Warehouse',   '',            (extract(epoch from now()) * 1000)::bigint - 30*86400000, (extract(epoch from now()) * 1000)::bigint),
  ('gadget-seed-6', '',               '',                     'Handheld Scanner',  'SN-90211M', '',        'ZEBRA-9902',  '',                  '',              '',              'Awaiting warehouse assignment',  'Zebra TC21, brand new, unboxed',                '',                   '',                 '',            (extract(epoch from now()) * 1000)::bigint - 30*86400000, (extract(epoch from now()) * 1000)::bigint)
on conflict (id) do nothing;

insert into public.inventory_assets (id, category, "serialNumber", "assetTag", "macAddress", imei1, imei2, "createdAt")
values
  ('asset-seed-1', 'Laptop',           'SN-71120A', 'WH-0201',   '9C:35:5B:11:2A:04', '8546734562',  '864325623',  (extract(epoch from now()) * 1000)::bigint - 30*86400000),
  ('asset-seed-2', 'Handheld Scanner', 'SN-90211M', 'ZEBRA-9902', '',                 '85683453423', '',           (extract(epoch from now()) * 1000)::bigint - 22*86400000),
  ('asset-seed-3', 'Router',           'SN-77002A', 'TPLINK-4410', 'A0:B1:C2:D3:E4:F5','',           '8658456343', (extract(epoch from now()) * 1000)::bigint - 14*86400000),
  ('asset-seed-4', 'Tablet',           'SN-19087K', 'IPAD-2201', '',                  '',            '',           (extract(epoch from now()) * 1000)::bigint - 5*86400000)
on conflict (id) do nothing;

insert into public.user_accounts (id, "userNumber", username, "loginAccount", mail, "phoneNumber", enabled, "createdAt", "updatedAt", "lastLoginAt")
values
  ('usr-seed-1', '10023841', 'Maria Santos',   'maria.santos@inspi.com.ph',   'maria.santos@inspi.com.ph',   '09171234567', true,  (extract(epoch from now()) * 1000)::bigint - 400*86400000, (extract(epoch from now()) * 1000)::bigint - 12*86400000, (extract(epoch from now()) * 1000)::bigint - 1*86400000),
  ('usr-seed-2', '10045210', 'Jun Dela Cruz',  'jun.delacruz@inspi.com.ph',   'jun.delacruz@inspi.com.ph',   '09189876543', true,  (extract(epoch from now()) * 1000)::bigint - 300*86400000, (extract(epoch from now()) * 1000)::bigint - 40*86400000, (extract(epoch from now()) * 1000)::bigint - 5*86400000),
  ('usr-seed-3', '10067732', 'Liza Bautista',  'liza.bautista@inspi.com.ph',  '',                            '',            false, (extract(epoch from now()) * 1000)::bigint - 200*86400000, (extract(epoch from now()) * 1000)::bigint - 200*86400000, null),
  ('usr-seed-4', '10088456', 'Rico Fernandez', 'rico.fernandez@inspi.com.ph', 'rico.fernandez@inspi.com.ph','09201112233', true,  (extract(epoch from now()) * 1000)::bigint - 90*86400000,  (extract(epoch from now()) * 1000)::bigint - 2*86400000,  (extract(epoch from now()) * 1000)::bigint - 2*86400000),
  ('usr-seed-5', '10091023', 'Company Admin',  'admin@inspi.com.ph',          'admin@inspi.com.ph',          '09175132562', true,  (extract(epoch from now()) * 1000)::bigint - 500*86400000, (extract(epoch from now()) * 1000)::bigint - 1*86400000,  (extract(epoch from now()) * 1000)::bigint)
on conflict (id) do nothing;

-- user_groups deliberately left empty — the original app didn't seed it either.
