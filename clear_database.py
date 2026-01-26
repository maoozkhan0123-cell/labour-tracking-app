"""
Script to clear all data from Supabase database
WARNING: This will delete ALL data from the database!
"""
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

def delete_table_data(table_name):
    """Delete all rows from a table"""
    print(f"Deleting data from table: {table_name}")
    try:
        # Get all records
        response = supabase.table(table_name).select("id").execute()
        deleted = 0
        
        if response.data:
            # Delete all records
            ids = [row['id'] for row in response.data]
            for record_id in ids:
                supabase.table(table_name).delete().eq('id', record_id).execute()
                deleted += 1
        
        print(f"  ✓ Deleted {deleted} rows from {table_name}")
        return deleted
    except Exception as e:
        print(f"  ⚠️  Error deleting from {table_name}: {e}")
        return 0

def main():
    print("\n" + "="*50)
    print("DATABASE CLEANUP SCRIPT")
    print("="*50)
    print("\nWARNING: This will delete ALL data from Supabase!")
    
    response = input("\nAre you sure you want to continue? (yes/no): ")
    
    if response.lower() != 'yes':
        print("\n❌ Operation cancelled.")
        return
    
    print("\n🗑️  Starting database cleanup...\n")
    
    # List of tables to clear (order matters due to foreign keys)
    tables = ['breaks', 'tasks', 'manufacturing_orders', 'users', 'settings', 'operations']
    
    total_deleted = 0
    for table in tables:
        try:
            deleted = delete_table_data(table)
            total_deleted += deleted
        except Exception as e:
            print(f"  ⚠️  Error with {table}: {e}")
    
    print("\n" + "="*50)
    print(f"✅ Database cleanup complete!")
    print(f"Total rows deleted: {total_deleted}")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
