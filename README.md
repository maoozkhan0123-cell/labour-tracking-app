# Odoo Labor Tracker

A custom interface to connect Odoo's high-level Manufacturing Orders (MO) with granular, task-level labor tracking.

## Objectives
- **Fetch**: Pull "Confirmed" MOs and Work Orders from Odoo.
- **Action**: Manager assigns laborers; Laborers start/stop timers on specific tasks.
- **Sync**: Push Timesheet Entries (`account.analytic.line`) back to Odoo upon completion.

## Tech Stack
- **Backend**: Python (Flask)
- **Frontend**: HTML5, CSS3 (Custom Glassmorphism Design), JavaScript (Vanilla)
- **Integration**: Odoo XML-RPC API

## Setup
1. Install dependencies: `pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and fill in your Odoo credentials.
3. Run the app: `python run.py`

## Features
- Manager Dashboard: View active MOs, Assign tasks.
- Labor Interface: Big Timer, Start/Stop buttons.
- Odoo Sync: Automatic updates to `account.analytic.line`.

