import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login, user } = useAuth();

    if (user) return <Navigate to="/" replace />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const success = await login(username, password);
        if (!success) {
            setError('Invalid username or password');
        }
    };

    return (
        <div className="login-body-wrapper">
            <style dangerouslySetInnerHTML={{
                __html: `
                :root {
                    --babylon-navy: #262661;
                    --babylon-gold: #EDAD2F;
                }

                .login-body-wrapper {
                    background-color: #ffffff;
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: 'Poppins', sans-serif;
                    color: var(--babylon-navy);
                    overflow-y: auto;
                    position: fixed;
                    top: 0;
                    left: 0;
                    z-index: 10000;
                }

                .login-card {
                    width: 100%;
                    max-width: 400px;
                    padding: 2rem;
                    text-align: center;
                }

                .logo-container {
                    margin-bottom: 2rem;
                }

                .logo-container img {
                    width: 140px;
                    height: auto;
                    object-fit: contain;
                }

                .login-heading {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: 2rem;
                    color: var(--babylon-navy);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .login-form {
                    text-align: left;
                }

                .input-group {
                    margin-bottom: 1.2rem;
                    position: relative;
                }

                .input-group input {
                    width: 100%;
                    background: #fdfdfd;
                    border: 1px solid #eeeeee;
                    border-radius: 12px;
                    padding: 0.9rem 1.2rem;
                    color: var(--babylon-navy);
                    font-size: 0.9rem;
                    outline: none;
                    transition: all 0.3s ease;
                    box-sizing: border-box;
                }

                .input-group input:focus {
                    border-color: var(--babylon-gold);
                    background: white;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
                }

                .password-toggle {
                    position: absolute;
                    right: 1.2rem;
                    top: 50%;
                    transform: translateY(-50%);
                    cursor: pointer;
                    font-size: 1.1rem;
                    color: var(--babylon-gold);
                    opacity: 0.8;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                }

                .password-toggle:hover {
                    opacity: 1;
                    transform: translateY(-50%) scale(1.1);
                }

                .forgot-password {
                    display: block;
                    text-align: right;
                    font-size: 0.75rem;
                    color: #7f8c8d;
                    text-decoration: none;
                    margin-top: -0.8rem;
                    margin-bottom: 1.5rem;
                    font-weight: 500;
                    transition: color 0.3s;
                }

                .forgot-password:hover {
                    color: var(--babylon-gold);
                }

                .submit-btn {
                    width: 100%;
                    background: var(--babylon-navy);
                    border: none;
                    border-radius: 12px;
                    padding: 1rem;
                    color: white;
                    font-size: 0.95rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    cursor: pointer;
                    transition: all 0.3s;
                    margin-top: 0.5rem;
                    box-shadow: 0 10px 20px rgba(27, 27, 75, 0.15);
                }

                .submit-btn:hover {
                    background: var(--babylon-gold);
                    color: var(--babylon-navy);
                    transform: translateY(-2px);
                    box-shadow: 0 15px 30px rgba(237, 173, 47, 0.25);
                }

                .error-message {
                    background: #fff5f5;
                    color: #d63031;
                    padding: 0.8rem 1rem;
                    border-radius: 10px;
                    font-size: 0.8rem;
                    border: 1px solid #feb2b2;
                    margin-bottom: 1.5rem;
                    text-align: center;
                }
            ` }} />
            <div className="login-card">
                <div className="logo-container">
                    <img src="/babylon.svg" alt="Babylon Logo" />
                </div>

                <h1 className="login-heading">Babylon</h1>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit} className="login-form">
                    <h2
                        style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2rem', textAlign: 'center' }}>
                        System Login</h2>

                    <div className="input-group">
                        <input type="text" name="username" required placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                    </div>
                    <div className="input-group">
                        <input type={showPassword ? "text" : "password"} name="password" required placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                        <span className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                            <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                        </span>
                    </div>

                    <a href="#" className="forgot-password">Forgot Password?</a>

                    <button type="submit" className="submit-btn" style={{ borderRadius: '99px' }}>
                        Login
                    </button>
                </form>
            </div>
        </div>
    );
};
