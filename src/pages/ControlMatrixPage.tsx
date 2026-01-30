import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

export const ControlMatrixPage: React.FC = () => {
    const [mos, setMos] = useState<any[]>([]);
    const [operations, setOperations] = useState<string[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [selectedCell, setSelectedCell] = useState<{ mo: string, op: string, product: string } | null>(null);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showWorkerDropdown, setShowWorkerDropdown] = useState(false);
    const [manualRate, setManualRate] = useState<number>(0);

    // Pause Reason Modal State
    const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
    const [pauseTaskId, setPauseTaskId] = useState<string | null>(null);
    const [pauseReason, setPauseReason] = useState('');
    const [pauseReasonType, setPauseReasonType] = useState('Lunch'); // Default selection
    const [pauseError, setPauseError] = useState('');

    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Initial load
        fetchData(true);
        const interval = setInterval(() => {
            setTasks(prev => [...prev]); // Trigger re-render for timers
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowWorkerDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchData = async (showLoading = false) => {
        if (showLoading) setIsLoading(true);
        try {
            const { data: moData } = await supabase.from('manufacturing_orders').select('*');
            const { data: opData } = await supabase.from('operations').select('*').order('sort_order', { ascending: true });
            const { data: empData } = await supabase.from('users').select('*').eq('role', 'employee').order('name', { ascending: true });
            const { data: taskData } = await supabase.from('tasks').select('*');

            if (moData) {
                const sortedMos = (moData as any[]).sort((a, b) => {
                    const numA = parseInt(a.mo_number.replace(/\D/g, '')) || 0;
                    const numB = parseInt(b.mo_number.replace(/\D/g, '')) || 0;
                    return numA - numB;
                });
                setMos(sortedMos);
            }
            if (opData) setOperations(opData.map((o: any) => o.name));
            if (empData) setEmployees(empData);
            if (taskData) setTasks(taskData);
        } catch (err) {
            console.error('Error fetching matrix data:', err);
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };

    const getTasksForCell = (moRef: string, opName: string) => {
        return tasks.filter(t => t.mo_reference === moRef && t.description === opName && t.status !== 'completed');
    };

    const handleCellClick = (moNumber: string, opName: string, productName: string) => {
        setSelectedCell({ mo: moNumber, op: opName, product: productName || 'Unnamed Product' });
        setIsAssignOpen(true);
    };

    const closeAssign = () => {
        setIsAssignOpen(false);
        setSelectedCell(null);
        setSelectedWorkerId('');
        setShowWorkerDropdown(false);
    };

    const handleWorkerSelect = (emp: any) => {
        setSelectedWorkerId(emp.id);
        setManualRate(emp.hourly_rate || 0);
        setShowWorkerDropdown(false);
    };

    const assignSingleWorker = async () => {
        if (!selectedCell || !selectedWorkerId) return;
        setIsSaving(true);
        try {
            const { error } = await (supabase.from('tasks') as any).insert({
                mo_reference: selectedCell.mo,
                description: selectedCell.op,
                assigned_to_id: selectedWorkerId,
                status: 'pending',
                hourly_rate: manualRate,
                active_seconds: 0,
                break_seconds: 0,
                total_duration_seconds: 0,
                manual: false
            });
            if (error) throw error;
            await fetchData(false);
            setSelectedWorkerId('');
            setManualRate(0);
        } catch (err) {
            console.error('Error assigning worker:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const deleteTask = async (taskId: string) => {
        if (!confirm('Remove this assignment?')) return;
        try {
            const { error } = await supabase.from('tasks').delete().eq('id', taskId);
            if (error) throw error;
            await fetchData(false);
        } catch (err) {
            console.error('Error deleting task:', err);
        }
    };

    const openPauseModal = (taskId: string) => {
        setPauseTaskId(taskId);
        const currentTask = tasks.find(t => t.id === taskId);
        setPauseReasonType('Lunch'); // Reset to default
        setPauseReason(currentTask?.reason || '');
        setPauseError('');
        setIsPauseModalOpen(true);
    };

    const confirmPause = async () => {
        if (!pauseTaskId) return;

        // Determine final reason
        let finalReason = pauseReasonType;
        if (pauseReasonType === 'Other') {
            finalReason = pauseReason.trim(); // Use custom input
            if (!finalReason) {
                setPauseError('Please specify a reason');
                return;
            }
        }

        await performTaskAction(pauseTaskId, 'pause', finalReason);
        setIsPauseModalOpen(false);
        setPauseTaskId(null);
    };

    const performTaskAction = async (taskId: string, action: string, reason?: string) => {
        try {
            const task = tasks.find(t => t.id === taskId);
            if (!task) return;

            let updates: any = {};
            const now = new Date().toISOString();

            if (action === 'clock_in') {
                updates = { status: 'clocked_in', last_action_time: now };
            } else if (action === 'start') {
                updates = { status: 'active', start_time: task.start_time || now, last_action_time: now };
            } else if (action === 'stop') {
                // Regular stop (clocked in)
                const diff = task.last_action_time ? Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000) : 0;
                updates = {
                    status: 'clocked_in',
                    active_seconds: (task.active_seconds || 0) + (diff > 0 ? diff : 0),
                    last_action_time: now
                };
            } else if (action === 'pause') {
                // Taking a break - Reason is now passed in
                const diff = task.last_action_time ? Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000) : 0;
                updates = {
                    status: 'break',
                    active_seconds: (task.active_seconds || 0) + (diff > 0 ? diff : 0),
                    last_action_time: now,
                    reason: reason // Save reason to tasks table
                };
            } else if (action === 'resume') {
                updates = { status: 'active', last_action_time: now };
            } else if (action === 'complete') {
                const diff = (task.status === 'active' && task.last_action_time) ? Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000) : 0;
                updates = {
                    status: 'completed',
                    active_seconds: (task.active_seconds || 0) + (diff > 0 ? diff : 0),
                    end_time: now,
                    last_action_time: now
                };
            } else if (action === 'clock_out') {
                // Clock out logic
                const diff = (task.status === 'active' && task.last_action_time) ? Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000) : 0;
                updates = {
                    status: 'clocked_out',
                    active_seconds: (task.active_seconds || 0) + (diff > 0 ? diff : 0),
                    end_time: now, // Update end_time on clock_out
                    last_action_time: now
                };
            }

            const { error } = await (supabase.from('tasks') as any).update(updates).eq('id', taskId);
            if (error) throw error;
            await fetchData(false); // Don't show loading screen
        } catch (err) {
            console.error('Error performing action:', err);
        }
    };

    const formatCurrentTime = (task: any) => {
        let total = task.active_seconds || 0;
        if (task.status === 'active' && task.last_action_time) {
            const diff = Math.floor((new Date().getTime() - new Date(task.last_action_time).getTime()) / 1000);
            if (diff > 0) total += diff;
        }
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
    };

    const getStatusIndicator = (status: string) => {
        const s = (status || 'pending').toLowerCase();
        let color = '#94A3B8'; // gray
        let label = s.toUpperCase().replace('_', ' ');
        if (s === 'active') color = '#22C55E';
        if (s === 'break') color = '#F59E0B';
        if (s === 'clocked_in') color = '#3B82F6';
        if (s === 'completed') color = '#10B981';

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: `${color}15`, padding: '4px 8px', borderRadius: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: color, letterSpacing: '0.02em' }}>{label}</span>
            </div>
        );
    };

    if (isLoading) return <div className="loading-screen">Loading Matrix...</div>;

    const selectedWorker = employees.find(e => e.id === selectedWorkerId);

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title">Production Control Matrix</h1>
                    <p className="page-subtitle">Click any cell to assign workers and control timers</p>
                </div>
                <button className="btn btn-secondary" style={{ width: 'auto', padding: '0.6rem 1.5rem' }}>
                    <i className="fa-solid fa-plus"></i> Manual Entry
                </button>
            </div>

            <div className="matrix-container">
                <div className="matrix-grid">
                    <div className="matrix-row">
                        <div className="matrix-header-cell" style={{ textAlign: 'left', paddingLeft: '20px' }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                <i className="fa-regular fa-clipboard"></i> Manufacturing Orders
                            </span>
                        </div>
                        {operations.map(op => (
                            <div key={op} className="matrix-header-cell">
                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{op}</div>
                            </div>
                        ))}
                    </div>

                    {mos.map(mo => (
                        <div key={mo.id} className="matrix-row" id={`mo-${mo.mo_number}`}>
                            <div className="matrix-label-cell" style={{ width: '200px' }}>
                                <Link to="/manufacturing-orders" className="mo-badge" style={{ textDecoration: 'none' }}>{mo.mo_number}</Link>
                                <div className="mo-details" style={{ fontSize: '0.9rem', fontWeight: 800, color: '#000000', marginTop: '4px' }}>{mo.product_name}</div>

                                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div><span style={{ fontWeight: 600 }}>PO:</span> {mo.po_number || '-'}</div>
                                    <div><span style={{ fontWeight: 600 }}>Qty:</span> {mo.quantity || 0}</div>
                                    <div><span style={{ fontWeight: 600 }}>SKU:</span> {mo.sku || '-'}</div>
                                    <div style={{ marginTop: '4px' }}>
                                        <span className={`status-badge badge-${(mo.current_status || 'draft').toLowerCase()}`}>{mo.current_status}</span>
                                    </div>
                                </div>
                            </div>

                            {operations.map(op => {
                                const cellTasks = getTasksForCell(mo.mo_number, op);
                                const hasActive = cellTasks.some(t => t.status === 'active');
                                return (
                                    <div
                                        key={op}
                                        className={`matrix-cell ${cellTasks.length > 0 ? 'active-cell' : ''} ${hasActive ? 'timer-running' : ''}`}
                                        onClick={() => handleCellClick(mo.mo_number, op, mo.product_name)}
                                    >
                                        {cellTasks.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                        <i className="fa-solid fa-user-group" style={{ color: 'var(--text-muted)', marginRight: '4px' }}></i>
                                                        {cellTasks.length} workers
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
                                                    {cellTasks.slice(0, 3).map(t => {
                                                        const worker = employees.find(e => e.id === t.assigned_to_id);
                                                        return (
                                                            <Link key={t.id} to="/employee-activity" className="worker-avatar" title={worker?.name} style={{ textDecoration: 'none' }}>
                                                                {worker?.name?.[0] || '?'}
                                                            </Link>
                                                        );
                                                    })}
                                                    {cellTasks.length > 3 && (
                                                        <span className="worker-avatar" style={{ background: '#CBD5E1', color: 'var(--text-muted)' }}>
                                                            +{cellTasks.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="matrix-cell-empty">Click to assign</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Assignments Modal */}
            <div
                className={`assign-modal ${isAssignOpen ? 'active' : ''}`}
                style={{
                    width: '640px', maxHeight: '85vh', position: 'fixed', left: '50%', top: '50%',
                    transform: `translate(-50%, -50%) scale(${isAssignOpen ? 1 : 0.9})`,
                    opacity: isAssignOpen ? 1 : 0,
                    pointerEvents: isAssignOpen ? 'auto' : 'none',
                    background: '#ffffff', borderRadius: '20px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    zIndex: 2600, transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden'
                }}
            >
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F1F5F9', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h2 style={{ fontSize: '1.1rem', color: '#0F172A', fontWeight: 700, marginBottom: '0.2rem' }}>
                            {selectedCell?.product}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="badge badge-blue" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{selectedCell?.mo}</span>
                            <i className="fa-solid fa-chevron-right" style={{ color: '#CBD5E1', fontSize: '0.7rem' }}></i>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>{selectedCell?.op}</span>
                        </div>
                    </div>
                    <button className="close-btn" onClick={closeAssign} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="offcanvas-body" style={{ padding: '1.5rem', background: '#F8FAFC', flex: 1, overflowY: 'auto' }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Worker</h3>
                        <div style={{ background: 'white', padding: '0.4rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <div style={{ flex: 1, position: 'relative' }} ref={dropdownRef}>
                                <div
                                    onClick={() => setShowWorkerDropdown(!showWorkerDropdown)}
                                    style={{ height: '38px', padding: '0 0.75rem', borderRadius: '8px', background: selectedWorkerId ? '#F1F5F9' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'all 0.2s' }}
                                >
                                    <span style={{ fontSize: '0.9rem', color: selectedWorkerId ? '#0F172A' : '#94A3B8', fontWeight: selectedWorkerId ? 600 : 500 }}>
                                        {selectedWorker ? selectedWorker.name : 'Select a worker...'}
                                    </span>
                                    <i className="fa-solid fa-chevron-down" style={{ color: '#94A3B8', fontSize: '0.75rem' }}></i>
                                </div>

                                {showWorkerDropdown && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: '100%', background: 'white', borderRadius: '10px', boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.04)', zIndex: 50, overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                                        {employees.map(emp => (
                                            <div key={emp.id} onClick={() => handleWorkerSelect(emp)} style={{ padding: '8px 12px', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', transition: 'background 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>{emp.name}</span>
                                                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>${emp.hourly_rate}/hr</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ width: '100px', display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '0 8px', borderRadius: '8px', height: '38px', border: '1px solid #E2E8F0' }}>
                                <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>$</span>
                                <input
                                    type="number"
                                    value={manualRate}
                                    onChange={(e) => setManualRate(parseFloat(e.target.value) || 0)}
                                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontWeight: 600, fontSize: '0.9rem', color: '#0F172A' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>/hr</span>
                            </div>

                            <button className="btn btn-primary" onClick={assignSingleWorker} disabled={isSaving} style={{ height: '38px', borderRadius: '8px', fontWeight: 600, padding: '0 1.25rem', fontSize: '0.9rem' }}>
                                Assign
                            </button>
                        </div>
                    </div>

                    <div id="assignedList" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {selectedCell && getTasksForCell(selectedCell.mo, selectedCell.op).map(task => {
                            const worker = employees.find(e => e.id === task.assigned_to_id);
                            const status = (task.status || 'pending').toLowerCase();

                            return (
                                <div key={task.id} className="worker-card" style={{ background: 'white', borderRadius: '16px', padding: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem' }}>
                                                {worker?.name?.[0] || '?'}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '1rem', marginBottom: '2px' }}>{worker?.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>${task.hourly_rate}/hr</div>
                                            </div>
                                        </div>
                                        <div>
                                            {getStatusIndicator(task.status)}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div className="timer-display" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                                            {formatCurrentTime(task)}
                                        </div>

                                        <div className="action-toolbar" style={{ display: 'flex', gap: '0.5rem' }}>
                                            {(status === 'pending' || status === 'clocked_out') && (
                                                <button title="Clock In" onClick={() => performTaskAction(task.id, 'clock_in')} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: '#EEF2FF', color: '#4F46E5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                                                    <i className="fa-solid fa-arrow-right-to-bracket"></i>
                                                </button>
                                            )}
                                            {status === 'clocked_in' && (
                                                <button title="Start Timer" onClick={() => performTaskAction(task.id, 'start')} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: '#DCFCE7', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                                                    <i className="fa-solid fa-play"></i>
                                                </button>
                                            )}
                                            {status === 'active' && (
                                                <>
                                                    <button title="Stop Timer" onClick={() => performTaskAction(task.id, 'stop')} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: '#FEF9C3', color: '#D97706', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                                                        <i className="fa-solid fa-stop"></i>
                                                    </button>
                                                    <button title="Pause" onClick={() => openPauseModal(task.id)} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                                                        <i className="fa-solid fa-pause"></i>
                                                    </button>
                                                </>
                                            )}
                                            {status === 'break' && (
                                                <button title="Resume" onClick={() => performTaskAction(task.id, 'resume')} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: '#DCFCE7', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                                                    <i className="fa-solid fa-play"></i>
                                                </button>
                                            )}
                                            {(status === 'clocked_in' || status === 'active' || status === 'break') && (
                                                <button title="Clock Out" onClick={() => performTaskAction(task.id, 'clock_out')} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: '#F1F5F9', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                                                    <i className="fa-solid fa-arrow-right-from-bracket"></i>
                                                </button>
                                            )}
                                            {status !== 'pending' && status !== 'completed' && (
                                                <button title="Complete" onClick={() => performTaskAction(task.id, 'complete')} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}>
                                                    <i className="fa-solid fa-check"></i>
                                                </button>
                                            )}
                                            <button title="Remove" onClick={() => deleteTask(task.id)} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s', marginLeft: '0.25rem' }}>
                                                <i className="fa-regular fa-trash-can"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {selectedCell && getTasksForCell(selectedCell.mo, selectedCell.op).length === 0 && (
                            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94A3B8' }}>
                                <i className="fa-solid fa-clipboard-user" style={{ fontSize: '2rem', marginBottom: '1rem', color: '#CBD5E1' }}></i>
                                <p>No workers assigned yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Pause Reason Modal */}
            <div className={`offcanvas ${isPauseModalOpen ? 'show' : ''}`} style={{
                right: 'auto', left: '50%', top: '50%', transform: `translate(-50%, -50%)`,
                width: '400px', height: 'auto', borderRadius: '16px',
                opacity: isPauseModalOpen ? 1 : 0, pointerEvents: isPauseModalOpen ? 'all' : 'none',
                transition: 'opacity 0.2s', zIndex: 3100, background: 'white', position: 'fixed',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                <div style={{ padding: '1.5rem 1.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Pause Reason</h3>
                    <button className="close-btn" onClick={() => setIsPauseModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#64748B' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div style={{ padding: '0 1.5rem 1.5rem' }}>
                    <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                        Please specify why this worker is taking a break.
                    </p>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#0F172A' }}>
                            Reason (Required)
                        </label>
                        <select
                            value={pauseReasonType}
                            onChange={(e) => { setPauseReasonType(e.target.value); setPauseError(''); }}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '8px',
                                border: '1.5px solid #CBD5E1', background: 'white',
                                fontSize: '0.95rem', outline: 'none', marginBottom: pauseReasonType === 'Other' ? '0.75rem' : '0'
                            }}
                        >
                            <option value="Lunch">Lunch</option>
                            <option value="Restroom">Restroom</option>
                            <option value="Emergency call">Emergency call</option>
                            <option value="Power Nap">Power Nap</option>
                            <option value="Other">Other</option>
                        </select>

                        {pauseReasonType === 'Other' && (
                            <input
                                type="text"
                                placeholder="Please specify reason..."
                                value={pauseReason}
                                onChange={(e) => { setPauseReason(e.target.value); setPauseError(''); }}
                                style={{
                                    width: '100%', padding: '0.75rem', borderRadius: '8px',
                                    border: pauseError ? '1.5px solid #EF4444' : '1.5px solid #CBD5E1',
                                    fontSize: '0.95rem', outline: 'none'
                                }}
                            />
                        )}
                        {pauseError && <div style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: '0.25rem', fontWeight: 500 }}>{pauseError}</div>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <button
                            onClick={() => setIsPauseModalOpen(false)}
                            style={{
                                padding: '0.75rem', borderRadius: '8px', border: '1.5px solid #E2E8F0',
                                background: 'white', color: '#0F172A', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmPause}
                            style={{
                                padding: '0.75rem', borderRadius: '8px', border: 'none',
                                background: '#0F172A', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem'
                            }}
                        >
                            Confirm Pause
                        </button>
                    </div>
                </div>
            </div>

            {(isAssignOpen || isPauseModalOpen) && <div className="overlay active" onClick={() => { if (isPauseModalOpen) setIsPauseModalOpen(false); else closeAssign(); }} style={{ zIndex: 2550 }}></div>}
        </>
    );
};
