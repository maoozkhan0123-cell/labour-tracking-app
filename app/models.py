from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime

db = SQLAlchemy()

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False) # 'manager' or 'employee'
    name = db.Column(db.String(100))
    hourly_rate = db.Column(db.Float, default=0.0)

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.String(200), nullable=False)
    mo_reference = db.Column(db.String(50))
    assigned_to_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    status = db.Column(db.String(20), default='pending') # 'pending', 'active', 'break', 'completed'
    hourly_rate = db.Column(db.Float, default=0.0)
    start_time = db.Column(db.DateTime)
    last_action_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    active_seconds = db.Column(db.Integer, default=0)
    break_seconds = db.Column(db.Integer, default=0)
    total_duration_seconds = db.Column(db.Integer, default=0)
    
    assigned_to = db.relationship('User', foreign_keys=[assigned_to_id])
    breaks = db.relationship('Break', backref='task', lazy=True)

    @property
    def amount_earned(self):
        return (self.active_seconds / 3600.0) * self.hourly_rate

class Break(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'))
    reason = db.Column(db.String(200))
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    end_time = db.Column(db.DateTime)
