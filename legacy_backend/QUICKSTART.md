# Quick Start Guide - Supabase Setup

## Step 1: Create Supabase Project (5 minutes)

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign in with GitHub
4. Click "New Project"
5. Fill in:
   - **Name**: labour-tracker (or your choice)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to you
6. Click "Create new project"
7. Wait 2-3 minutes for project to initialize

## Step 2: Set Up Database Schema (2 minutes)

1. In your Supabase project dashboard, click **SQL Editor** (left sidebar)
2. Click **New query**
3. Copy the entire contents of `supabase_schema.sql`
4. Paste into the SQL editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see "Success. No rows returned"

## Step 3: Get Your Credentials (1 minute)

1. Click **Settings** (gear icon in left sidebar)
2. Click **API** in the settings menu
3. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

## Step 4: Configure Your App (2 minutes)

1. In your project folder, create a file named `.env`
2. Add these lines (replace with your actual values):
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-anon-public-key-here
   SECRET_KEY=any-random-string-for-flask
   ```
3. Save the file

## Step 5: Install Dependencies (1 minute)

Open terminal in your project folder and run:
```bash
pip install -r requirements.txt
```

## Step 6: Run Your App (1 minute)

```bash
python run.py
```

You should see:
```
* Running on http://127.0.0.1:8001
```

## Step 7: Test It! (2 minutes)

1. Open browser to http://localhost:8001
2. Login with:
   - **Username**: admin
   - **Password**: 123
3. You should see the dashboard!

## Verify Database

Go back to Supabase dashboard:
1. Click **Table Editor** (left sidebar)
2. Click **users** table
3. You should see 3 users (admin, emp1, emp2)

---

## Troubleshooting

### "Error: SUPABASE_URL or SUPABASE_KEY not found"
- Make sure `.env` file is in the root folder
- Check that variable names are exactly: `SUPABASE_URL` and `SUPABASE_KEY`
- No quotes needed around values

### "Connection refused" or "Network error"
- Check your internet connection
- Verify the SUPABASE_URL is correct
- Make sure your Supabase project is active (not paused)

### "relation does not exist" errors
- You didn't run the schema SQL
- Go back to Step 2 and run `supabase_schema.sql`

### No users showing up
- The app creates initial users on first run
- Restart the app: stop it (Ctrl+C) and run `python run.py` again
- Check Supabase Table Editor → users table

### Import errors
- Make sure you ran `pip install -r requirements.txt`
- Try: `pip install supabase python-dotenv flask flask-login`

---

## Next Steps

✅ Your app is now running on Supabase!

**What to do next:**
1. Change the default passwords (admin/123)
2. Add your employees in the Workers section
3. Create manufacturing orders
4. Set up your operations
5. Start tracking labor!

**Optional:**
- Set up Row Level Security (RLS) in Supabase for production
- Configure custom domain
- Set up automated backups
- Deploy to Vercel or other hosting

---

**Need help?** Check `SUPABASE_MIGRATION.md` for detailed documentation.
