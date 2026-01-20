from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from .models import User, Task
from datetime import datetime
from firebase_admin import firestore
import uuid

main_bp = Blueprint('main', __name__)

def get_person_summary(employees, tasks):
    person_summary = {}
    now = datetime.utcnow()

    def to_naive(dt):
        if not dt:
            return now
        if hasattr(dt, 'to_datetime'):
            return dt.to_datetime().replace(tzinfo=None)
        if isinstance(dt, datetime):
            return dt.replace(tzinfo=None)
        return dt

    for emp in employees:
        emp_tasks = [t for t in tasks if t.assigned_to_id == emp.id]
        active_sec = sum(t.active_seconds or 0 for t in emp_tasks)
        break_sec = sum(t.break_seconds or 0 for t in emp_tasks)

        # Check current status
        current_status_task = next((t for t in tasks if t.assigned_to_id == emp.id and t.status == 'active'), None)
        break_status_task = next((t for t in tasks if t.assigned_to_id == emp.id and t.status == 'break'), None)

        # Live calculations
        current_active = active_sec
        current_break = break_sec

        status = 'Free'
        current_job = ""
        current_mo = ""

        if current_status_task:
            status = 'Working'
            current_job = current_status_task.description
            current_mo = current_status_task.mo_reference
            last_act = to_naive(current_status_task.last_action_time)
            diff = (now - last_act).total_seconds()
            current_active += int(max(0, diff))
        elif break_status_task:
            status = 'On Break'
            current_job = break_status_task.description
            current_mo = break_status_task.mo_reference
            last_act = to_naive(break_status_task.last_action_time)
            diff = (now - last_act).total_seconds()
            current_break += int(max(0, diff))

        earned_from_completed = sum((t.active_seconds or 0) / 3600.0 * (t.hourly_rate or 0) for t in emp_tasks)
        earned_now = 0
        if current_status_task:
            earned_now = (current_active - active_sec) / 3600.0 * (current_status_task.hourly_rate or 0)

        person_summary[emp.id] = {
            'active_sec': current_active,
            'break_sec': current_break,
            'total_sec': current_active + current_break,
            'total_earned': earned_from_completed + earned_now,
            'status': status,
            'current_job': current_job,
            'current_mo': current_mo
        }
    return person_summary

@main_bp.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('main.manager_dashboard'))
    return redirect(url_for('main.login'))

@main_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.find_by_username(username)
        if user and user.password == password:
            if user.role != 'manager':
                flash('Access denied. Administrator privileges required.')
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
@main_bp.route('/manager_dashboard')
@login_required
def manager_dashboard():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))

    db = firestore.client()
    # Get all employees
    employees_stream = db.collection('users').where('role', '==', 'employee').stream()
    employees = [User(id=doc.id, **doc.to_dict()) for doc in employees_stream]

    tasks = Task.get_all()
    person_summary = get_person_summary(employees, tasks)

    # Prepare active MOs for the dashboard
    active_mos = sorted(list(set(t.mo_reference for t in tasks if t.status == 'active')))

    return render_template('manager_dashboard.html',
                           employees=employees,
                           tasks=tasks,
                           person_summary=person_summary,
                           active_mos=active_mos)

@main_bp.route('/control-matrix')
@login_required
def control_matrix():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
        
    db = firestore.client()
    # 1. Get Employees
    employees_stream = db.collection('users').where('role', '==', 'employee').stream()
    employees = [User(id=doc.id, **doc.to_dict()) for doc in employees_stream]
    emp_map = {e.id: e for e in employees}
    
    # 2. Get Active/Paused Tasks for the Matrix cells
    tasks = Task.get_all()
    filtered_tasks = [t for t in tasks if t.status in ['active', 'break', 'pending', 'clocked_out', 'Active', 'Break', 'Pending']]
    
    # 3. Get MOs from Firestore - sorted by ID
    mos_stream = db.collection('manufacturing_orders').order_by('id').stream()
    mos = []
    for doc in mos_stream:
        data = doc.to_dict()
        mos.append({
            'name': str(data.get('id', doc.id)),
            'product_id': [0, data.get('product', 'N/A')],
            'state': data.get('status', 'draft')
        })
    
    # 4. Get Operations from Firestore
    ops_ref = db.collection('settings').document('operations')
    doc = ops_ref.get()
    if doc.exists:
        ops_data = doc.to_dict().get('list', [])
        # Sort operations by ID to guarantee fixed column order in Control Matrix
        # strictly as requested ("arrangement should not be change")
        try:
            ops_data.sort(key=lambda x: int(x['id']))
            print(f"DEBUG: Sorted operations: {[op['name'] for op in ops_data]}")
        except Exception as e:
            print(f"DEBUG: Sort failed: {e}")
            
        operations = [op['name'] for op in ops_data]
    else:
        operations = [] # Start empty as requested "there is not any predefined operations"
        
    return render_template('control_matrix.html',
                          employees=[e.to_dict() for e in employees],
                          emp_map={e.id: e.to_dict() for e in employees},
                          mos=mos,
                          tasks=[t.to_dict() for t in filtered_tasks],
                          operations=operations)

@main_bp.route('/manufacturing-orders')
@login_required
def manufacturing_orders():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
    
    db = firestore.client()
    mos_stream = db.collection('manufacturing_orders').order_by('created_at', direction=firestore.Query.DESCENDING).stream()
    orders = []
    for doc in mos_stream:
        d = doc.to_dict()
        d['id'] = doc.id
        orders.append(d)
    
    if not orders:
        # Initial seeding if empty
        orders = [
            {'id': 'MO-001', 'product': 'Industrial Motor Assembly', 'status': 'progress', 'dates': 'Jan 15 → Feb 15', 'created_at': datetime.utcnow()},
            {'id': 'MO-002', 'product': 'Control Panel Unit', 'status': 'progress', 'dates': 'Jan 20 → Feb 20', 'created_at': datetime.utcnow()},
            {'id': 'MO-003', 'product': 'Hydraulic Pump Kit', 'status': 'draft', 'dates': 'Feb 1 → Mar 1', 'created_at': datetime.utcnow()},
            {'id': 'MO-004', 'product': 'Sensor Array Module', 'status': 'completed', 'dates': 'Jan 1 → Jan 14', 'created_at': datetime.utcnow()},
            {'id': 'MO-005', 'product': 'Conveyor Belt Section', 'status': 'draft', 'dates': 'Feb 10 → Mar 10', 'created_at': datetime.utcnow()},
        ]
        for o in orders:
            db.collection('manufacturing_orders').document(o['id']).set(o)
            
    return render_template('manufacturing_orders.html', orders=orders)

@main_bp.route('/employee-activity')
@login_required
def employee_activity():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
    
    db = firestore.client()
    employees_stream = db.collection('users').where('role', '==', 'employee').stream()
    employees = [User(id=doc.id, **doc.to_dict()) for doc in employees_stream]
    tasks = Task.get_all()
    
    tasks_by_emp = {}
    for t in tasks:
        if t.assigned_to_id not in tasks_by_emp:
            tasks_by_emp[t.assigned_to_id] = []
        tasks_by_emp[t.assigned_to_id].append(t.to_dict())

    # Sort each employee's tasks by created_at descending
    for eid in tasks_by_emp:
        tasks_by_emp[eid].sort(key=lambda x: x.get('created_at') or '', reverse=True)

    person_summary = get_person_summary(employees, tasks)
        
    return render_template('employee_activity.html',
                          employees=employees,
                          person_summary=person_summary,
                          tasks_by_emp=tasks_by_emp)

@main_bp.route('/workers')
@login_required
def workers():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
    
    db = firestore.client()
    employees_stream = db.collection('users').where('role', '==', 'employee').stream()
    employees = [User(id=doc.id, **doc.to_dict()) for doc in employees_stream]
    
    return render_template('workers.html', workers=employees)

@main_bp.route('/operations')
@login_required
def operations():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
    
    db = firestore.client()
    ops_stream = db.collection('settings').document('operations').get()
    if ops_stream.exists:
        ops_list = ops_stream.to_dict().get('list', [])
    else:
        # Initial defaults
        ops_list = [
            {'id': 1, 'name': 'Receiving', 'desc': 'Receiving raw materials'},
            {'id': 2, 'name': 'Staging', 'desc': 'Staging materials'},
            {'id': 3, 'name': 'Weighing', 'desc': 'Weighing components'},
            {'id': 4, 'name': 'Filling', 'desc': 'Filling containers'},
            {'id': 5, 'name': 'Packing', 'desc': 'Packing finished goods'}
        ]
        db.collection('settings').document('operations').set({'list': ops_list})
        
    return render_template('operations.html', operations=ops_list)

@main_bp.route('/api/operations/add', methods=['POST'])
@login_required
def add_operation():
    data = request.json
    db = firestore.client()
    ops_ref = db.collection('settings').document('operations')
    doc = ops_ref.get()
    ops = doc.to_dict().get('list', []) if doc.exists else []
    
    # Generate new ID safely (max existing ID + 1)
    if ops:
        new_id = max(int(op['id']) for op in ops) + 1
    else:
        new_id = 1
    
    new_op = {
        'id': new_id,
        'name': data['name'],
        'desc': data.get('desc', '')
    }
    ops.append(new_op)
    ops_ref.set({'list': ops})
    return jsonify({'success': True})

@main_bp.route('/api/orders/add', methods=['POST'])
@login_required
def add_order():
    data = request.json
    db = firestore.client()

    # Simple ID generation or use provided ID
    mo_id = data.get('id', str(uuid.uuid4())[:8].upper())

    db.collection('manufacturing_orders').document(mo_id).set({
        'id': mo_id,
        'product': data.get('product', 'Unknown Product'),
        'status': 'draft',
        'dates': data.get('dates', datetime.utcnow().strftime('%b %d → %b %d')),
        'created_at': datetime.utcnow()
    })
    return jsonify({'success': True})

@main_bp.route('/api/orders/update', methods=['POST'])
@login_required
def update_order():
    data = request.json
    db = firestore.client()
    updates = {
        'product': data['product'],
        'status': data['status']
    }
    if 'dates' in data:
        updates['dates'] = data['dates']
        
    db.collection('manufacturing_orders').document(data['id']).update(updates)
    return jsonify({'success': True})

@main_bp.route('/api/orders/delete', methods=['POST'])
@login_required
def delete_order():
    data = request.json
    db = firestore.client()
    db.collection('manufacturing_orders').document(data['id']).delete()
    return jsonify({'success': True})

@main_bp.route('/api/operations/update', methods=['POST'])
@login_required
def update_operation():
    data = request.json
    db = firestore.client()
    ops_ref = db.collection('settings').document('operations')
    doc = ops_ref.get()
    ops = doc.to_dict().get('list', []) if doc.exists else []
    
    old_name = None
    for op in ops:
        if str(op['id']) == str(data['id']):
            old_name = op['name']
            op['name'] = data['name']
            op['desc'] = data.get('desc', '')
            break
            
    if old_name and old_name != data['name']:
        # Update tasks that use this operation name
        tasks_ref = db.collection('tasks').where('description', '==', old_name).stream()
        batch = db.batch()
        for t in tasks_ref:
            batch.update(t.reference, {'description': data['name']})
        batch.commit()

    ops_ref.set({'list': ops})
    return jsonify({'success': True})

@main_bp.route('/api/operations/reorder', methods=['POST'])
@login_required
def reorder_operations():
    data = request.json
    db = firestore.client()
    ops_ref = db.collection('settings').document('operations')
    doc = ops_ref.get()
    
    if not doc.exists:
        return jsonify({'error': 'No operations found'}), 404
        
    current_ops = doc.to_dict().get('list', [])
    ops_map = {str(op['id']): op for op in current_ops}
    
    # Deduplicate input IDs while preserving order
    ordered_ids = []
    seen = set()
    for oid in data.get('ids', []):
        if oid not in seen:
            seen.add(oid)
            ordered_ids.append(oid)

    ordered_ops = []
    
    for op_id in ordered_ids:
        if str(op_id) in ops_map:
            ordered_ops.append(ops_map[str(op_id)])
            
    # Append any missing ops to prevent data loss
    claimed_ids = set(str(oid) for oid in ordered_ids)
    for op in current_ops:
        if str(op['id']) not in claimed_ids:
            ordered_ops.append(op)
            
    ops_ref.update({'list': ordered_ops})
    return jsonify({'success': True})

@main_bp.route('/api/operations/delete', methods=['POST'])
@login_required
def delete_operation():
    data = request.json
    db = firestore.client()
    
    # Get the operation name first
    ops_ref = db.collection('settings').document('operations')
    doc = ops_ref.get()
    ops = doc.to_dict().get('list', []) if doc.exists else []
    
    op_name = next((op['name'] for op in ops if str(op['id']) == str(data['id'])), None)
    
    if op_name:
        pass

    ops = [op for op in ops if str(op['id']) != str(data['id'])]
    ops_ref.set({'list': ops})
    return jsonify({'success': True})

@main_bp.route('/api/manual_entry', methods=['POST'])
@login_required
def manual_entry():
    data = request.json
    db = firestore.client()
    
    # Fetch worker's predefined rate
    user_doc = db.collection('users').document(data['employee_id']).get()
    rate = user_doc.to_dict().get('hourly_rate', 0.0) if user_doc.exists else 0.0
    
    # Calculate duration from start/end times
    from datetime import datetime
    try:
        start = datetime.fromisoformat(data['start_time'].replace('Z', ''))
        end = datetime.fromisoformat(data['end_time'].replace('Z', ''))
        active_seconds = int((end - start).total_seconds())
        if active_seconds < 0: active_seconds = 0
    except:
        active_seconds = 0
    
    task_id = str(uuid.uuid4())
    task_data = {
        'description': data['operation'],
        'mo_reference': data['mo_reference'],
        'assigned_to_id': data['employee_id'],
        'hourly_rate': float(rate),
        'status': 'completed',
        'active_seconds': active_seconds,
        'break_seconds': 0,
        'total_duration_seconds': active_seconds,
        'created_at': firestore.SERVER_TIMESTAMP,
        'start_time': data['start_time'],
        'end_time': data['end_time'],
        'manual': True
    }
    db.collection('tasks').document(task_id).set(task_data)
    return jsonify({'success': True})

@main_bp.route('/reports')
@login_required
def reports():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
        
    db = firestore.client()
    
    # Get filters from query params
    emp_id = request.args.get('employee')
    mo_ref = request.args.get('mo')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    # Fetch all data for filters
    employees_stream = db.collection('users').where('role', '==', 'employee').stream()
    employees = [User(id=doc.id, **doc.to_dict()) for doc in employees_stream]
    
    mos_stream = db.collection('manufacturing_orders').stream()
    mos = []
    for doc in mos_stream:
        d = doc.to_dict()
        if d:
            d['id'] = doc.id
            if 'name' not in d:
                d['name'] = doc.id # Fallback to ID if name field missing
            mos.append(d)
    
    ops_stream = db.collection('settings').document('operations').get()
    operations = ops_stream.to_dict().get('list', []) if ops_stream.exists else []
    
    # Fetch tasks and apply filters manually (Firestore has limited multi-field queries)
    tasks = Task.get_all()
    filtered_tasks = []
    
    for t in tasks:
        # Status must be completed or manual for reports
        if t.status not in ['completed']:
            continue
            
        if emp_id and emp_id != 'all' and t.assigned_to_id != emp_id:
            continue
        if mo_ref and mo_ref != 'all' and t.mo_reference != mo_ref:
            continue
            
        # Date filtering (created_at is a string in Task.to_dict() but we might need more)
        # For simplicity, let's assume Task objects have datetime created_at
        if start_date:
            s_dt = datetime.strptime(start_date, '%Y-%m-%d')
            if t.created_at and t.created_at.replace(tzinfo=None) < s_dt:
                continue
        if end_date:
            e_dt = datetime.strptime(end_date, '%Y-%m-%d')
            if t.created_at and t.created_at.replace(tzinfo=None) > e_dt:
                continue
                
        filtered_tasks.append(t)
        
    # Stats
    total_hours = sum(t.active_seconds for t in filtered_tasks) / 3600.0
    total_cost = sum(t.active_seconds / 3600.0 * t.hourly_rate for t in filtered_tasks)
    avg_rate = total_cost / total_hours if total_hours > 0 else 0
    
    # Group for charts
    hours_by_worker = {}
    hours_by_op = {}
    
    for t in filtered_tasks:
        worker_name = next((e.name for e in employees if e.id == t.assigned_to_id), 'Unknown')
        hours_by_worker[worker_name] = hours_by_worker.get(worker_name, 0) + (t.active_seconds / 3600.0)
        
        hours_by_op[t.description] = hours_by_op.get(t.description, 0) + (t.active_seconds / 3600.0)

    # Convert Task objects to dicts for template
    tasks_dict = [t.to_dict() for t in filtered_tasks]
    # Add employee name to each task dict
    emp_map = {e.id: e.name for e in employees}
    for td in tasks_dict:
        td['employee_name'] = emp_map.get(td['assigned_to_id'], 'Unknown')
        td['cost'] = (td['active_seconds'] / 3600.0) * td['hourly_rate']

    return render_template('reports.html', 
                          employees=employees, 
                          mos=mos,
                          operations=operations,
                          tasks=tasks_dict,
                          total_hours=round(total_hours, 1),
                          total_cost=round(total_cost, 2),
                          avg_rate=round(avg_rate, 2),
                          hours_by_worker=hours_by_worker,
                          hours_by_op=hours_by_op,
                          filters={'employee': emp_id, 'mo': mo_ref, 'start': start_date, 'end': end_date})



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
        
        # Fetch worker's predefined rate to avoid frontend tampering
        user_doc = db.collection('users').document(assign['employee_id']).get()
        if user_doc.exists:
            rate = user_doc.to_dict().get('hourly_rate', 0.0)
        else:
            rate = 0.0

        task_data = {
            'description': description,
            'mo_reference': mo_ref,
            'assigned_to_id': assign['employee_id'],
            'hourly_rate': float(rate),
            'status': 'pending',
            'active_seconds': 0,
            'break_seconds': 0,
            'total_duration_seconds': 0,
            'created_at': firestore.SERVER_TIMESTAMP
        }
        batch.set(task_ref, task_data)

    batch.commit()
    return jsonify({'success': True})

# --- Administrative Actions ---


@main_bp.route('/api/task/<task_id>/action', methods=['POST'])
@login_required
def task_action(task_id):
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json() or {}
    action = data.get('action')
    db = firestore.client()
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()

    if not task_doc.exists:
        return jsonify({'error': 'Task not found'}), 404

    task_data = task_doc.to_dict()
    now = datetime.utcnow()

    def to_naive(dt):
        if not dt:
            return now
        try:
            if hasattr(dt, 'to_datetime'):
                dt = dt.to_datetime()
            return dt.replace(tzinfo=None)
        except Exception:
            return now

    updates = {}
    current_status = task_data.get('status', 'pending')
    last_act = to_naive(task_data.get('last_action_time'))
    
    # Calculate duration since last action if relevant
    diff = int((now - last_act).total_seconds()) if last_act else 0
    if diff < 0: diff = 0

    if action == 'clock_in' or action == 'start' or action == 'resume':
        # From Pending/Clocked_Out -> Active: Start/Resume timer
        # From Break -> Active: Resume timer (close break)
        
        if current_status == 'break':
            current_brk = task_data.get('break_seconds', 0)
            updates['break_seconds'] = current_brk + diff
            
            # Close break record
            breaks_query = task_ref.collection('breaks').order_by('start_time', direction=firestore.Query.DESCENDING).limit(1)
            for b in breaks_query.stream():
                b.reference.update({'end_time': now})

        updates['status'] = 'active'
        updates['last_action_time'] = now
        if not task_data.get('start_time'):
            updates['start_time'] = now

    elif action == 'clock_out': # Partial day end (Shift End), Task NOT Complete
        if current_status == 'active':
            current_act = task_data.get('active_seconds', 0)
            updates['active_seconds'] = current_act + diff
        elif current_status == 'break':
            current_brk = task_data.get('break_seconds', 0)
            updates['break_seconds'] = current_brk + diff

        updates['status'] = 'clocked_out'
        updates['last_action_time'] = now

    elif action == 'break':
        if current_status == 'active':
            current_act = task_data.get('active_seconds', 0)
            updates['active_seconds'] = current_act + diff
        
        updates['status'] = 'break'
        updates['last_action_time'] = now
        updates['reason'] = data.get('reason', 'Break')
        
        task_ref.collection('breaks').add({
            'reason': data.get('reason', 'Break'),
            'start_time': now
        })

    elif action == 'complete': # Stop Button (Finalize Task)
        if current_status == 'active':
            current_act = task_data.get('active_seconds', 0)
            updates['active_seconds'] = current_act + diff
        elif current_status == 'break':
            current_brk = task_data.get('break_seconds', 0)
            updates['break_seconds'] = current_brk + diff

        updates['status'] = 'completed'
        updates['end_time'] = now
        
        # Total duration checks
        start_time = to_naive(task_data.get('start_time'))
        if start_time:
            updates['total_duration_seconds'] = int((now - start_time).total_seconds())

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


@main_bp.route('/api/delete_employee', methods=['POST'])
@login_required
def delete_employee():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    db = firestore.client()
    db.collection('users').document(data['employee_id']).delete()
    return jsonify({'success': True})
