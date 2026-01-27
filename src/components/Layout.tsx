import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC = () => {
    const { user, loading } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(true);

    if (loading) return <div className="loading-screen">Authenticating...</div>;
    if (!user) return <Navigate to="/login" replace />;

    return (
        <div className="app-container">
            <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
            <main className={`main-content ${isCollapsed ? 'expanded' : ''}`}>
                <Outlet />
            </main>
        </div>
    );
};
