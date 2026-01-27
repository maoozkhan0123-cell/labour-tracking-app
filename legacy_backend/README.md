# Labour Tracker Portal

A premium, minimalistic labor tracking and payroll management system. This application allows managers to dispatch workflows (tasks) to employees, track work/break time with high precision, and calculate earned pay in real-time.

## 🚀 Key Features

- **Real-Time Tracking**: High-precision timers for active work and non-active (break) periods.
- **Live Earnings**: Instant calculation of pay based on active work time and assigned hourly rates.
- **Production Control Matrix**: Interactive grid for assigning workers to specific manufacturing orders and operations.
- **Interactive Dashboard**: Real-time monitoring of employee activities and performance.
- **Worker Management**: Integrated module for onboarding new employees with custom rates.
- **Premium UI**: Clean, modern interface with smooth animations and sidebar navigation.

## 🛠️ Technology Stack

- **Backend**: Python / Flask
- **Database**: Supabase (PostgreSQL)
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

3. **Configure Environment**:
   Create a `.env` file based on `.env.example` and provide your Supabase credentials.
   See `SUPABASE_MIGRATION.md` for detailed setup instructions.

4. **Run the application**:
   ```bash
   python run.py
   ```
   The app will be available at `http://localhost:8001`.

### Default Credentials
- **Admin**: `admin` / `123`

## ☁️ Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the root directory.
3. Configure `SUPABASE_URL` and `SUPABASE_KEY` as environment variables in the Vercel dashboard.

## 🧱 Project Structure

- `app/`: Core application logic (models, routes, templates).
- `static/`: CSS and styling assets.
- `index.py`: Entry point for Vercel deployment.
- `vercel.json`: Vercel configuration for Python runtime.

## 📄 License
All rights reserved.
