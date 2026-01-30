import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export const EmployeeActivityPage: React.FC = () => {
    const [rawUsers, setRawUsers] = useState<any[]>([]);
    const [rawTasks, setRawTasks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
    const [filter, setFilter] = useState('Today');

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // Update every 10s
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const { data: users } = await supabase.from('users').select('*').eq('role', 'employee').order('name', { ascending: true }) as { data: any[] };
            const { data: tasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }) as { data: any[] };

            if (users) setRawUsers(users);
            if (tasks) setRawTasks(tasks);
        } catch (err) {
            console.error('Error fetching activity:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const summaries = useMemo(() => {
        if (!rawUsers.length) return [];

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let rangeStart: Date | null = null;
        let rangeEnd: Date | null = null;

        if (filter === 'Today') {
            rangeStart = todayStart;
        } else if (filter === 'This Week') {
            const day = todayStart.getDay();
            const diff = todayStart.getDate() - day; // Sunday start
            rangeStart = new Date(todayStart);
            rangeStart.setDate(diff);
        } else if (filter === 'Last Week') {
            const day = todayStart.getDay();
            const diff = todayStart.getDate() - day - 7;
            rangeStart = new Date(todayStart);
            rangeStart.setDate(diff);
            rangeEnd = new Date(rangeStart);
            rangeEnd.setDate(rangeStart.getDate() + 7); // End of last week
        } else if (filter === 'This Month') {
            rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (filter === 'Last Month') {
            rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            rangeEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of last month
        }

        return rawUsers.map(user => {
            // Filter tasks for this user AND the time range
            const userTasks = rawTasks.filter((t: any) => {
                if (t.assigned_to_id !== user.id) return false;

                const taskDate = new Date(t.start_time || t.created_at);
                if (rangeStart && taskDate < rangeStart) return false;
                if (rangeEnd && taskDate > rangeEnd) return false;
                return true;
            });

            // Calculate stats for filtered tasks
            const active_sec = userTasks.reduce((acc, t: any) => acc + (t.active_seconds || 0), 0);
            const break_sec = userTasks.reduce((acc, t: any) => acc + (t.break_seconds || 0), 0);
            const total_earned = (active_sec / 3600) * (user.hourly_rate || 0);

            // Determine current status (real-time, mainly checks most recent task's status regardless of filter?)
            // Actually, if we filter by "Last Week", the current status might show "Idle" if they did nothing last week, which is technically correct for that view?
            // "Current Status" usually implies RIGHT NOW.
            // But the list is being used to show historical data too.
            // Let's check the UNFILTERED most recent task for status to be accurate about "Current Status".

            const allUserTasks = rawTasks.filter((t: any) => t.assigned_to_id === user.id);
            let status = 'Idle';
            // Check active tasks in ALL history to determine Real-Time status
            if (allUserTasks.some((t: any) => t.status === 'active')) status = 'Working';
            else if (allUserTasks.some((t: any) => t.status === 'break')) status = 'On Break';

            return {
                id: user.id,
                name: user.name,
                status,
                active_sec,
                break_sec,
                total_earned,
                tasks: userTasks // Show only filtered tasks in history list
            };
        });
    }, [rawUsers, rawTasks, filter]);

    if (isLoading) return <div className="loading-screen">Loading Activity...</div>;

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title">Employee Activity</h1>
                    <p className="page-subtitle">Monitoring worker tasks: {filter}</p>
                </div>

                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{
                        padding: '0.6rem 1rem', borderRadius: '8px',
                        border: '1.5px solid #CBD5E1', background: 'white',
                        fontWeight: 600, color: '#334155', cursor: 'pointer',
                        outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                >
                    <option value="Today">Today</option>
                    <option value="This Week">This Week</option>
                    <option value="Last Week">Last Week</option>
                    <option value="This Month">This Month</option>
                    <option value="Last Month">Last Month</option>
                    <option value="All Time">All Time</option>
                </select>
            </div>

            <div className="section-card">
                <div className="section-header">
                    <h2 className="section-title">Worker Stats ({filter})</h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {summaries.map(emp => (
                        <div
                            key={emp.id}
                            className={`list-item ${expandedEmpId === emp.id ? 'expanded' : ''}`}
                            style={{ cursor: 'pointer', flexDirection: 'column', alignItems: 'stretch', background: '#F9FAFB', padding: '1rem', borderRadius: '8px', border: '1px solid transparent', transition: 'all 0.2s' }}
                            onClick={() => setExpandedEmpId(expandedEmpId === emp.id ? null : emp.id)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <div className="item-main">
                                    <span className={`status-dot dot-${emp.status === 'Working' ? 'green' : emp.status === 'On Break' ? 'yellow' : 'gray'}`}></span>
                                    <div>
                                        <div className="item-title">{emp.name}</div>
                                        <div className="item-sub" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{emp.status}</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                        {emp.status === 'Working' ? (
                                            <span style={{ color: 'var(--success)' }}><i className="fa-solid fa-bolt"></i> Active</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Details section */}
                            <div style={{ display: expandedEmpId === emp.id ? 'block' : 'none', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', animation: 'slideDown 0.2s ease-out' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                                    <SummaryStat label="ACTIVE TIME" value={`${(emp.active_sec / 3600).toFixed(1)} hrs`} color="var(--success)" />
                                    <SummaryStat label="BREAK TIME" value={`${(emp.break_sec / 3600).toFixed(1)} hrs`} color="#B45309" />
                                    <SummaryStat label="TOTAL HOURS" value={`${((emp.active_sec + emp.break_sec) / 3600).toFixed(1)} hrs`} color="var(--text-main)" />
                                    <SummaryStat label="EARNED" value={`$${emp.total_earned.toFixed(2)}`} color="var(--primary)" />
                                </div>

                                <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Task History ({filter})</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {emp.tasks.length > 0 ? (
                                        emp.tasks.map((task: any) => (
                                            <div key={task.id} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span className={`status-dot dot-${task.status}`}></span>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{task.description}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{task.mo_reference}</div>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{Math.floor(task.active_seconds / 60)}m active</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'capitalize' }}>{task.status}</div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '1rem', color: '#94A3B8', fontSize: '0.9rem', fontStyle: 'italic' }}>No task history in this period.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {/* Inline keyframe for the slideDown animation as defined in HTML */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes slideDown { 
                    from { opacity: 0; transform: translateY(-10px); } 
                    to { opacity: 1; transform: translateY(0); } 
                }
            `}} />
        </>
    );
};

const SummaryStat: React.FC<{ label: string, value: string, color: string }> = ({ label, value, color }) => (
    <div style={{ background: 'white', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
        <div style={{ fontWeight: 700, color, marginTop: '2px', fontSize: '0.9rem' }}>{value}</div>
    </div>
);
