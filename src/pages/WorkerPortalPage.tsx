import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logActivity, updateUserStatus } from '../lib/activityLogger';
import { completeAllTasks } from '../lib/taskService';
import { Navigate } from 'react-router-dom';

export const WorkerPortalPage: React.FC = () => {
    const { user, loading: authLoading, logout } = useAuth();
    const [localUser, setLocalUser] = useState(user);
    const [loading, setLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        if (!authLoading && user) {
            setLocalUser(user);
        }
    }, [user, authLoading]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const [activeTasks, setActiveTasks] = useState<any[]>([]);

    useEffect(() => {
        if (user) {
            fetchUserStatus();
            fetchActiveTasks();
            // Subscribe to user changes
            const userChannel = supabase
                .channel(`public:users:id=eq.${user.id}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, (payload) => {
                    setLocalUser(payload.new as any);
                })
                .subscribe();

            // Subscribe to task changes
            const taskChannel = supabase
                .channel(`public:tasks:assigned_to_id=eq.${user.id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to_id=eq.${user.id}` }, () => {
                    fetchActiveTasks();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(userChannel);
                supabase.removeChannel(taskChannel);
            };
        }
    }, [user]);

    const fetchUserStatus = async () => {
        if (!user) return;
        const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
        if (data) setLocalUser(data);
    };

    const fetchActiveTasks = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('tasks')
            .select('*')
            .eq('assigned_to_id', user.id)
            .neq('status', 'completed');
        if (data) setActiveTasks(data);
    };

    if (authLoading) return <div className="loading-screen">Authenticating...</div>;
    if (!user) return <Navigate to="/login" replace />;

    const handleClockIn = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await updateUserStatus(user.id, 'present', 'available');
            await logActivity(user.id, 'clock_in', 'Worker clocked in via portal');
            await fetchUserStatus();
        } catch (err) {
            console.error(err);
            alert('Failed to clock in');
        } finally {
            setLoading(false);
        }
    };

    const handleClockOut = async () => {
        if (!user) return;
        const confirmMsg = "Are you sure you want to clock out? All active tasks will be marked as completed.";
        if (!window.confirm(confirmMsg)) return;

        setLoading(true);
        try {
            await completeAllTasks(user.id);
            await updateUserStatus(user.id, 'offline', 'available');
            await logActivity(user.id, 'clock_out', 'Worker clocked out via portal');
            await fetchUserStatus();
        } catch (err) {
            console.error(err);
            alert('Failed to clock out');
        } finally {
            setLoading(false);
        }
    };

    const isClockedIn = localUser?.status === 'present';

    if (!user) return null;

    return (
        <div className="worker-portal-wrapper">
            <style dangerouslySetInnerHTML={{
                __html: `
                .worker-portal-wrapper {
                    min-height: 100vh;
                    background: #F8FAFC;
                    padding: 2rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    font-family: 'Inter', sans-serif;
                }

                .portal-container {
                    width: 100%;
                    max-width: 600px;
                    background: white;
                    border-radius: 24px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
                    overflow: hidden;
                    border: 1px solid #E2E8F0;
                }

                .portal-header {
                    background: #1E293B;
                    padding: 2.5rem 2rem;
                    color: white;
                    text-align: center;
                    position: relative;
                }

                .portal-header h1 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin: 0;
                    letter-spacing: -0.025em;
                }

                .portal-header p {
                    opacity: 0.7;
                    font-size: 0.9rem;
                    margin-top: 0.5rem;
                }

                .logout-btn-top {
                    position: absolute;
                    right: 1.5rem;
                    top: 1.5rem;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    color: white;
                    padding: 0.5rem;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .logout-btn-top:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .portal-content {
                    padding: 2.5rem 2rem;
                }

                .status-card {
                    background: #F1F5F9;
                    border-radius: 16px;
                    padding: 2rem;
                    text-align: center;
                    margin-bottom: 2rem;
                    border: 1px solid #E2E8F0;
                }

                .status-label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #64748B;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 0.5rem;
                }

                .status-value {
                    font-size: 2rem;
                    font-weight: 800;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.75rem;
                }

                .status-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                }

                .status-present { color: #10B981; }
                .status-offline { color: #94A3B8; }
                .dot-present { background: #10B981; box-shadow: 0 0 10px #10B981; }
                .dot-offline { background: #94A3B8; }

                .time-display {
                    font-size: 1.25rem;
                    font-weight: 600;
                    color: #1E293B;
                    margin-top: 1rem;
                    font-family: 'JetBrains Mono', monospace;
                }

                .action-buttons {
                    display: grid;
                    gap: 1rem;
                }

                .clock-btn {
                    padding: 1.25rem;
                    border-radius: 16px;
                    font-size: 1.1rem;
                    font-weight: 700;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.75rem;
                }

                .clock-in-btn {
                    background: #10B981;
                    color: white;
                    box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.39);
                }

                .clock-in-btn:hover:not(:disabled) {
                    background: #059669;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.23);
                }

                .clock-out-btn {
                    background: #EF4444;
                    color: white;
                    box-shadow: 0 4px 14px 0 rgba(239, 68, 68, 0.39);
                }

                .clock-out-btn:hover:not(:disabled) {
                    background: #DC2626;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(239, 68, 68, 0.23);
                }

                .clock-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none !important;
                }

                .worker-info {
                    margin-top: 2.5rem;
                    padding-top: 2rem;
                    border-top: 1px solid #E2E8F0;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .worker-avatar {
                    width: 50px;
                    height: 50px;
                    background: #1E293B;
                    color: white;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 1.25rem;
                }

                .worker-details h3 {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 700;
                    color: #1E293B;
                }

                .worker-details p {
                    margin: 0;
                    font-size: 0.85rem;
                    color: #64748B;
                }

                .active-tasks-section {
                    margin-top: 2rem;
                }

                .task-card {
                    background: white;
                    border: 1px solid #E2E8F0;
                    border-radius: 12px;
                    padding: 1rem;
                    margin-bottom: 0.75rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: border-color 0.2s;
                }

                .task-card:hover { border-color: #CBD5E1; }

                .task-info h4 {
                    margin: 0;
                    font-size: 0.95rem;
                    color: #1E293B;
                }

                .task-info p {
                    margin: 0;
                    font-size: 0.8rem;
                    color: #64748B;
                }

                .task-status-badge {
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 0.25rem 0.5rem;
                    border-radius: 6px;
                    text-transform: uppercase;
                }

                .badge-active { background: #DCFCE7; color: #16A34A; }
                .badge-pending { background: #F1F5F9; color: #475569; }
                .badge-paused { background: #FEF3C7; color: #D97706; }
                .badge-break { background: #FEE2E2; color: #DC2626; }

                @media (max-width: 640px) {
                    .worker-portal-wrapper {
                        padding: 1rem;
                    }
                }
            ` }} />

            <div className="portal-container">
                <div className="portal-header">
                    <button className="logout-btn-top" onClick={logout} title="Logout">
                        <i className="fa-solid fa-arrow-right-from-bracket"></i>
                    </button>
                    <h1>Worker Portal</h1>
                    <p>Babylon Labour Tracking System</p>
                </div>

                <div className="portal-content">
                    <div className="status-card">
                        <div className="status-label">Current Status</div>
                        <div className={`status-value ${isClockedIn ? 'status-present' : 'status-offline'}`}>
                            <div className={`status-dot ${isClockedIn ? 'dot-present' : 'dot-offline'}`}></div>
                            {isClockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}
                        </div>
                        <div className="time-display">
                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                    </div>

                    <div className="action-buttons">
                        {!isClockedIn ? (
                            <button
                                className="clock-btn clock-in-btn"
                                onClick={handleClockIn}
                                disabled={loading}
                            >
                                <i className="fa-solid fa-play"></i>
                                {loading ? 'Processing...' : 'Clock In Now'}
                            </button>
                        ) : (
                            <button
                                className="clock-btn clock-out-btn"
                                onClick={handleClockOut}
                                disabled={loading}
                            >
                                <i className="fa-solid fa-stop"></i>
                                {loading ? 'Processing...' : 'Clock Out Now'}
                            </button>
                        )}
                    </div>

                    {isClockedIn && (
                        <div className="active-tasks-section">
                            <div className="status-label" style={{ marginBottom: '1rem' }}>Active Assignments</div>
                            {activeTasks.length > 0 ? (
                                activeTasks.map(task => (
                                    <div key={task.id} className="task-card">
                                        <div className="task-info">
                                            <h4>{task.description}</h4>
                                            <p>MO: {task.mo_reference}</p>
                                        </div>
                                        <div className={`task-status-badge badge-${task.status}`}>
                                            {task.status.replace('_', ' ')}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94A3B8', fontSize: '0.9rem', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #E2E8F0' }}>
                                    No active assignments currently.
                                </div>
                            )}
                        </div>
                    )}

                    <div className="worker-info" style={{ marginTop: isClockedIn ? '2.5rem' : '4rem' }}>
                        <div className="worker-avatar">
                            {user.name?.[0]}
                        </div>
                        <div className="worker-details">
                            <h3>{user.name}</h3>
                            <p>Worker ID: {user.worker_id || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
