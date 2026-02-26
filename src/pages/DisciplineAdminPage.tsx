import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DisciplinaryService } from '../lib/disciplinaryService';
import type { SeverityType, ActionStepType } from '../lib/disciplinaryService';
import { useAuth } from '../context/AuthContext';

export const DisciplineAdminPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [incidents, setIncidents] = useState<any[]>([]);
    const [workers, setWorkers] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        worker_id: '',
        incident_date: new Date().toISOString().split('T')[0],
        category: 'attendance',
        severity: 'minor' as SeverityType,
        documentation: '',
        description: '',
    });
    const [attachment, setAttachment] = useState<File | null>(null);

    const [suggestedStep, setSuggestedStep] = useState<ActionStepType>('verbal_warning');

    useEffect(() => {
        fetchIncidents();
        fetchWorkers();
    }, []);

    useEffect(() => {
        if (formData.worker_id && formData.severity) {
            updateSuggestedStep();
        }
    }, [formData.worker_id, formData.severity]);

    const fetchIncidents = async () => {
        try {
            const { data, error } = await supabase
                .from('disciplinary_incidents')
                .select(`
                    *,
                    worker:users!worker_id(name, worker_id),
                    reporter:users!reported_by(name)
                `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase error fetching incidents:', error);
                return;
            }
            if (data) setIncidents(data);
        } catch (err) {
            console.error('Failed to fetch incidents:', err);
        }
    };

    const fetchWorkers = async () => {
        try {
            const { data, error } = await supabase.from('users').select('id, name, worker_id');
            if (error) {
                console.error('Supabase error fetching workers:', error);
                return;
            }
            if (data) setWorkers(data);
        } catch (err) {
            console.error('Failed to fetch workers:', err);
        }
    };

    const updateSuggestedStep = async () => {
        try {
            const step = await DisciplinaryService.suggestNextStep(formData.worker_id, formData.severity);
            setSuggestedStep(step);
        } catch (err) {
            console.error('Failed to suggest next step:', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            let attachment_url = '';

            // Handle file upload if present (assuming 'attachments' bucket exists)
            if (attachment) {
                const fileExt = attachment.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await (supabase as any).storage
                    .from('attachments')
                    .upload(`${formData.worker_id}/${fileName}`, attachment);

                if (uploadError) {
                    console.error('Upload Error:', uploadError);
                    alert(`Upload Failed: ${uploadError.message}`);
                    return;
                }

                if (uploadData) {
                    const { data: { publicUrl } } = (supabase as any).storage
                        .from('attachments')
                        .getPublicUrl(`${formData.worker_id}/${fileName}`);
                    attachment_url = publicUrl;
                }
            }

            // 1. Create Incident
            const { data: incident, error: incError } = await (supabase as any)
                .from('disciplinary_incidents')
                .insert({
                    ...formData,
                    attachment_url,
                    reported_by: currentUser?.id,
                    status: 'action_taken'
                })
                .select()
                .single();

            if (incError) {
                console.error('Incident Creation Error:', incError);
                throw new Error(`Incident Error: ${incError.message}`);
            }

            // 2. Create Disciplinary Action (Automated Step)
            const { error: actError } = await (supabase as any)
                .from('disciplinary_actions')
                .insert({
                    worker_id: formData.worker_id,
                    incident_id: incident.id,
                    action_step: suggestedStep,
                    issued_date: new Date().toISOString(),
                    status: 'active'
                });

            if (actError) {
                console.error('Action Creation Error:', actError);
                throw new Error(`Action Error: ${actError.message}`);
            }

            alert('Incident reported successfully');
            setShowModal(false);
            setAttachment(null);
            fetchIncidents();
        } catch (err: any) {
            console.error(err);
            alert(`Failed: ${err.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <style dangerouslySetInnerHTML={{
                __html: `
                .discipline-grid {
                    display: grid;
                    gap: 1rem;
                    padding: 0 3.5rem;
                }
                .inc-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    border: 1px solid var(--border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: transform 0.2s;
                }
                .inc-card:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--shadow);
                }
                .severity-badge {
                    padding: 0.25rem 0.6rem;
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .sev-minor { background: #fee2e2; color: #991b1b; } /* Using a consistent red/warning palette */
                .sev-major { background: #fef3c7; color: #92400e; }
                .sev-gross_misconduct { background: #1e293b; color: white; }
                
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 3000;
                    backdrop-filter: blur(4px);
                }
                .modal-content {
                    background: white;
                    padding: 2.5rem;
                    border-radius: 20px;
                    width: 100%;
                    max-width: 550px;
                    box-shadow: var(--shadow-lg);
                }
                .suggestion-box {
                    background: #f8fafc;
                    padding: 1rem;
                    border-radius: 12px;
                    margin: 1.5rem 0;
                    border-left: 4px solid var(--primary);
                }
            `}} />

            <div className="page-header">
                <div>
                    <h1 className="page-title">Discipline & Conduct</h1>
                    <p className="page-subtitle">SOP 3.7 Incident Tracking & Compliance Management</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <i className="fa-solid fa-plus"></i> Report Incident
                </button>
            </div>

            <div className="discipline-grid">
                {incidents.length > 0 ? (
                    incidents.map(inc => (
                        <div key={inc.id} className="inc-card">
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                    <span className={`severity-badge sev-${inc.severity}`}>
                                        {(inc.severity || 'Minor').replace('_', ' ')}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                                        {inc.incident_date ? new Date(inc.incident_date).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)', fontWeight: 700 }}>
                                    {inc.worker?.name || 'Unknown Worker'}
                                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                                        ({inc.worker?.worker_id || 'No ID'})
                                    </span>
                                </h3>
                                <p style={{ margin: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                                    {inc.description}
                                </p>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                        <i className="fa-solid fa-user-pen" style={{ marginRight: '4px' }}></i>
                                        Reported by: {inc.reporter?.name || 'System'}
                                    </small>
                                    <small style={{ color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600 }}>
                                        Category: {inc.category?.toUpperCase()}
                                    </small>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div className="status-badge badge-blue" style={{ fontSize: '0.7rem' }}>
                                    {inc.status?.replace('_', ' ').toUpperCase()}
                                </div>
                                <div style={{ marginTop: '0.5rem' }}>
                                    {/* Eye icon button removed per user request */}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{ textAlign: 'center', padding: '4rem', background: 'white', borderRadius: '16px', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                        <i className="fa-solid fa-shield-heart" style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5, display: 'block' }}></i>
                        No incidents recorded yet. Ensuring a high standard of conduct.
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Record Misconduct Incident</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Select Employee</label>
                                <select
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)', background: '#F8FAFC' }}
                                    required
                                    value={formData.worker_id}
                                    onChange={e => setFormData({ ...formData, worker_id: e.target.value })}
                                >
                                    <option value="">Choose worker...</option>
                                    {workers.filter(w => w.name).map(w => (
                                        <option key={w.id} value={w.id}>{w.name} (ID: {w.worker_id || 'N/A'})</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Incident Date</label>
                                    <input
                                        type="date"
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)' }}
                                        value={formData.incident_date}
                                        onChange={e => setFormData({ ...formData, incident_date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Severity Level</label>
                                    <select
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)', background: '#F8FAFC' }}
                                        required
                                        value={formData.severity}
                                        onChange={e => setFormData({ ...formData, severity: e.target.value as SeverityType })}
                                    >
                                        <option value="minor">Minor Infraction</option>
                                        <option value="major">Major Infraction</option>
                                        <option value="gross_misconduct">Gross Misconduct</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Documentation</label>
                                <input
                                    type="text"
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1.5px solid var(--border)' }}
                                    value={formData.documentation}
                                    onChange={e => setFormData({ ...formData, documentation: e.target.value })}
                                    placeholder="Enter case number or reference..."
                                    required
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Description</label>
                                <textarea
                                    style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1.5px solid var(--border)', resize: 'none', fontFamily: 'inherit' }}
                                    rows={3}
                                    required
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Describe the incident objectively..."
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '2rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>Attachment (Image or Video)</label>
                                <input
                                    type="file"
                                    accept="image/*,video/*"
                                    onChange={e => setAttachment(e.target.files?.[0] || null)}
                                    style={{ width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                                    {loading ? 'Processing...' : 'Report'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};
