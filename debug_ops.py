
import firebase_admin
from firebase_admin import credentials, firestore
import os

if not firebase_admin._apps:
    try:
        cred = credentials.Certificate('firebase-key.json')
        firebase_admin.initialize_app(cred)
    except:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)

db = firestore.client()
doc = db.collection('settings').document('operations').get()

if doc.exists:
    data = doc.to_dict()
    ops = data.get('list', [])
    print(f"Count: {len(ops)}")
    for op in ops:
        print(f"ID: {op.get('id')} ({type(op.get('id'))}), Name: {op.get('name')}")
else:
    print("Document not found")
