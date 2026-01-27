import React from 'react';

export const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
    <div className="page">
        <div className="page-header">
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">This page is being migrated to React + TypeScript.</p>
        </div>
        <div className="card">
            <p className="text-muted">Migrating functionality from Flask templates...</p>
        </div>
    </div>
);
