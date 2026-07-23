-- ============================================================================
-- Diagnostic only — every query here is read-only (SELECT). Nothing is
-- changed. Run this in the SQL Editor and share the results before we add
-- a real foreign key from gadgets.serialNumber to inventory_assets.serialNumber
-- (the equivalent of warehouse_locations.warehouseId → warehouses.id).
--
-- Why this is needed first, not just "add the constraint": a foreign key
-- needs the *referenced* column (inventory_assets.serialNumber) to be
-- UNIQUE, and Postgres validates *existing* rows by default when the
-- constraint is added — either of those can fail outright on production
-- data that's had months of manual entry, CSV imports, etc. Better to
-- know the actual numbers first than have the migration fail (or worse,
-- silently start rejecting saves) once it's live.
-- ============================================================================

-- 1. Duplicate serial numbers in inventory_assets (blocks the UNIQUE
--    constraint the FK depends on — has to be zero rows before we proceed).
select "serialNumber", count(*) as how_many
from public.inventory_assets
where "serialNumber" is not null and "serialNumber" <> ''
group by "serialNumber"
having count(*) > 1
order by how_many desc;

-- 2. Gadgets whose serialNumber is set but doesn't exist anywhere in
--    inventory_assets — these are exactly what the app's own ⚠ catalog
--    badge already flags in the Manage table, just counted here instead
--    of eyeballed row by row. This is the number that would block a
--    *validated* FK (a NOT VALID one — see below — sidesteps this, but
--    these rows would still fail the day you try to VALIDATE it).
select count(*) as gadgets_with_unmatched_serial
from public.gadgets g
where g."serialNumber" is not null and g."serialNumber" <> ''
  and not exists (
    select 1 from public.inventory_assets a
    where a."serialNumber" = g."serialNumber"
  );

-- 3. How many gadgets have a *blank* serial number (empty string, not
--    NULL — both tables currently use '' as their "nothing entered"
--    default, see schema.sql). This matters because a FK only ever
--    skips its check for a true SQL NULL — an empty string is a real
--    value that would need a matching (also-empty) row in
--    inventory_assets to pass, which defeats the point. These would all
--    need converting from '' to NULL before the FK goes on, on both
--    tables, and the app's JS would need to start writing NULL instead
--    of '' for "no serial" going forward too.
select
  (select count(*) from public.gadgets where "serialNumber" = '') as gadgets_blank_serial,
  (select count(*) from public.inventory_assets where "serialNumber" = '') as inventory_assets_blank_serial;
