import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Initialize Supabase
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_KEY not found in environment variables.")
    exit(1)

supabase: Client = create_client(url, key)

# Get operations from settings table
response = supabase.table('settings').select("*").eq('key', 'operations').execute()

if response.data:
    data = response.data[0]
    ops = data.get('value', {}).get('list', [])
    print(f"Count: {len(ops)}")
    for op in ops:
        print(f"ID: {op.get('id')} ({type(op.get('id'))}), Name: {op.get('name')}")
else:
    print("Operations not found in settings")
