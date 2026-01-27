# Firebase to Supabase Migration Guide

## Overview
This application has been migrated from Firebase Firestore to Supabase PostgreSQL.

## Migration Steps

### 1. Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key

### 2. Set Up the Database Schema
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the SQL script from `supabase_schema.sql`

This will create the following tables:
- `users` - User accounts (managers and employees)
- `manufacturing_orders` - Manufacturing orders
- `settings` - Application settings (stored as JSONB)
- `tasks` - Work tasks assigned to employees
- `breaks` - Break records for tasks

### 3. Configure Environment Variables
1. Copy `.env.example` to `.env`
2. Fill in your Supabase credentials:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key-here
   SECRET_KEY=your-secret-key
   ```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Run the Application
```bash
python run.py
```

## Key Changes

### Database Structure
- **Firebase Collections** → **Supabase Tables**
  - `users` collection → `users` table
  - `tasks` collection → `tasks` table
  - `manufacturing_orders` collection → `manufacturing_orders` table
  - `settings/operations` document → `settings` table with key='operations'
  - `tasks/{id}/breaks` subcollection → `breaks` table with `task_id` foreign key

### Data Types
- Firebase Timestamps → PostgreSQL TIMESTAMPTZ (stored as ISO strings)
- Firebase Document IDs → PostgreSQL UUIDs
- Firebase nested documents → PostgreSQL JSONB fields

### Code Changes
- `firebase_admin` → `supabase` client
- `firestore.client()` → `get_supabase()`
- `.collection().document()` → `.table().select/insert/update/delete()`
- `.where('field', '==', value)` → `.eq('field', value)`
- `.order_by()` → `.order()`
- Batch operations → Individual inserts with arrays

## Initial Data
The application will automatically create initial users on first run:
- **Admin**: username=`admin`, password=`123`
- **Employee 1**: username=`emp1`, password=`123`
- **Employee 2**: username=`emp2`, password=`123`

## Files Removed
You can safely delete these Firebase-related files:
- `firebase-key.json` (if it exists)

## Files Created
- `supabase_schema.sql` - Database schema for Supabase
- `app/supabase_client.py` - Supabase client initialization
- `.env.example` - Environment variables template

## Troubleshooting

### Connection Issues
- Verify your `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check that your Supabase project is active
- Ensure your IP is allowed in Supabase project settings

### Schema Issues
- Make sure you've run the `supabase_schema.sql` script
- Check table names match exactly (case-sensitive)
- Verify foreign key constraints are in place

### Data Migration
If you have existing Firebase data to migrate:
1. Export data from Firebase
2. Transform the data format (timestamps, IDs)
3. Import into Supabase using the SQL editor or API

## Support
For issues, check the Supabase documentation: https://supabase.com/docs
