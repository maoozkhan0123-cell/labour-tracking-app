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
    const [activeTasks, setActiveTasks] = useState<any[]>([]);
    const [disciplinaryIncidents, setDisciplinaryIncidents] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'personal_info' | 'conduct' | 'settings' | 'documentation'>('dashboard');
    const [signingData, setSigningData] = useState<{ [key: string]: { explanation: string, signature: string } }>({});
    const [nfcStatus, setNfcStatus] = useState<'idle' | 'listening' | 'reading' | 'error'>('idle');

    const handleSignIncident = async (incidentId: string) => {
        const data = signingData[incidentId];
        if (!data?.signature) {
            alert('Please provide your name as a signature.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await (supabase as any)
                .from('disciplinary_incidents')
                .update({
                    worker_explanation: data.explanation,
                    worker_signature: data.signature,
                    signed_at: new Date().toISOString(),
                    status: 'acknowledged'
                })
                .eq('id', incidentId);

            if (error) throw error;
            alert('Response recorded and incident signed.');
            fetchDisciplinaryIncidents();
        } catch (err) {
            console.error(err);
            alert('Failed to sign incident');
        } finally {
            setLoading(false);
        }
    };

    const updateSigningLocal = (incidentId: string, field: 'explanation' | 'signature', value: string) => {
        setSigningData(prev => ({
            ...prev,
            [incidentId]: {
                ...(prev[incidentId] || { explanation: '', signature: '' }),
                [field]: value
            }
        }));
    };
    const [notification, setNotification] = useState<{ show: boolean, message: string, severity: string } | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({
        name: user?.name || '',
        phone: (user as any)?.phone || '',
        email: (user as any)?.email || '',
        address: (user as any)?.address || '',
    });

    useEffect(() => {
        if (!authLoading && user) {
            setLocalUser(user);
            setFormData({
                name: user.name || '',
                phone: (user as any).phone || '',
                email: (user as any).email || '',
                address: (user as any).address || '',
            });
        }
    }, [user, authLoading]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleSaveProfile = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { error } = await (supabase as any)
                .from('users')
                .update({
                    name: formData.name,
                    phone: formData.phone,
                    email: formData.email,
                    address: formData.address
                })
                .eq('id', user.id);

            if (error) throw error;

            const updatedUser = { ...user, ...formData };
            localStorage.setItem('bt_user', JSON.stringify(updatedUser));
            setLocalUser(updatedUser as any);
            setEditMode(false);
            alert('Profile updated successfully!');
        } catch (err) {
            console.error(err);
            alert('Failed to update personal details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchUserStatus();
            fetchActiveTasks();
            fetchDisciplinaryIncidents();

            // Initialize NFC Listening
            if ('NDEFReader' in window) {
                startNfcListening();
            } else {
                setNfcStatus('error');
                console.warn('Web NFC is not supported on this browser/device.');
            }

            const userChannel = supabase
                .channel(`public:users:id=eq.${user.id}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, (payload) => {
                    setLocalUser(payload.new as any);
                })
                .subscribe();

            const taskChannel = supabase
                .channel(`public:tasks:assigned_to_id=eq.${user.id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to_id=eq.${user.id}` }, () => {
                    fetchActiveTasks();
                })
                .subscribe();

            const disciplineChannel = supabase
                .channel(`public:disciplinary_incidents:worker_id=eq.${user.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'disciplinary_incidents', filter: `worker_id=eq.${user.id}` }, (payload) => {
                    fetchDisciplinaryIncidents();
                    setNotification({
                        show: true,
                        message: `New Notice: A ${payload.new.category} incident has been recorded.`,
                        severity: payload.new.severity
                    });
                    setTimeout(() => setNotification(null), 8000);
                })
                .subscribe();

            return () => {
                supabase.removeChannel(userChannel);
                supabase.removeChannel(taskChannel);
                supabase.removeChannel(disciplineChannel);
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

    const fetchDisciplinaryIncidents = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('disciplinary_incidents')
                .select('*, actions:disciplinary_actions(*)')
                .eq('worker_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setDisciplinaryIncidents(data);
        } catch (err) {
            console.error('Error fetching disciplinary incidents:', err);
        }
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
        if (!window.confirm("Are you sure you want to clock out? All active tasks will be marked as completed.")) return;

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

    const startNfcListening = async () => {
        try {
            const reader = new (window as any).NDEFReader();
            await reader.scan();
            setNfcStatus('listening');

            reader.addEventListener("reading", async ({ serialNumber }: any) => {
                setNfcStatus('reading');
                await processNfcTap(serialNumber);
                // Reset to listening after a delay
                setTimeout(() => setNfcStatus('listening'), 3000);
            });

            reader.addEventListener("readingerror", () => {
                setNfcStatus('error');
                setTimeout(() => setNfcStatus('listening'), 3000);
            });

        } catch (error) {
            console.error("NFC Error:", error);
            setNfcStatus('error');
        }
    };

    const processNfcTap = async (tagId: string) => {
        try {
            // Find worker by NFC ID
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('nfc_id', tagId)
                .single();

            const worker = data as any;

            if (error || !worker) {
                setNotification({
                    show: true,
                    message: "NFC Tag not recognized. Please register this card in the Admin Portal.",
                    severity: 'warning'
                });
                setTimeout(() => setNotification(null), 5000);
                return;
            }

            const isCurrentlyIn = worker.status === 'present';
            const action = isCurrentlyIn ? 'clock_out' : 'clock_in';
            const newStatus = isCurrentlyIn ? 'offline' : 'present';

            // Confirm clock out if they have tasks (only if it's the current user, otherwise auto-clock-out)
            // For a "Terminal" feel, we auto-clock out.
            if (isCurrentlyIn) {
                await completeAllTasks(worker.id);
            }

            await updateUserStatus(worker.id, newStatus, 'available');
            await logActivity(worker.id, action, `Worker ${action} via NFC Tap`);

            // Audio feedback (optional, but requested "beep")
            try {
                const audioCtx = new (window as any).AudioContext();
                const osc = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(isCurrentlyIn ? 440 : 880, audioCtx.currentTime);
                osc.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.1);
            } catch (e) { /* audio failed */ }

            setNotification({
                show: true,
                message: `${isCurrentlyIn ? 'Goodbye' : 'Welcome'}, ${worker.name}! You are now ${isCurrentlyIn ? 'Clocked Out' : 'Clocked In'}.`,
                severity: 'success'
            });
            setTimeout(() => setNotification(null), 5000);

            // If the tapped worker is the SAME as the logged in user, refresh local state
            if (user && worker.id === user.id) {
                fetchUserStatus();
            }

        } catch (err) {
            console.error("Error processing NFC tap:", err);
            setNotification({
                show: true,
                message: "System error processing NFC tap.",
                severity: 'error'
            });
        }
    };

    const isClockedIn = localUser?.status === 'present';

    return (
        <div className="worker-portal-layout">
            <style dangerouslySetInnerHTML={{
                __html: `
                .worker-portal-layout {
                    display: flex;
                    min-height: 100vh;
                    background: #F4F7FE;
                    font-family: 'Inter', sans-serif;
                    color: #1E293B;
                }

                .worker-sidebar {
                    width: 280px;
                    background: #262661;
                    color: white;
                    display: flex;
                    flex-direction: column;
                    padding: 2.5rem 1.5rem;
                    border-right: 1px solid rgba(255,255,255,0.05);
                    flex-shrink: 0;
                    position: sticky;
                    top: 0;
                    height: 100vh;
                }

                .sidebar-brand {
                    display: flex;
                    align-items: center;
                    gap: 0.85rem;
                    margin-bottom: 3.5rem;
                    padding: 0 0.5rem;
                }

                .sidebar-logo {
                    width: 32px;
                    height: 32px;
                    background: #EDAD2F;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #262661;
                    font-weight: 900;
                    font-size: 1.25rem;
                }

                .sidebar-nav {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    flex: 1;
                }

                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1.15rem 1.5rem;
                    border-radius: 14px;
                    color: rgba(255, 255, 255, 0.6);
                    font-weight: 600;
                    text-decoration: none;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 1px solid transparent;
                }

                .nav-item:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: white;
                }

                .nav-item.active {
                    background: #EDAD2F;
                    color: #262661;
                    box-shadow: 0 4px 15px rgba(237, 173, 47, 0.25);
                    border-color: #EDAD2F;
                }

                .nav-item i {
                    width: 20px;
                    text-align: center;
                    font-size: 1.2rem;
                }

                .sidebar-footer {
                    margin-top: auto;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    padding-top: 2rem;
                }

                .worker-main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: #F4F7FE;
                }

                .worker-topbar {
                    height: 90px;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 3rem;
                    border-bottom: 1px solid #E2E8F0;
                }

                .worker-content {
                    padding: 3rem;
                    max-width: 1100px;
                    width: 100%;
                    margin: 0 auto;
                }

                .notification-popup {
                    position: fixed;
                    top: 2rem;
                    right: 2rem;
                    background: white;
                    color: #262661;
                    padding: 1.5rem 2rem;
                    border-radius: 20px;
                    box-shadow: 0 25px 50px -12px rgba(38, 38, 97, 0.25);
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                    z-index: 100000;
                    animation: slideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    border-left: 6px solid #ef4444;
                    max-width: 450px;
                }

                @keyframes slideIn {
                    from { transform: translateX(120%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                .status-card, .profile-section, .conduct-section {
                    background: white;
                    border-radius: 24px;
                    padding: 2.5rem;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
                    border: 1px solid #E2E8F0;
                    margin-bottom: 2rem;
                }

                .status-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #64748B;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 1rem;
                }

                .status-value {
                    font-size: 2.5rem;
                    font-weight: 900;
                    display: flex;
                    align-items: center;
                    gap: 1.25rem;
                    margin-bottom: 0.5rem;
                }

                .status-dot {
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                }

                .status-present { color: #10B981; }
                .status-offline { color: #94A3B8; }
                .dot-present { background: #10B981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.5); }
                .dot-offline { background: #94A3B8; }

                .time-display {
                    font-size: 1.75rem;
                    font-weight: 800;
                    color: #262661;
                    font-family: 'JetBrains Mono', monospace;
                }

                .clock-btn {
                    padding: 1.5rem;
                    border-radius: 18px;
                    font-size: 1.15rem;
                    font-weight: 800;
                    border: none;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.8rem;
                    width: 100%;
                }

                .clock-in-btn { background: #10B981; color: white; }
                .clock-out-btn { background: #EF4444; color: white; }

                .worker-avatar {
                    width: 48px;
                    height: 48px;
                    background: #262661;
                    color: #EDAD2F;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 900;
                }

                .pilled-badge {
                    padding: 0.35rem 0.85rem;
                    border-radius: 999px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    letter-spacing: 0.02em;
                }

                .form-group {
                    margin-bottom: 1.5rem;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 0.6rem;
                    font-weight: 700;
                    color: #262661;
                }

                .form-group input, .form-group textarea {
                    width: 100%;
                    padding: 1rem 1.25rem;
                    border-radius: 14px;
                    border: 1.5px solid #E2E8F0;
                    background: #F8FAFC;
                    font-size: 1rem;
                    transition: all 0.2s;
                }

                .form-group input:focus {
                    border-color: #EDAD2F;
                    background: white;
                    outline: none;
                }

                .nfc-heartbeat {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: #10B981;
                    display: inline-block;
                    margin-right: 8px;
                    animation: heartbeat 1.5s ease-in-out infinite;
                }

                @keyframes heartbeat {
                    0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                    70% { transform: scale(1.3); opacity: 0.5; box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                    100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }

                .nfc-status-bar {
                    background: #F8FAFC;
                    border: 1px solid #E2E8F0;
                    border-radius: 12px;
                    padding: 0.75rem 1.25rem;
                    display: flex;
                    align-items: center;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #64748B;
                    margin-bottom: 2rem;
                }

                .nfc-status-error { color: #EF4444; border-color: #FEE2E2; background: #FFF7ED; }
                .nfc-status-reading { color: #2563EB; border-color: #DBEAFE; background: #EFF6FF; }

                @media (max-width: 900px) {
                    .worker-sidebar { width: 80px; padding: 2.5rem 0.75rem; }
                    .sidebar-brand span, .nav-item span { display: none; }
                }
            ` }} />

            {notification?.show && (
                <div className="notification-popup">
                    <div style={{ width: '50px', height: '50px', background: '#fee2e2', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444', fontSize: '1.5rem' }}></i>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#262661', marginBottom: '0.25rem' }}>DISCIPLINARY ALERT</div>
                        <div style={{ fontSize: '0.9rem', color: '#64748B', lineHeight: '1.4' }}>{notification.message}</div>
                    </div>
                    <button onClick={() => setNotification(null)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '0.5rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
            )}

            <aside className="worker-sidebar">
                <div className="sidebar-brand">
                    <div className="sidebar-logo">B</div>
                    <span style={{ fontSize: '1.5rem', fontWeight: 900 }}>Babylon</span>
                </div>

                <nav className="sidebar-nav">
                    <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <i className="fa-solid fa-house"></i>
                        <span>Dashboard</span>
                    </div>
                    <div className={`nav-item ${activeTab === 'personal_info' ? 'active' : ''}`} onClick={() => setActiveTab('personal_info')}>
                        <i className="fa-solid fa-user"></i>
                        <span>Personal Info</span>
                    </div>
                    <div className={`nav-item ${activeTab === 'conduct' ? 'active' : ''}`} onClick={() => setActiveTab('conduct')}>
                        <i className="fa-solid fa-shield-halved"></i>
                        <span>Conduct Record</span>
                    </div>
                    <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                        <i className="fa-solid fa-gear"></i>
                        <span>Settings</span>
                    </div>
                    <div className={`nav-item ${activeTab === 'documentation' ? 'active' : ''}`} onClick={() => setActiveTab('documentation')}>
                        <i className="fa-solid fa-file-invoice"></i>
                        <span>Documentation</span>
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <div className="nav-item" onClick={logout} style={{ color: '#ef4444' }}>
                        <i className="fa-solid fa-power-off"></i>
                        <span>Logout</span>
                    </div>
                </div>
            </aside>

            <main className="worker-main">
                <header className="worker-topbar">
                    <div>
                        <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Working Portal</div>
                        <h2 style={{ margin: 0, fontWeight: 900, color: '#262661' }}>
                            {activeTab === 'dashboard' ? 'Overview' : activeTab === 'personal_info' ? 'Update Details' : activeTab === 'conduct' ? 'Compliance' : activeTab === 'settings' ? 'Preferences' : 'Guides'}
                        </h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 800, color: '#262661' }}>{user.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>ID: {user.worker_id}</div>
                            </div>
                            <div className="worker-avatar">{user.name?.[0]}</div>
                        </div>
                        <button onClick={logout} title="Logout" style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', background: '#F1F5F9', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                            <i className="fa-solid fa-power-off"></i>
                        </button>
                    </div>
                </header>

                <div className="worker-content">
                    {nfcStatus !== 'idle' && (
                        <div className={`nfc-status-bar ${nfcStatus === 'error' ? 'nfc-status-error' : nfcStatus === 'reading' ? 'nfc-status-reading' : ''}`}>
                            {nfcStatus === 'listening' && <div className="nfc-heartbeat"></div>}
                            {nfcStatus === 'listening' ? "NFC Active: Tap card to clock in/out" :
                                nfcStatus === 'reading' ? "Reading Tag..." :
                                    nfcStatus === 'error' ? "NFC Error: Check settings or device support" : "NFC Offline"}
                        </div>
                    )}

                    {activeTab === 'dashboard' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                            <div className="status-card">
                                <div className="status-label">Live Status</div>
                                <div className={`status-value ${isClockedIn ? 'status-present' : 'status-offline'}`}>
                                    <div className={`status-dot ${isClockedIn ? 'dot-present' : 'dot-offline'}`}></div>
                                    {isClockedIn ? 'On Duty' : 'Off Duty'}
                                </div>
                                <div className="time-display">
                                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </div>
                                <div style={{ marginTop: '2.5rem' }}>
                                    {!isClockedIn ? (
                                        <button className="clock-btn clock-in-btn" onClick={handleClockIn} disabled={loading}>
                                            <i className="fa-solid fa-play"></i> {loading ? 'Clocking in...' : 'Clock In Now'}
                                        </button>
                                    ) : (
                                        <button className="clock-btn clock-out-btn" onClick={handleClockOut} disabled={loading}>
                                            <i className="fa-solid fa-stop"></i> {loading ? 'Clocking out...' : 'Clock Out Now'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="status-card" style={{ display: 'flex', flexDirection: 'column' }}>
                                <div className="status-label">Active Assignments</div>
                                {activeTasks.length > 0 ? (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
                                        {activeTasks.map(task => (
                                            <li key={task.id} style={{ padding: '1.25rem', border: '1px solid #E2E8F0', borderRadius: '16px', marginBottom: '1rem', background: '#F8FAFC' }}>
                                                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#262661' }}>{task.description}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>Ref: {task.mo_reference}</div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontStyle: 'italic' }}>Waiting for assignments...</div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'personal_info' && (
                        <div className="profile-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#262661' }}>Personal Information</h3>
                                <button className="edit-btn" onClick={() => setEditMode(!editMode)} style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none', background: editMode ? '#fee2e2' : '#F1F5F9', color: editMode ? '#ef4444' : '#262661', fontWeight: 700, cursor: 'pointer' }}>
                                    {editMode ? 'Cancel Edit' : 'Edit Profile'}
                                </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div className="form-group"><label>Full Name</label><input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={!editMode} /></div>
                                <div className="form-group"><label>Worker ID</label><input value={user.worker_id} disabled /></div>
                                <div className="form-group"><label>Phone Number</label><input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} disabled={!editMode} /></div>
                                <div className="form-group"><label>Email Address</label><input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} disabled={!editMode} /></div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Home Address</label><textarea rows={3} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} disabled={!editMode} /></div>
                            </div>
                            {editMode && <button className="clock-btn clock-in-btn" style={{ background: '#262661', marginTop: '1rem' }} onClick={handleSaveProfile} disabled={loading}>Save Updated Details</button>}
                        </div>
                    )}

                    {activeTab === 'conduct' && (
                        <div className="conduct-section">
                            <div style={{ marginBottom: '3rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#262661' }}>Conduct Record</h3>
                                <p style={{ color: '#64748B', marginTop: '0.5rem' }}>Review your compliance status and official acknowledgments</p>
                            </div>
                            <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '20px', marginBottom: '3rem', border: '1px solid #E2E8F0' }}>
                                <div className="status-label" style={{ marginBottom: '1rem' }}>Active Policies</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 800, color: '#262661' }}>Employee Disciplinary Standards (SOP 3.7)</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>v1.0 • Effective March 2024</div>
                                    </div>
                                    <div className="pilled-badge" style={{ backgroundColor: '#dcfce7', color: '#166534' }}><i className="fa-solid fa-check-double"></i> SIGNED</div>
                                </div>
                            </div>
                            <div className="status-label" style={{ marginBottom: '1.5rem' }}>History of Incidents</div>
                            {disciplinaryIncidents.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {disciplinaryIncidents.map(incident => (
                                        <div key={incident.id} style={{ padding: '2rem', borderRadius: '24px', border: '1px solid #E2E8F0', borderLeft: incident.severity === 'gross_misconduct' ? '8px solid #ef4444' : incident.severity === 'major' ? '8px solid #f97316' : '8px solid #fbbf24' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <div className="pilled-badge" style={{ backgroundColor: incident.severity === 'gross_misconduct' ? '#fee2e2' : '#fef3c7', color: incident.severity === 'gross_misconduct' ? '#991b1b' : '#92400e' }}>{incident.severity.toUpperCase().replace('_', ' ')}</div>
                                                <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>{new Date(incident.incident_date).toLocaleDateString()}</div>
                                            </div>
                                            <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#262661' }}>{incident.category.toUpperCase()}</h4>
                                            <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 700, marginTop: '0.5rem' }}>DOC: {incident.documentation || 'N/A'}</div>
                                            <p style={{ margin: '0.5rem 0 1rem', color: '#475569', lineHeight: '1.5' }}>{incident.description}</p>

                                            {incident.signed_at ? (
                                                <div style={{ padding: '1.5rem', background: '#F0F9FF', borderRadius: '16px', border: '1px solid #BAE6FD', marginTop: '1.5rem' }}>
                                                    <div style={{ fontWeight: 800, color: '#0369A1', fontSize: '0.8rem', textTransform: 'uppercase' }}>Your Official Response</div>
                                                    <p style={{ margin: '0.5rem 0 1rem', fontStyle: 'italic', color: '#0E7490' }}>"{incident.worker_explanation || 'No explanation provided.'}"</p>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E0F2FE', paddingTop: '0.75rem' }}>
                                                        <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                                                            Signed digitally by: <strong>{incident.worker_signature}</strong>
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                                                            Acknowledged on: {new Date(incident.signed_at).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ padding: '1.5rem', background: '#FFF7ED', borderRadius: '16px', border: '1px solid #FFEDD5', marginTop: '1.5rem' }}>
                                                    <div style={{ fontWeight: 800, color: '#9A3412', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem' }}>Worker Response Required</div>
                                                    <div className="form-group">
                                                        <label style={{ fontSize: '0.85rem' }}>Provide Explanation (Optional)</label>
                                                        <textarea
                                                            rows={2}
                                                            placeholder="State your side of the incident..."
                                                            style={{ background: 'white', borderRadius: '10px' }}
                                                            value={signingData[incident.id]?.explanation || ''}
                                                            onChange={e => updateSigningLocal(incident.id, 'explanation', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label style={{ fontSize: '0.85rem' }}>Type Your Full Name to Sign</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Signature"
                                                            style={{ background: 'white', borderRadius: '10px' }}
                                                            value={signingData[incident.id]?.signature || ''}
                                                            onChange={e => updateSigningLocal(incident.id, 'signature', e.target.value)}
                                                        />
                                                    </div>
                                                    <button
                                                        className="clock-btn clock-in-btn"
                                                        style={{ background: '#262661', fontSize: '0.9rem', padding: '1rem' }}
                                                        onClick={() => handleSignIncident(incident.id)}
                                                        disabled={loading}
                                                    >
                                                        Review & Sign Misconduct
                                                    </button>
                                                </div>
                                            )}
                                            {incident.actions?.map((action: any) => (
                                                <div key={action.id} style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '12px', color: '#059669', fontWeight: 800, fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                                    <i className="fa-solid fa-gavel"></i> {action.action_step.replace('_', ' ').toUpperCase()}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '24px', border: '1px dashed #CBD5E1' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🏆</div>
                                    <h4 style={{ margin: 0, fontWeight: 900, color: '#262661' }}>Exemplary Employee</h4>
                                    <p style={{ color: '#64748B', marginTop: '0.5rem' }}>Your record is perfectly clear. Keep it up!</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="profile-section">
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#262661' }}>Application Settings</h3>
                            <p style={{ color: '#64748B', marginTop: '0.5rem' }}>Manage your portal preferences and notification alerts</p>
                            <div style={{ marginTop: '2.5rem' }}>
                                <div style={{ padding: '1.5rem', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 800, color: '#262661' }}>Real-time Notifications</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Receive alerts on misconduct incidents immediately</div>
                                    </div>
                                    <div style={{ width: '40px', height: '24px', background: '#10B981', borderRadius: '99px' }}></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'documentation' && (
                        <div className="profile-section">
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#262661' }}>Worker Resources</h3>
                            <p style={{ color: '#64748B', marginTop: '0.5rem' }}>Official SOPs, safety guides, and training manuals</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginTop: '2.5rem' }}>
                                {['SOP 3.7 Disciplinary Standards', 'Floor Safety Manual', 'Machine Operation Guide v4'].map(doc => (
                                    <div key={doc} style={{ padding: '2rem', background: 'white', borderRadius: '20px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                        <i className="fa-solid fa-file-pdf" style={{ fontSize: '2rem', color: '#ef4444', marginBottom: '1rem', display: 'block' }}></i>
                                        <div style={{ fontWeight: 800, color: '#262661' }}>{doc}</div>
                                        <button style={{ marginTop: '1.25rem', padding: '0.6rem 1.25rem', borderRadius: '10px', border: '1.5px solid #E2E8F0', background: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>View Guide</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};
