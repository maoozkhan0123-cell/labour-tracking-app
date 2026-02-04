-- Add status tracking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline'; -- 'offline' (absent), 'present' (clocked_in)
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT 'available'; -- 'available', 'break' (away)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMPTZ DEFAULT NOW();

-- Create a dedicated table for detailed activity logs (Timeline)
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'clock_in', 'clock_out', 'break_start', 'break_end', 'task_start', 'task_stop', 'task_pause', 'task_resume', 'task_complete'
    related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL, -- Optional, for task events
    description TEXT, -- Readable description (e.g. "MO#1 Staging")
    details TEXT, -- Extra info like pause reason
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- OPTIONAL: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_worker ON activity_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);
