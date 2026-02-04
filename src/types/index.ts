export interface User {
    id: string;
    worker_id: string;
    username: string;
    name: string;
    role: 'manager' | 'employee';
    password?: string;
    hourly_rate: number;
    status?: 'offline' | 'present'; // Clocked status
    availability?: 'available' | 'break'; // Break status
    last_status_change?: string;
}

export interface ActivityLog {
    id: string;
    worker_id: string;
    event_type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end' | 'task_start' | 'task_stop' | 'task_pause' | 'task_resume' | 'task_complete';
    related_task_id?: string;
    description: string;
    details?: string;
    timestamp: string;
}

export interface Task {
    id: string;
    description: string;
    mo_reference: string;
    assigned_to_id: string;
    status: string;
    hourly_rate: number;
    active_seconds: number;
    break_seconds: number;
    total_duration_seconds: number;
    start_time: string | null;
    last_action_time: string | null;
    end_time: string | null;
    created_at: string;
    manual: boolean;
    reason?: string;
}

export interface ManufacturingOrder {
    id: string;
    name: string;
    product: string;
    status: string;
    dates: string;
    created_at: string;
}

export interface Operation {
    id: number;
    name: string;
    description: string;
    sort_order: number;
}
