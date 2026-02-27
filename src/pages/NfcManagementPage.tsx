import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const NfcManagementPage: React.FC = () => {
    const [workers, setWorkers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');
    const [scannedTagId, setScannedTagId] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [statusMatch, setStatusMatch] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

    useEffect(() => {
        fetchWorkers();
    }, []);

    const fetchWorkers = async () => {
        setIsLoading(true);
        const { data } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'employee')
            .eq('active', true)
            .order('name', { ascending: true });
        if (data) setWorkers(data);
        setIsLoading(false);
    };

    const handleScan = async () => {
        if (!('NDEFReader' in window)) {
            setStatusMatch({ type: 'error', message: 'NFC is not supported on this device/browser.' });
            return;
        }

        try {
            setIsScanning(true);
            setStatusMatch({ type: 'info', message: 'Approach the NFC tag to the device...' });
            const reader = new (window as any).NDEFReader();
            await reader.scan();

            reader.onreading = ({ serialNumber }: any) => {
                setScannedTagId(serialNumber);
                setIsScanning(false);
                setStatusMatch({ type: 'success', message: `Tag Captured: ${serialNumber}` });
            };

            reader.onreadingerror = () => {
                setIsScanning(false);
                setStatusMatch({
                    type: 'error',
                    message: 'Tag detected but blocked. Use "NFC Tools" to write a Text record to this card first.'
                });
            };

        } catch (error) {
            console.error(error);
            setIsScanning(false);
            setStatusMatch({ type: 'error', message: 'NFC Scan failed: ' + error });
        }
    };

    const handleAssign = async () => {
        if (!selectedWorkerId || !scannedTagId) {
            setStatusMatch({ type: 'error', message: 'Please select a worker and scan a tag first.' });
            return;
        }

        const { error } = await (supabase
            .from('users') as any)
            .update({ nfc_id: scannedTagId })
            .eq('id', selectedWorkerId);

        if (error) {
            setStatusMatch({ type: 'error', message: 'Failed to assign tag: ' + error.message });
        } else {
            setStatusMatch({ type: 'success', message: 'Tag assigned successfully!' });
            setScannedTagId('');
            setSelectedWorkerId('');
            fetchWorkers();
        }
    };

    const clearStatus = () => setStatusMatch(null);

    return (
        <div className="nfc-management-page">
            <style dangerouslySetInnerHTML={{
                __html: `
                .nfc-management-page {
                    padding: 2rem;
                    max-width: 800px;
                    margin: 0 auto;
                }
                .nfc-card {
                    background: white;
                    border-radius: 16px;
                    padding: 2.5rem;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    border: 1px solid #E2E8F0;
                }
                .nfc-header {
                    margin-bottom: 2rem;
                }
                .nfc-header h1 {
                    font-size: 1.75rem;
                    font-weight: 800;
                    color: #1E293B;
                    margin: 0;
                }
                .nfc-header p {
                    color: #64748B;
                    margin-top: 0.5rem;
                }
                .form-section {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .input-group label {
                    font-weight: 700;
                    color: #1E293B;
                    font-size: 0.9rem;
                }
                .input-group select, .input-group input {
                    padding: 0.8rem 1rem;
                    border-radius: 10px;
                    border: 1.5px solid #E2E8F0;
                    font-size: 1rem;
                    outline: none;
                }
                .input-group select:focus, .input-group input:focus {
                    border-color: #2563EB;
                }
                .scan-box {
                    background: #F8FAFC;
                    border: 2px dashed #CBD5E1;
                    border-radius: 12px;
                    padding: 2rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .scan-box:hover {
                    background: #F1F5F9;
                    border-color: #2563EB;
                }
                .scan-box i {
                    font-size: 2.5rem;
                    color: #2563EB;
                }
                .btn-assign {
                    background: #111;
                    color: white;
                    border: none;
                    padding: 1rem;
                    border-radius: 10px;
                    font-weight: 700;
                    cursor: pointer;
                    font-size: 1rem;
                    margin-top: 1rem;
                }
                .btn-assign:disabled {
                    background: #94A3B8;
                    cursor: not-allowed;
                }
                .status-alert {
                    padding: 1rem;
                    border-radius: 10px;
                    margin-bottom: 1.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .status-success { background: #DCFCE7; color: #166534; border: 1px solid #BBF7D0; }
                .status-error { background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
                .status-info { background: #DBEAFE; color: #1E40AF; border: 1px solid #BFDBFE; }

                .workers-list {
                    margin-top: 3rem;
                }
                .workers-list h2 {
                    font-size: 1.25rem;
                    font-weight: 800;
                    margin-bottom: 1rem;
                }
                .worker-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 1rem;
                    background: white;
                    border: 1px solid #E2E8F0;
                    border-radius: 12px;
                    margin-bottom: 0.5rem;
                }
                .worker-nfc-id {
                    font-family: 'JetBrains Mono', monospace;
                    color: #2563EB;
                    font-weight: 600;
                }
            ` }} />

            <div className="nfc-card">
                <div className="nfc-header">
                    <h1>NFC Setup</h1>
                    <p>Assign a physical NFC tag to a worker for instant clock-in/out.</p>
                </div>

                {statusMatch && (
                    <div className={`status-alert status-${statusMatch.type}`}>
                        <span>{statusMatch.message}</span>
                        <button onClick={clearStatus} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}

                <div className="form-section">
                    <div className="input-group">
                        <label>1. Select Worker</label>
                        <select
                            value={selectedWorkerId}
                            onChange={(e) => setSelectedWorkerId(e.target.value)}
                        >
                            <option value="">Choose a worker...</option>
                            {workers.map(w => (
                                <option key={w.id} value={w.id}>{w.name} ({w.worker_id})</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label>2. Scan NFC Tag</label>
                        <div className="scan-box" onClick={handleScan}>
                            <i className={`fa-solid ${isScanning ? 'fa-spinner fa-spin' : 'fa-rss'}`}></i>
                            <span>{scannedTagId ? `TAG ID: ${scannedTagId}` : isScanning ? 'Listening...' : 'Click or Tap here to Scan Tag'}</span>
                        </div>
                        <input
                            type="text"
                            placeholder="Or type Tag ID manually"
                            value={scannedTagId}
                            onChange={(e) => setScannedTagId(e.target.value)}
                        />
                    </div>

                    <button
                        className="btn-assign"
                        onClick={handleAssign}
                        disabled={!selectedWorkerId || !scannedTagId}
                    >
                        Assign Tag to Worker
                    </button>
                </div>
            </div>

            <div className="workers-list">
                <h2>Currently Assigned Tags</h2>
                {isLoading ? <p>Loading...</p> : (
                    workers.filter(w => w.nfc_id).map(w => (
                        <div key={w.id} className="worker-item">
                            <div>
                                <strong>{w.name}</strong>
                                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>ID: {w.worker_id}</div>
                            </div>
                            <div className="worker-nfc-id">{w.nfc_id}</div>
                        </div>
                    ))
                )}
                {workers.filter(w => w.nfc_id).length === 0 && !isLoading && (
                    <p style={{ color: '#94A3B8', fontStyle: 'italic' }}>No workers have tags assigned yet.</p>
                )}
            </div>
        </div>
    );
};
