-- Add sort_order column to manufacturing_orders table
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS sort_order SERIAL; -- Use SERIAL to auto-increment for defaults, or just BIGINT

-- Or just integers. Let's use FLOAT for easy insertion between items, or just INT and re-index. 
-- Simple INT is easier for "move to index". 
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS sort_order BIGINT DEFAULT 0;
