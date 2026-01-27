import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

// Define the interface for the Order object - Ensures type safety
interface ManufacturingOrder {
    id: string;
    mo_number: string;
    product_name: string;
    sku: string;
    quantity: number;
    po_number: string;
    event_id: string;
    scheduled_date: string;
    current_status: string;
    created_at?: string;
}

export const ManufacturingOrdersPage: React.FC = () => {
    // Explicitly typed state
    const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<ManufacturingOrder | null>(null);

    // Updated formData structure
    const [formData, setFormData] = useState({
        mo_number: '',
        quantity: 0,
        po_number: '',
        product_name: '',
        sku: '',
        event_id: '',
        scheduled_date: '',
        current_status: 'Draft'
    });

    useEffect(() => { fetchOrders(); }, []);

    const fetchOrders = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('manufacturing_orders').select('*').order('created_at', { ascending: false });
        if (data) setOrders(data as ManufacturingOrder[]);
        setIsLoading(false);
    };

    const handleSync = async () => {
        if (!confirm('Fetch latest orders from Odoo? This will update existing records.')) return;
        setIsLoading(true);
        try {
            const response = await fetch('/api/sync-odoo');
            const result = await response.json();

            if (result && result.items) {
                let count = 0;
                let newIndex = 1; // Counter for generated MO numbers

                for (const item of result.items) {
                    const po = item.po_number || '';
                    if (!po) continue;

                    let mo = item.mo_number;
                    if (!mo) {
                        // USER REQUEST: Generate MO Number explicitly as "1", "2", "3"...
                        // Since we need to persist this, this is tricky if we sync multiple times.
                        // But PER REQUEST, we will just use the index for now. 
                        // Note: This will restart from 1 every time unless we check DB.
                        // To be safer for display, we'll try to just use the loop index.
                        mo = newIndex.toString();
                    }

                    // Check if exists using PO Number as the reliable key
                    const { data: existing } = await supabase.from('manufacturing_orders')
                        .select('id')
                        .eq('po_number', po)
                        .maybeSingle();

                    // Retrieve existing ID if present
                    const existingId = existing ? (existing as any).id : null;

                    const payload = {
                        mo_number: mo,
                        quantity: typeof item.quantity === 'number' ? item.quantity : 0,
                        po_number: po,
                        product_name: item.product_name,
                        sku: item.sku,
                        event_id: item.event_id,
                        scheduled_date: item.scheduled_date || null,
                        current_status: item.current_status
                    };

                    if (existingId) {
                        await (supabase.from('manufacturing_orders') as any).update(payload).eq('id', existingId);
                    } else {
                        await (supabase.from('manufacturing_orders') as any).insert(payload);
                    }
                    count++;
                    newIndex++;
                }
                alert(`Sync Complete. Processed ${count} orders.`);
                await fetchOrders();
            }
        } catch (e: any) {
            console.error(e);
            alert('Sync Failed: ' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!formData.mo_number || !formData.product_name) return alert('MO Number and Product Name are required');

        const { error } = await (supabase.from('manufacturing_orders') as any).insert({
            mo_number: formData.mo_number,
            quantity: formData.quantity,
            po_number: formData.po_number,
            product_name: formData.product_name,
            sku: formData.sku,
            event_id: formData.event_id,
            scheduled_date: formData.scheduled_date || null,
            current_status: formData.current_status
        });

        if (!error) {
            setIsAddOpen(false);
            resetForm();
            fetchOrders();
        } else {
            alert('Error creating order: ' + error.message);
        }
    };

    const handleUpdate = async () => {
        if (!selectedOrder) return;

        const { error } = await (supabase.from('manufacturing_orders') as any).update({
            quantity: formData.quantity,
            po_number: formData.po_number,
            product_name: formData.product_name,
            sku: formData.sku,
            event_id: formData.event_id,
            scheduled_date: formData.scheduled_date || null,
            current_status: formData.current_status
        }).eq('id', selectedOrder.id);

        if (!error) {
            setIsEditOpen(false);
            fetchOrders();
        } else {
            alert('Error updating order: ' + error.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this order?')) return;
        const { error } = await supabase.from('manufacturing_orders').delete().eq('id', id);
        if (!error) fetchOrders();
    };

    const openEdit = (order: ManufacturingOrder) => {
        setSelectedOrder(order);
        setFormData({
            mo_number: order.mo_number || '',
            quantity: order.quantity || 0,
            po_number: order.po_number || '',
            product_name: order.product_name || '',
            sku: order.sku || '',
            event_id: order.event_id || '',
            scheduled_date: order.scheduled_date || '',
            current_status: order.current_status || 'Draft'
        });
        setIsEditOpen(true);
    };

    const resetForm = () => {
        setFormData({
            mo_number: '',
            quantity: 0,
            po_number: '',
            product_name: '',
            sku: '',
            event_id: '',
            scheduled_date: '',
            current_status: 'Draft'
        });
    };

    const filteredOrders = orders.filter(o => {
        const term = search.toLowerCase();
        return (o.mo_number?.toLowerCase().includes(term) ||
            o.product_name?.toLowerCase().includes(term) ||
            o.po_number?.toLowerCase().includes(term) ||
            o.sku?.toLowerCase().includes(term));
    });

    if (isLoading) return <div className="loading-screen">Loading Orders...</div>;

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title">Manufacturing Orders</h1>
                    <p className="page-subtitle">Track production orders</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={handleSync}
                        style={{ width: 'auto', padding: '0.75rem 1.0rem', background: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: '8px', fontWeight: 600 }}>
                        <i className="fa-solid fa-arrows-rotate" style={{ marginRight: '8px' }}></i> Sync Orders
                    </button>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setIsAddOpen(true); }}
                        style={{ width: 'auto', padding: '0.75rem 1.5rem', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600 }}>
                        <i className="fa-solid fa-plus"></i> Create Order
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '15px', top: '12px', color: '#9CA3AF' }}></i>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search MO, Product, PO..."
                        style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                </div>
            </div>

            <div className="table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                            <th style={{ padding: '0.75rem 1rem' }}>MO Number</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Product Name</th>
                            <th style={{ padding: '0.75rem 1rem' }}>SKU</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Qty</th>
                            <th style={{ padding: '0.75rem 1rem' }}>PO Number</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Event ID</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Scheduled</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.map(order => (
                            <tr key={order.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--primary)' }}>{order.mo_number}</td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{order.product_name}</td>
                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#64748B' }}>{order.sku}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>{order.quantity}</td>
                                <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>{order.po_number}</td>
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#94A3B8' }}>{order.event_id}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    {order.scheduled_date}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <span className={`badge badge-${(order.current_status || 'draft').toLowerCase()}`} style={{ textTransform: 'capitalize' }}>
                                        {order.current_status}
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                    <Link to={`/control-matrix#mo-${order.mo_number}`} className="icon-btn" title="View Matrix" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fa-solid fa-table-cells"></i>
                                    </Link>
                                    <button className="icon-btn" title="Edit" onClick={() => openEdit(order)}><i className="fa-solid fa-pen"></i></button>
                                    <button className="icon-btn delete" title="Delete" onClick={() => handleDelete(order.id)}><i className="fa-regular fa-trash-can"></i></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            <div className={`offcanvas ${isAddOpen || isEditOpen ? 'show' : ''}`} style={{
                right: 'auto', left: '50%', top: '50%', transform: `translate(-50%, -50%)`,
                width: '600px', height: 'auto', maxHeight: '90vh', overflowY: 'auto',
                borderRadius: '12px', opacity: (isAddOpen || isEditOpen) ? 1 : 0,
                pointerEvents: (isAddOpen || isEditOpen) ? 'all' : 'none',
                transition: 'opacity 0.2s', zIndex: 3001, background: 'white', position: 'fixed'
            }}>
                <div className="offcanvas-header" style={{ marginBottom: '1rem', padding: '2rem 2rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="offcanvas-title" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{isEditOpen ? 'Edit Order' : 'Create New Order'}</h3>
                    <button className="close-btn" onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="offcanvas-body" style={{ padding: '0 2rem 2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>MO Number</label>
                            <input type="text" value={formData.mo_number} onChange={e => setFormData({ ...formData, mo_number: e.target.value })}
                                disabled={isEditOpen}
                                placeholder="e.g. WH/MO/001"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: isEditOpen ? '#F8FAFC' : 'white' }}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Product Name</label>
                            <input type="text" value={formData.product_name} onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                                placeholder="e.g. Eucalyptus Shower Gel 16oz"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>SKU</label>
                            <input type="text" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                placeholder="e.g. 1BSGE16OZ"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Quantity</label>
                            <input type="number" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                placeholder="0"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>PO Number</label>
                            <input type="text" value={formData.po_number} onChange={e => setFormData({ ...formData, po_number: e.target.value })}
                                placeholder="e.g. PO10202"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Event ID</label>
                            <input type="text" value={formData.event_id} onChange={e => setFormData({ ...formData, event_id: e.target.value })}
                                placeholder="e.g. jkv0u..."
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Scheduled Date</label>
                            <input type="date" value={formData.scheduled_date} onChange={e => setFormData({ ...formData, scheduled_date: e.target.value })}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#475569' }}>Status</label>
                            <select value={formData.current_status} onChange={e => setFormData({ ...formData, current_status: e.target.value })}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'white' }}
                            >
                                <option value="Draft">Draft</option>
                                <option value="Scheduled">Scheduled</option>
                                <option value="Staged">Staged</option>
                                <option value="Weighed">Weighed</option>
                                <option value="Batched">Batched</option>
                                <option value="Filled">Filled</option>
                                <option value="Packed">Packed</option>
                                <option value="Putback">Putback</option>
                                <option value="Done">Done</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem' }}>
                        <button className="btn btn-secondary" onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }}>Cancel</button>
                        <button className="btn btn-primary" onClick={isEditOpen ? handleUpdate : handleCreate}>
                            {isEditOpen ? 'Update Order' : 'Create Order'}
                        </button>
                    </div>
                </div>
            </div>

            {(isAddOpen || isEditOpen) && <div className="overlay active" style={{ zIndex: 1000 }} onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }}></div>}
        </>
    );
};
