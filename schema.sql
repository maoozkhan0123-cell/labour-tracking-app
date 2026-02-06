-- ==========================================================
-- CONSOLIDATED SUPABASE SCHEMA FOR BABYLON LABOR TRACKER
-- ==========================================================

-- 1. USERS TABLE
-- Stores Managers and Workers
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id TEXT UNIQUE, -- Unique Worker ID (e.g., W-101)
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee',
    name TEXT NOT NULL,
    hourly_rate NUMERIC DEFAULT 0.0,
    active BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'offline', -- 'offline' (absent), 'present' (clocked_in)
    availability TEXT DEFAULT 'available', -- 'available', 'break' (away)
    last_status_change TIMESTAMPTZ DEFAULT NOW()
);

-- 2. MANUFACTURING ORDERS TABLE
-- Tracks production orders
CREATE TABLE IF NOT EXISTS manufacturing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mo_number TEXT UNIQUE NOT NULL,
    quantity INTEGER DEFAULT 0,
    po_number TEXT,
    product_name TEXT,
    sku TEXT,
    event_id TEXT,
    scheduled_date DATE,
    current_status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_pinned BOOLEAN DEFAULT FALSE,
    sort_order BIGINT DEFAULT 0
);

-- 3. OPERATIONS TABLE
-- Predefined tasks like 'Packing', 'Weighing'
CREATE TABLE IF NOT EXISTS operations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0
);

-- 4. TASKS TABLE
-- Active and Completed work records
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

-- 5. BREAKS TABLE
-- Tracks when workers are on break
CREATE TABLE IF NOT EXISTS breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ
);

-- 6. SETTINGS TABLE
-- Internal app settings
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL
);

-- 7. ACTIVITY LOGS TABLE
-- Detailed timeline of worker activity
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'clock_in', 'clock_out', 'break_start', 'break_end', 'task_start', 'task_stop', 'task_pause', 'task_resume', 'task_complete'
    related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    description TEXT,
    details TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- INDEXES FOR PERFORMANCE
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_activity_logs_worker ON activity_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_sort_order ON manufacturing_orders(sort_order);
