-- ==========================================================
-- SUPABASE SCHEMA FOR BABYLON LABOR TRACKER
-- ==========================================================

-- 1. Users table (Stores Managers and Workers)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id TEXT UNIQUE, -- Unique Worker ID (e.g., W-101)
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee',
    name TEXT NOT NULL,
    hourly_rate NUMERIC DEFAULT 0.0
);

-- 2. Manufacturing Orders (MO) table
-- Updated to match user requirements
CREATE TABLE IF NOT EXISTS manufacturing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mo_number TEXT UNIQUE NOT NULL, -- Was 'name'
    quantity INTEGER DEFAULT 0,
    po_number TEXT,
    product_name TEXT, -- Was 'product'
    sku TEXT,
    event_id TEXT,
    scheduled_date DATE, -- Was 'dates'
    current_status TEXT DEFAULT 'draf', -- Was 'status' ('Packed', 'Draft', etc)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Operations table (Predefined tasks like 'Packing', 'Weighing')
CREATE TABLE IF NOT EXISTS operations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0
);

-- 4. Tasks table (Active and Completed work records)
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT,
    mo_reference TEXT, -- References manufacturing_orders.mo_number
    assigned_to_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    hourly_rate NUMERIC DEFAULT 0.0,
    active_seconds INTEGER DEFAULT 0,
    break_seconds INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    start_time TIMESTAMPTZ,
    last_action_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    manual BOOLEAN DEFAULT FALSE,
    reason TEXT
);

-- 5. Breaks table (To track when workers are on break)
CREATE TABLE IF NOT EXISTS breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ
);

-- 6. Settings table (Internal app settings)
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL
);

-- ==========================================================
-- MIGRATION / UPDATE SECTION
-- ==========================================================

-- MIGRATION FOR MO TABLE CHANGES
-- Rename 'name' to 'mo_number' if exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manufacturing_orders' AND column_name='name') THEN
        ALTER TABLE manufacturing_orders RENAME COLUMN name TO mo_number;
    END IF;
END $$;

-- Rename 'product' to 'product_name' if exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manufacturing_orders' AND column_name='product') THEN
        ALTER TABLE manufacturing_orders RENAME COLUMN product TO product_name;
    END IF;
END $$;

-- Rename 'status' to 'current_status' if exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manufacturing_orders' AND column_name='status') THEN
        ALTER TABLE manufacturing_orders RENAME COLUMN status TO current_status;
    END IF;
END $$;

-- Add new columns
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0;
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Ensure worker_id exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS worker_id TEXT UNIQUE;

-- Ensure operations have descriptions and sort_order
ALTER TABLE operations ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operations' AND column_name='desc') THEN
        ALTER TABLE operations RENAME COLUMN "desc" TO description;
    END IF;
END $$;
