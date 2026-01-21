"""
Script to clear all data from Firestore database
WARNING: This will delete ALL data from the database!
"""
import firebase_admin
from firebase_admin import credentials, firestore
import os

# Initialize Firebase
cred_path = os.path.join(os.path.dirname(__file__), 'firebase-key.json')
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def delete_collection(collection_name):
    """Delete all documents in a collection"""
    print(f"Deleting collection: {collection_name}")
    docs = db.collection(collection_name).stream()
    deleted = 0
    
    for doc in docs:
        doc.reference.delete()
        deleted += 1
    
    print(f"  ✓ Deleted {deleted} documents from {collection_name}")
    return deleted

def main():
    print("\n" + "="*50)
    print("DATABASE CLEANUP SCRIPT")
    print("="*50)
    print("\nWARNING: This will delete ALL data from Firestore!")
    
    response = input("\nAre you sure you want to continue? (yes/no): ")
    
    if response.lower() != 'yes':
        print("\n❌ Operation cancelled.")
        return
    
    print("\n🗑️  Starting database cleanup...\n")
    
    # List of collections to clear
    collections = ['tasks', 'users', 'manufacturing_orders', 'operations']
    
    total_deleted = 0
    for collection in collections:
        try:
            deleted = delete_collection(collection)
            total_deleted += deleted
        except Exception as e:
            print(f"  ⚠️  Error deleting {collection}: {e}")
    
    print("\n" + "="*50)
    print(f"✅ Database cleanup complete!")
    print(f"Total documents deleted: {total_deleted}")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
