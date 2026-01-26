from flask_login import UserMixin
from datetime import datetime
from .supabase_client import get_supabase
import uuid
import pytz
from datetime import datetime

# Define PST timezone
PST = pytz.timezone('America/Los_Angeles')

def get_now_pst():
    return datetime.now(pytz.utc).astimezone(PST)


class User(UserMixin):
    def __init__(self, id, **kwargs):
        self.id = str(id)
        self.worker_id = kwargs.get('worker_id', '')
        self.username = kwargs.get('username', '')
        self.password = kwargs.get('password', '')
        self.role = kwargs.get('role', 'employee')
        self.name = kwargs.get('name', '')
        self.hourly_rate = float(kwargs.get('hourly_rate', 0.0) or 0.0)

    def to_dict(self):
        return {
            'id': self.id,
            'worker_id': self.worker_id,
            'username': self.username,
            'role': self.role,
            'name': self.name,
            'hourly_rate': self.hourly_rate
        }

    @staticmethod
    def get(user_id):
        if not user_id:
            return None
        supabase = get_supabase()
        if not supabase: return None
        
        response = supabase.table('users').select("*").eq("id", str(user_id)).execute()
        if response.data:
            data = response.data[0]
            return User(**data)
        return None

    @staticmethod
    def find_by_username(username):
        supabase = get_supabase()
        if not supabase: return None
        
        response = supabase.table('users').select("*").eq("username", username).execute()
        if response.data:
            data = response.data[0]
            return User(**data)
        return None


class Task:
    def __init__(self, id, **kwargs):
        self.id = str(id)
        self.description = kwargs.get('description', '')
        self.mo_reference = kwargs.get('mo_reference', 'N/A')
        self.assigned_to_id = str(kwargs.get('assigned_to_id', ''))
        self.status = kwargs.get('status', 'pending')
        self.hourly_rate = float(kwargs.get('hourly_rate', 0.0) or 0.0)
        self.manual = kwargs.get('manual', False)
        self.reason = kwargs.get('reason', '')
        self.active_seconds = int(kwargs.get('active_seconds', 0) or 0)
        self.break_seconds = int(kwargs.get('break_seconds', 0) or 0)
        self.total_duration_seconds = int(kwargs.get('total_duration_seconds', 0) or 0)

        # Helper to convert Supabase/ISO timestamps to naive PST datetimes
        def to_dt(val):
            if not val:
                return None
            if isinstance(val, (int, float)):
                dt = datetime.fromtimestamp(val, tz=pytz.utc)
                return dt.astimezone(PST).replace(tzinfo=None)
            if isinstance(val, str):
                try:
                    # Handle Supabase format which might have +00:00 or other offsets
                    # We want to convert to PST and then use naive for simplicity in templates
                    dt = datetime.fromisoformat(val.replace('Z', '+00:00'))
                    if dt.tzinfo is None:
                        dt = pytz.utc.localize(dt)
                    return dt.astimezone(PST).replace(tzinfo=None)
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
        supabase = get_supabase()
        if not supabase: return []
        
        response = supabase.table('tasks').select("*").order('created_at', desc=True).execute()
        return [Task(**doc) for doc in response.data]

    @staticmethod
    def get_by_employee(emp_id):
        supabase = get_supabase()
        if not supabase: return []
        
        response = supabase.table('tasks').select("*").eq('assigned_to_id', str(emp_id)).execute()
        tasks = [Task(**doc) for doc in response.data]
        return sorted(tasks, key=lambda x: x.created_at if x.created_at else datetime.min, reverse=True)

    def save(self):
        supabase = get_supabase()
        if not supabase: return
        
        data = self.to_dict()
        # Supabase uses 'id' for PK, if it doesn't exist it will insert, otherwise upsert
        # But we need to handle timestamps back to ISO
        supabase.table('tasks').upsert(data).execute()
