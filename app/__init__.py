from flask import Flask
from .models import db, User
from flask_login import LoginManager
import os

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-123')
    
    # Use /tmp for SQLite in Vercel or a persistent DB if defined in env
    database_uri = os.environ.get('DATABASE_URL')
    if database_uri and database_uri.startswith("postgres://"):
        database_uri = database_uri.replace("postgres://", "postgresql://", 1)
    
    app.config['SQLALCHEMY_DATABASE_URI'] = database_uri or 'sqlite:///app_v5.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    
    login_manager = LoginManager()
    login_manager.login_view = 'main.login'
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    from .routes import main_bp
    app.register_blueprint(main_bp)

    with app.app_context():
        db.create_all()
        # Create default users if not exists
        if not User.query.filter_by(username='admin').first():
            admin = User(username='admin', password='123', role='manager', name='Main Manager')
            db.session.add(admin)
            
            # Sample Employees
            emp1 = User(username='emp1', password='123', role='employee', name='John Employee', hourly_rate=25.0)
            emp2 = User(username='emp2', password='123', role='employee', name='Jane Worker', hourly_rate=30.0)
            db.session.add_all([emp1, emp2])
            db.session.commit()

    return app
