from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from .models import User, Task
from datetime import datetime
from firebase_admin import firestore
from .odoo_utils import odoo
import uuid

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    if current_user.is_authenticated:
        if current_user.role == 'manager':
            return redirect(url_for('main.manager_dashboard'))
        return redirect(url_for('main.employee_portal'))
    return redirect(url_for('main.login'))

@main_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        role = request.form.get('role')
        user = User.find_by_username(username)
        if user and user.password == password:
            if user.role != role:
                flash(f'User does not have {role} permissions')
            else:
                login_user(user)
                return redirect(url_for('main.index'))
        else:
            flash('Invalid credentials')
    return render_template('login.html')

@main_bp.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('main.login'))

# --- Manager Actions ---
@main_bp.route('/manager')
@login_required
def manager_dashboard():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
    
    db = firestore.client()
    # Get all employees
    employees_stream = db.collection('users').where('role', '==', 'employee').stream()
    employees = []
    for doc in employees_stream:
        data = doc.to_dict()
        employees.append(User(id=doc.id, **data))
        
    tasks = Task.get_all()
    
    person_summary = {}
    for emp in employees:
        emp_tasks = [t for t in tasks if t.assigned_to_id == emp.id]
        active_sec = sum(t.active_seconds for t in emp_tasks)
        break_sec = sum(t.break_seconds for t in emp_tasks)
        
        # Check current status in Firestore
        current_status_task = next((t for t in tasks if t.assigned_to_id == emp.id and t.status == 'active'), None)
        break_status_task = next((t for t in tasks if t.assigned_to_id == emp.id and t.status == 'break'), None)
        
        status = 'Free'
        current_job = ""
        current_mo = ""
        if current_status_task:
            status = 'Working'
            current_job = current_status_task.description
            current_mo = current_status_task.mo_reference
        elif break_status_task:
            status = 'On Break'
            current_job = break_status_task.description
            current_mo = break_status_task.mo_reference

        person_summary[emp.id] = {
            'active_sec': active_sec,
            'break_sec': break_sec,
            'total_sec': active_sec + break_sec,
            'total_earned': sum(t.amount_earned for t in emp_tasks),
            'status': status,
            'current_job': current_job,
            'current_mo': current_mo
        }
    
    return render_template('manager_dashboard.html', 
                          employees=employees, 
                          tasks=tasks, 
                          person_summary=person_summary)

@main_bp.route('/api/get_odoo_mos')
@login_required
def get_odoo_mos():
    try:
        search = request.args.get('search')
        mos = odoo.get_active_mo_list(search_query=search)
        return jsonify(mos)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@main_bp.route('/api/task/<task_id>/cancel', methods=['POST'])
@login_required
def cancel_task(task_id):
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    db = firestore.client()
    db.collection('tasks').document(task_id).update({
        'status': 'cancelled'
    })
    return jsonify({'success': True})

@main_bp.route('/api/assign_task', methods=['POST'])
@login_required
def assign_task():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    db = firestore.client()
    
    assignments = data.get('assignments', [])
    description = data.get('description')
    mo_ref = data.get('mo_reference', 'N/A')

    if not assignments:
        return jsonify({'error': 'No employees selected'}), 400

    batch = db.batch()
    for assign in assignments:
        task_id = str(uuid.uuid4())
        task_ref = db.collection('tasks').document(task_id)
        
        try:
            rate = float(assign.get('hourly_rate')) if assign.get('hourly_rate') else 0.0
        except:
            rate = 0.0
            
        task_data = {
            'description': description,
            'mo_reference': mo_ref,
            'assigned_to_id': assign['employee_id'],
            'hourly_rate': rate,
            'status': 'pending',
            'active_seconds': 0,
            'break_seconds': 0,
            'total_duration_seconds': 0,
            'created_at': firestore.SERVER_TIMESTAMP
        }
        batch.set(task_ref, task_data)
    
    batch.commit()
    return jsonify({'success': True})

# --- Employee Actions ---
@main_bp.route('/employee')
@login_required
def employee_portal():
    if current_user.role != 'employee':
        return redirect(url_for('main.index'))
    tasks = Task.get_by_employee(current_user.id)
    return render_template('employee_portal.html', tasks=tasks)

@main_bp.route('/api/task/<task_id>/action', methods=['POST'])
@login_required
def task_action(task_id):
    data = request.get_json()
    action = data.get('action') 
    db = firestore.client()
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()
    
    if not task_doc.exists:
        return jsonify({'error': 'Task not found'}), 404
        
    task_data = task_doc.to_dict()
    now = datetime.utcnow()
    
    updates = {}
    
    if action == 'start':
        updates['status'] = 'active'
        updates['start_time'] = now
        updates['last_action_time'] = now
    elif action == 'break':
        if task_data.get('status') == 'active' and task_data.get('last_action_time'):
            last_action_time = task_data['last_action_time']
            if not isinstance(last_action_time, datetime): # In case it's a Firestore timestamp objects
                 last_action_time = last_action_time.replace(tzinfo=None)
            diff = now - last_action_time
            new_active_sec = task_data.get('active_seconds', 0) + int(diff.total_seconds())
            updates['active_seconds'] = new_active_sec
        
        updates['status'] = 'break'
        updates['last_action_time'] = now
        # Sub-collection for breaks
        task_ref.collection('breaks').add({
            'reason': data.get('reason', 'Break'),
            'start_time': now
        })
    elif action == 'resume':
        if task_data.get('status') == 'break' and task_data.get('last_action_time'):
            last_action_time = task_data['last_action_time']
            if not isinstance(last_action_time, datetime):
                 last_action_time = last_action_time.replace(tzinfo=None)
            diff = now - last_action_time
            new_break_sec = task_data.get('break_seconds', 0) + int(diff.total_seconds())
            updates['break_seconds'] = new_break_sec
            
            # Close the last break
            breaks_query = task_ref.collection('breaks').order_by('start_time', direction=firestore.Query.DESCENDING).limit(1).stream()
            for b in breaks_query:
                b.reference.update({'end_time': now})

        updates['status'] = 'active'
        updates['last_action_time'] = now
    elif action == 'complete':
        if task_data.get('last_action_time'):
            last_action_time = task_data['last_action_time']
            if not isinstance(last_action_time, datetime):
                 last_action_time = last_action_time.replace(tzinfo=None)
            diff = now - last_action_time
            if task_data.get('status') == 'active':
                updates['active_seconds'] = task_data.get('active_seconds', 0) + int(diff.total_seconds())
            elif task_data.get('status') == 'break':
                updates['break_seconds'] = task_data.get('break_seconds', 0) + int(diff.total_seconds())
        
        updates['status'] = 'completed'
        updates['end_time'] = now
        start_time = task_data.get('start_time')
        if start_time:
            if not isinstance(start_time, datetime):
                 start_time = start_time.replace(tzinfo=None)
            total_diff = now - start_time
            updates['total_duration_seconds'] = int(total_diff.total_seconds())

    task_ref.update(updates)
    return jsonify({'success': True})

@main_bp.route('/api/update_employee_rate', methods=['POST'])
@login_required
def update_employee_rate():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    db = firestore.client()
    db.collection('users').document(data['employee_id']).update({
        'hourly_rate': float(data['hourly_rate'])
    })
    return jsonify({'success': True})

@main_bp.route('/api/hire_employee', methods=['POST'])
@login_required
def hire_employee():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    db = firestore.client()
    
    username = data.get('username')
    name = data.get('name')
    password = data.get('password')
    hourly_rate = float(data.get('hourly_rate', 0.0))

    if User.find_by_username(username):
        return jsonify({'error': 'Username already exists'}), 400

    user_id = str(uuid.uuid4())
    db.collection('users').document(user_id).set({
        'username': username,
        'name': name,
        'password': password,
        'role': 'employee',
        'hourly_rate': hourly_rate
    })
    return jsonify({'success': True})
