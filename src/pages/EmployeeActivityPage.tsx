import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const EmployeeActivityPage: React.FC = () => {
    const [summaries, setSummaries] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // Update every 10s
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const { data: users } = await supabase.from('users').select('*').eq('role', 'employee').order('name', { ascending: true }) as { data: any[] };
            const { data: tasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }) as { data: any[] };

            if (users && tasks) {
                const results = users.map(user => {
                    const userTasks = tasks.filter((t: any) => t.assigned_to_id === user.id);
                    const active_sec = userTasks.reduce((acc, t: any) => acc + (t.active_seconds || 0), 0);
                    const break_sec = userTasks.reduce((acc, t: any) => acc + (t.break_seconds || 0), 0);
                    const total_earned = (active_sec / 3600) * (user.hourly_rate || 0);

                    let status = 'Idle';
                    if (userTasks.some((t: any) => t.status === 'active')) status = 'Working';
                    else if (userTasks.some((t: any) => t.status === 'break')) status = 'On Break';

                    return {
                        id: user.id,
                        name: user.name,
                        status,
                        active_sec,
                        break_sec,
                        total_earned,
                        tasks: userTasks
                    };
                });
                setSummaries(results);
            }
        } catch (err) {
            console.error('Error fetching activity:', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <div className="loading-screen">Loading Activity...</div>;

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Employee Activity</h1>
                <p className="page-subtitle">Real-time monitoring of worker tasks</p>
            </div>

            <div className="section-card">
                <div className="section-header">
                    <h2 className="section-title">Current Status</h2>
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
                                    <SummaryStat label="DAILY ACTIVE" value={`${(emp.active_sec / 3600).toFixed(1)} hrs`} color="var(--success)" />
                                    <SummaryStat label="DAILY BREAK" value={`${(emp.break_sec / 3600).toFixed(1)} hrs`} color="#B45309" />
                                    <SummaryStat label="TOTAL HOURS" value={`${((emp.active_sec + emp.break_sec) / 3600).toFixed(1)} hrs`} color="var(--text-main)" />
                                    <SummaryStat label="EARNED" value={`$${emp.total_earned.toFixed(2)}`} color="var(--primary)" />
                                </div>

                                <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Task History</h4>
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
                                        <div style={{ textAlign: 'center', padding: '1rem', color: '#94A3B8', fontSize: '0.9rem', fontStyle: 'italic' }}>No task history found.</div>
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
