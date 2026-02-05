-- Add 'is_pinned' column to manufacturing_orders table
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
