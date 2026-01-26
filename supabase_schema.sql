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
CREATE TABLE IF NOT EXISTS manufacturing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    product TEXT,
    status TEXT DEFAULT 'draft',
    dates TEXT,
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
    mo_reference TEXT,
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
-- Run these if you already created tables previously but are missing columns
-- ==========================================================

-- Add worker_id to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS worker_id TEXT UNIQUE;

-- Add sort_order to operations if missing
ALTER TABLE operations ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add description to operations if missing (renaming from 'desc')
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operations' AND column_name='desc') THEN
        ALTER TABLE operations RENAME COLUMN "desc" TO description;
    END IF;
END $$;

-- Ensure task times use TIMESTAMPTZ
ALTER TABLE tasks ALTER COLUMN start_time TYPE TIMESTAMPTZ;
ALTER TABLE tasks ALTER COLUMN last_action_time TYPE TIMESTAMPTZ;
ALTER TABLE tasks ALTER COLUMN end_time TYPE TIMESTAMPTZ;
ALTER TABLE tasks ALTER COLUMN created_at TYPE TIMESTAMPTZ;

-- ==========================================================
-- INITIAL DATA (Optional)
-- ==========================================================
-- INSERT INTO users (username, worker_id, password, role, name, hourly_rate) 
-- VALUES ('admin', 'M-001', '123', 'manager', 'Main Manager', 0.0);
