from flask_login import UserMixin
from datetime import datetime
from firebase_admin import firestore


class User(UserMixin):
    def __init__(self, id, **kwargs):
        self.id = id
        self.username = kwargs.get('username', '')
        self.password = kwargs.get('password', '')
        self.role = kwargs.get('role', 'employee')
        self.name = kwargs.get('name', '')
        self.hourly_rate = kwargs.get('hourly_rate', 0.0)

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
    def __init__(self, id, **kwargs):
        self.id = id
        self.description = kwargs.get('description', '')
        self.mo_reference = kwargs.get('mo_reference', 'N/A')
        self.assigned_to_id = kwargs.get('assigned_to_id', '')
        self.status = kwargs.get('status', 'pending')
        self.hourly_rate = kwargs.get('hourly_rate', 0.0)
        self.manual = kwargs.get('manual', False)
        self.reason = kwargs.get('reason', '')
        self.active_seconds = kwargs.get('active_seconds', 0)
        self.break_seconds = kwargs.get('break_seconds', 0)
        self.total_duration_seconds = kwargs.get('total_duration_seconds', 0)

        # Helper to convert Firestore timestamps to naive UTC datetimes
        def to_dt(val):
            if not val:
                return None
            if hasattr(val, 'to_datetime'):
                return val.to_datetime().replace(tzinfo=None)
            if isinstance(val, (int, float)):
                return datetime.fromtimestamp(val)
            if isinstance(val, str):
                try:
                    return datetime.fromisoformat(val.replace('Z', ''))
                except Exception:
                    return None
            return val

        self.start_time = to_dt(kwargs.get('start_time'))
        self.last_action_time = to_dt(kwargs.get('last_action_time'))
        self.end_time = to_dt(kwargs.get('end_time'))
        self.created_at = to_dt(kwargs.get('created_at'))

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
