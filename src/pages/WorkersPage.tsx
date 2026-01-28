import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

export const WorkersPage: React.FC = () => {
    const [workers, setWorkers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<any>(null);
    const [formData, setFormData] = useState({ worker_id: '', name: '', username: '', rate: '', password: '', active: true });

    useEffect(() => { fetchWorkers(); }, []);

    const fetchWorkers = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('users').select('*').eq('role', 'employee').order('name', { ascending: true }) as { data: any[] };
        if (data) setWorkers(data);
        setIsLoading(false);
    };

    const handleHire = async () => {
        if (!formData.name || !formData.username || !formData.rate || !formData.worker_id) return alert('Please fill all fields');

        // Auto-generate a default password since the field was removed
        const defaultPassword = 'worker' + Math.floor(1000 + Math.random() * 9000);

        const { error } = await (supabase.from('users') as any).insert({
            name: formData.name,
            username: formData.username,
            worker_id: formData.worker_id,
            hourly_rate: parseFloat(formData.rate),
            password: defaultPassword, // Set default password
            role: 'employee'
        });

        if (!error) {
            setIsAddOpen(false);
            resetForm();
            fetchWorkers();
        } else {
            alert('Error creating worker: ' + error.message);
        }
    };

    const handleUpdate = async () => {
        if (!selectedWorker) return;
        const { error } = await (supabase.from('users') as any).update({
            name: formData.name,
            username: formData.username,
            worker_id: formData.worker_id,
            hourly_rate: parseFloat(formData.rate)
        }).eq('id', selectedWorker.id);
        if (!error) {
            setIsEditOpen(false);
            resetForm();
            fetchWorkers();
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this worker?')) return;
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (!error) fetchWorkers();
    };

    const resetForm = () => {
        setFormData({ worker_id: '', name: '', username: '', rate: '', password: '', active: true });
        setSelectedWorker(null);
    };

    const openEdit = (worker: any) => {
        setSelectedWorker(worker);
        setFormData({
            worker_id: worker.worker_id || '',
            name: worker.name || '',
            username: worker.username || '',
            rate: worker.hourly_rate?.toString() || '0',
            password: '',
            active: worker.active !== false
        });
        setIsEditOpen(true);
    };

    const filteredWorkers = workers.filter(w =>
        w.name?.toLowerCase().includes(search.toLowerCase()) ||
        w.worker_id?.toLowerCase().includes(search.toLowerCase()) ||
        w.username?.toLowerCase().includes(search.toLowerCase())
    );

    if (isLoading) return <div className="loading-screen">Loading Workers...</div>;

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title">Workers</h1>
                    <p className="page-subtitle">Manage manufacturing workers</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}
                    style={{ width: 'auto', padding: '0.75rem 1.5rem', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600 }}>
                    <i className="fa-solid fa-plus"></i> Add Worker
                </button>
            </div>

            <div style={{ marginBottom: '2rem' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '15px', top: '12px', color: '#9CA3AF' }}></i>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search workers..."
                        style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                </div>
            </div>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Worker ID</th>
                            <th>Name</th>
                            <th>Username/Email</th>
                            <th>Hourly Rate</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredWorkers.map(worker => (
                            <tr key={worker.id}>
                                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#64748B' }}>{worker.worker_id || '-'}</td>
                                <td>
                                    <div className="user-cell">
                                        <div className="avatar-circle">{worker.name?.[0] || '?'}</div>
                                        <Link to="/employee-activity" style={{ fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>{worker.name}</Link>
                                    </div>
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>{worker.username}@BabylonLLC.com</td>
                                <td style={{ color: 'var(--text-muted)', fontWeight: 500 }}>$ {parseFloat(worker.hourly_rate || 0).toFixed(2)}/hr</td>
                                <td><span className="badge badge-active">Active</span></td>
                                <td style={{ textAlign: 'right' }}>
                                    <button className="icon-btn" title="Edit" onClick={() => openEdit(worker)}><i className="fa-solid fa-pen"></i></button>
                                    <button className="icon-btn delete" title="Delete" onClick={() => handleDelete(worker.id)}><i className="fa-regular fa-trash-can"></i></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Modal */}
            <div className={`custom-modal ${isAddOpen ? 'active' : ''}`} style={{ width: '450px', padding: 0, borderRadius: '16px', overflow: 'hidden', background: 'white' }}>
                <div style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Add Worker</h3>
                    <button onClick={() => setIsAddOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#666', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div style={{ padding: '0 2rem 2rem' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Worker ID (Unique / Required)</label>
                        <input type="text" value={formData.worker_id} onChange={e => setFormData({ ...formData, worker_id: e.target.value })} placeholder="e.g. W-1001" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Full Name</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Enter worker name" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Email</label>
                        <input type="email" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} placeholder="worker@company.com" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Hourly Rate ($)</label>
                        <input type="number" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} placeholder="0.00" style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button className="btn" onClick={() => setIsAddOpen(false)} style={{ width: 'auto', padding: '0.75rem 1.75rem', borderRadius: '8px', border: '1.5px solid #DDD', background: 'white' }}>Cancel</button>
                        <button className="btn" onClick={handleHire} style={{ width: 'auto', padding: '0.75rem 1.75rem', borderRadius: '8px', border: 'none', background: '#111', color: 'white' }}>Create</button>
                    </div>
                </div>
            </div>

            {/* Edit Modal (similarly) */}
            <div className={`custom-modal ${isEditOpen ? 'active' : ''}`} style={{ width: '450px', padding: 0, borderRadius: '16px', overflow: 'hidden', background: 'white' }}>
                <div style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Edit Worker</h3>
                    <button onClick={() => setIsEditOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#666', cursor: 'pointer' }}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div style={{ padding: '0 2rem 2rem' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Worker ID</label>
                        <input type="text" value={formData.worker_id} onChange={e => setFormData({ ...formData, worker_id: e.target.value })} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Full Name</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Email</label>
                        <input type="email" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#111', fontSize: '0.95rem' }}>Hourly Rate ($)</label>
                        <input type="number" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1.5px solid #DDD' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button className="btn" onClick={() => setIsEditOpen(false)} style={{ width: 'auto', padding: '0.75rem 1.75rem', borderRadius: '8px', border: '1.5px solid #DDD', background: 'white' }}>Cancel</button>
                        <button className="btn" onClick={handleUpdate} style={{ width: 'auto', padding: '0.75rem 1.75rem', borderRadius: '8px', border: 'none', background: '#111', color: 'white' }}>Update</button>
                    </div>
                </div>
            </div>

            {(isAddOpen || isEditOpen) && <div className="overlay active" onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }}></div>}
        </>
    );
};
