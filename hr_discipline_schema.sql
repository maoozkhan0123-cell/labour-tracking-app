-- ==========================================================
-- HR DISCIPLINE & CONDUCT CONTROL MODULE (SOP 3.7)
-- ==========================================================

-- 1. Policy Management
CREATE TABLE IF NOT EXISTS disciplinary_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version TEXT NOT NULL,
    effective_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    document_number TEXT DEFAULT 'SOP-3.7'
);

CREATE TABLE IF NOT EXISTS policy_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID REFERENCES disciplinary_policies(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
    signed_at TIMESTAMPTZ DEFAULT NOW(),
    signature_data TEXT, -- Can store digital name or base64 sign
    ip_address TEXT,
    UNIQUE(policy_id, worker_id)
);

-- 2. Incidents & Classification
CREATE TABLE IF NOT EXISTS disciplinary_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    incident_date TIMESTAMPTZ NOT NULL,
    category TEXT NOT NULL, -- 'attendance', 'safety', 'conduct', 'sop_failure', etc.
    severity TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'gross_misconduct')),
    description TEXT NOT NULL,
    documentation TEXT, -- Ref number / case number
    attachment_url TEXT, -- Shared link for image/video
    worker_explanation TEXT, -- Emp response
    worker_signature TEXT, -- Digital name signature
    signed_at TIMESTAMPTZ, -- Timestamp of signing
    status TEXT DEFAULT 'pending_investigation' CHECK (status IN ('pending_investigation', 'investigating', 'action_taken', 'closed', 'appealed', 'acknowledged')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Investigation Cases
CREATE TABLE IF NOT EXISTS investigation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES disciplinary_incidents(id) ON DELETE CASCADE,
    investigator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    evidence_urls TEXT[], -- Array of storage links
    witness_statements JSONB DEFAULT '[]',
    employee_response TEXT,
    findings TEXT,
    decision_summary TEXT,
    is_confidential BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Disciplinary Action Workflow (4-Step Engine)
CREATE TABLE IF NOT EXISTS disciplinary_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
    incident_id UUID REFERENCES disciplinary_incidents(id) ON DELETE CASCADE,
    action_step TEXT NOT NULL CHECK (action_step IN ('verbal_warning', 'written_warning', 'suspension', 'termination')),
    is_override BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    executive_approval_id UUID REFERENCES users(id), -- User who approved override
    issued_date TIMESTAMPTZ DEFAULT NOW(),
    expiry_date TIMESTAMPTZ, -- Warnings typically expire after 6-12 months
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked_on_appeal')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Appeals Workflow
CREATE TABLE IF NOT EXISTS appeal_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disciplinary_action_id UUID REFERENCES disciplinary_actions(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    submission_date TIMESTAMPTZ DEFAULT NOW(),
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'decision_issued', 'closed')),
    decision_summary TEXT,
    decision_date TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

-- ==========================================================
-- INDEXES & PERFORMANCE
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_disc_incidents_worker ON disciplinary_incidents(worker_id);
CREATE INDEX IF NOT EXISTS idx_disc_actions_worker ON disciplinary_actions(worker_id);
CREATE INDEX IF NOT EXISTS idx_policy_ack_worker ON policy_acknowledgments(worker_id);
CREATE INDEX IF NOT EXISTS idx_appeal_cases_action ON appeal_cases(disciplinary_action_id);

-- ==========================================================
-- SEED DATA (INITIAL POLICY)
-- ==========================================================
INSERT INTO disciplinary_policies (title, content, version, effective_date)
VALUES (
    'Disciplinary Standards for Employees',
    'This policy outlines the expectations for conduct, performance, and behavior at Babylon. It covers minor, major, and gross misconduct and the 4-step disciplinary process.',
    '1.0',
    CURRENT_DATE
) ON CONFLICT DO NOTHING;

-- ==========================================================
-- STORAGE POLICIES (for Attachments)
-- ==========================================================
-- 1. Create the bucket (Run this in Supabase Dashboard -> Storage if needed)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow anyone to view attachments
CREATE POLICY "Public Read Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'attachments' );

-- 3. Allow authenticated users (Managers) to upload
CREATE POLICY "Manager Upload Access" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'attachments' AND auth.role() = 'authenticated' );

-- 4. Allow managers to manage their own uploads
CREATE POLICY "Manager Manage Access" 
ON storage.objects FOR ALL 
USING ( bucket_id = 'attachments' AND auth.role() = 'authenticated' );
