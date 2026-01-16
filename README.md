# Babylon LLC Labor Tracker Portal

A premium, minimalistic labor tracking and payroll management system built for **Babylon LLC**. This application allows managers to dispatch workflows (tasks) to employees, track work/break time with high precision, and calculate earned pay in real-time.

![Babylon Branding](https://babylonllc.com/wp-content/uploads/2021/08/Babylon-Logo-White.png)

## 🚀 Key Features

- **Dual-Portal Access**: Dedicated interfaces for Admins (Managers) and Employees.
- **Real-Time Tracking**: High-precision timers for active work and non-active (break) periods.
- **Live Earnings**: Instant calculation of pay based on active work time and assigned hourly rates.
- **Group Assignments**: Managers can assign a single task to multiple employees simultaneously.
- **Interactive Dashboard**: Expandable employee cards showing detailed task history and performance.
- **Hiring System**: Integrated module for onboarding new employees with custom rates.
- **Premium UI**: Clean, white-themed interface with Babylon Navy and Gold branding.

## 🛠️ Technology Stack

- **Backend**: Python / Flask
- **Database**: SQLite (Local) / PostgreSQL (Optional Cloud)
- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System), JavaScript (ES6+)
- **Icons**: Font Awesome 6
- **Deployment**: Optimized for Vercel

## 📦 Setup & Installation

### Local Development
1. **Clone the repository**:
   ```bash
   git clone https://github.com/HananBajwa12/Labour-Tracker-app.git
   cd Labour-Tracker-app
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**:
   ```bash
   python run.py
   ```
   The app will be available at `http://localhost:8001`.

### Default Credentials
- **Admin**: `admin` / `123`
- **Employees**: `emp1` / `123`, `emp2` / `123`

## ☁️ Vercel Deployment

This project is pre-configured for Vercel.

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the root directory.
3. Follow the prompts to deploy.

**Note on Database**: Since Vercel is serverless, the local SQLite database will restart on every deployment. For persistent storage, connect a PostgreSQL database via environment variables (`DATABASE_URL`).

## 🧱 Project Structure

- `app/`: Core application logic (models, routes, templates).
- `static/`: CSS and styling assets.
- `index.py`: Entry point for Vercel deployment.
- `vercel.json`: Vercel configuration for Python runtime.

## 📄 License
Custom built for Babylon LLC. All rights reserved.
