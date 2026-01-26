from flask import Flask
from flask_login import LoginManager
import os
import json
from dotenv import load_dotenv
from .supabase_client import get_supabase

load_dotenv()


def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-123')

    supabase = get_supabase()

    from .models import User

    login_manager = LoginManager()
    login_manager.login_view = 'main.login'
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return User.get(user_id)

    from .routes import main_bp
    app.register_blueprint(main_bp)

    # Initial data for Supabase if users table is empty
    if supabase:
        try:
            response = supabase.table('users').select("id").eq("username", "admin").execute()
            if not response.data:
                supabase.table('users').insert({
                    'username': 'admin',
                    'worker_id': 'M-001',
                    'password': '123',
                    'role': 'manager',
                    'name': 'Main Manager',
                    'hourly_rate': 0.0
                }).execute()

                supabase.table('users').insert([
                    {
                        'username': 'emp1',
                        'worker_id': 'W-101',
                        'password': '123',
                        'role': 'employee',
                        'name': 'John Employee',
                        'hourly_rate': 25.0
                    },
                    {
                        'username': 'emp2',
                        'worker_id': 'W-102',
                        'password': '123',
                        'role': 'employee',
                        'name': 'Jane Worker',
                        'hourly_rate': 30.0
                    }
                ]).execute()
        except Exception as e:
            print(f"Error initializing initial data in Supabase: {e}")

    return app
