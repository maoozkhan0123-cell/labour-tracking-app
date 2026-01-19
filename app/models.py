from flask_login import UserMixin
from datetime import datetime
from firebase_admin import firestore


class User(UserMixin):
    def __init__(self, id, username, password, role, name, hourly_rate):
        self.id = id
        self.username = username
        self.password = password
        self.role = role
        self.name = name
        self.hourly_rate = hourly_rate

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'role': self.role,
            'name': self.name,
            'hourly_rate': self.hourly_rate
        }

    @staticmethod
    def get(user_id):
        if not user_id:
            return None
        db = firestore.client()
        user_doc = db.collection('users').document(str(user_id)).get()
        if user_doc.exists:
            data = user_doc.to_dict()
            return User(id=user_doc.id, **data)
        return None

    @staticmethod
    def find_by_username(username):
        db = firestore.client()
        users = db.collection('users').where('username', '==', username).stream()
        for user in users:
            data = user.to_dict()
            return User(id=user.id, **data)
        return None

class Task:
    def __init__(self, id, description, mo_reference, assigned_to_id, status, hourly_rate, 
                 start_time=None, last_action_time=None, end_time=None, 
                 active_seconds=0, break_seconds=0, total_duration_seconds=0, created_at=None, **kwargs):
        self.id = id
        self.description = description
        self.mo_reference = mo_reference
        self.assigned_to_id = assigned_to_id
        self.status = status
        self.hourly_rate = hourly_rate
        self.manual = kwargs.get('manual', False)
        self.reason = kwargs.get('reason', '')
        
        # Helper to convert Firestore timestamps to naive UTC datetimes
        def to_dt(val):
            if val and hasattr(val, 'to_datetime'):
                return val.to_datetime().replace(tzinfo=None)
            if isinstance(val, str):
                try: return datetime.fromisoformat(val.replace('Z', ''))
                except: return val
            return val

        self.start_time = to_dt(start_time)
        self.last_action_time = to_dt(last_action_time)
        self.end_time = to_dt(end_time)
        self.active_seconds = active_seconds
        self.break_seconds = break_seconds
        self.total_duration_seconds = total_duration_seconds
        self.created_at = to_dt(created_at)

    def to_dict(self):
        def dt_to_str(dt):
            return dt.isoformat() if isinstance(dt, datetime) else dt

        return {
            'id': self.id,
            'description': self.description,
            'mo_reference': self.mo_reference,
            'assigned_to_id': self.assigned_to_id,
            'status': self.status,
            'hourly_rate': self.hourly_rate,
            'start_time': dt_to_str(self.start_time),
            'last_action_time': dt_to_str(self.last_action_time),
            'end_time': dt_to_str(self.end_time),
            'active_seconds': self.active_seconds,
            'break_seconds': self.break_seconds,
            'total_duration_seconds': self.total_duration_seconds,
            'manual': self.manual,
            'reason': self.reason,
            'created_at': dt_to_str(self.created_at)
        }

    @property
    def amount_earned(self):
        return (self.active_seconds / 3600.0) * self.hourly_rate

    @staticmethod
    def get_all():
        db = firestore.client()
        tasks_stream = db.collection('tasks').order_by('created_at', direction=firestore.Query.DESCENDING).stream()
        return [Task(id=doc.id, **doc.to_dict()) for doc in tasks_stream]

    @staticmethod
    def get_by_employee(emp_id):
        db = firestore.client()
        tasks_stream = db.collection('tasks').where('assigned_to_id', '==', str(emp_id)).stream()
        tasks = [Task(id=doc.id, **doc.to_dict()) for doc in tasks_stream]
        return sorted(tasks, key=lambda x: x.created_at if x.created_at else datetime.min, reverse=True)

    def save(self):
        db = firestore.client()
        data = self.to_dict()
        task_id = data.pop('id', self.id)
        db.collection('tasks').document(task_id).set(data)
