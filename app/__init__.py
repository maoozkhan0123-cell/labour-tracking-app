from flask import Flask
from flask_login import LoginManager
import os
import firebase_admin
from firebase_admin import credentials, firestore


def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-123')

    # Initialize Firebase
    if not firebase_admin._apps:
        cred = None
        key_path = os.path.join(app.root_path, '..', 'firebase-key.json')

        # 1. Try local file
        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
        else:
            # 2. Try Environment Variable
            config = os.environ.get('FIREBASE_CONFIG')
            if config:
                import json
                try:
                    cred_dict = json.loads(config)
                    cred = credentials.Certificate(cred_dict)
                except Exception as e:
                    print(f"Error parsing FIREBASE_CONFIG: {e}")

        if cred:
            firebase_admin.initialize_app(cred)
        else:
            # 3. Fallback to default (usually for local dev with
            # GOOGLE_APPLICATION_CREDENTIALS)
            try:
                firebase_admin.initialize_app()
            except Exception as e:
                print(f"Firebase Default Initialization Failed: {e}")
                # If we're here, firestore.client() will fail later,
                # but we've handled the crash here

    db = firestore.client()

    from .models import User

    login_manager = LoginManager()
    login_manager.login_view = 'main.login'
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return User.get(user_id)

    from .routes import main_bp
    app.register_blueprint(main_bp)

    # Simplified data initialization for Firestore
    admin_ref = db.collection('users').document('admin')
    if not admin_ref.get().exists:
        admin_ref.set({
            'username': 'admin',
            'password': '123',
            'role': 'manager',
            'name': 'Main Manager',
            'hourly_rate': 0.0
        })

        db.collection('users').document('emp1').set({
            'username': 'emp1',
            'password': '123',
            'role': 'employee',
            'name': 'John Employee',
            'hourly_rate': 25.0
        })
        db.collection('users').document('emp2').set({
            'username': 'emp2',
            'password': '123',
            'role': 'employee',
            'name': 'Jane Worker',
            'hourly_rate': 30.0
        })

    return app
