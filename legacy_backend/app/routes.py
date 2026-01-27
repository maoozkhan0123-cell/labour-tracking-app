from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from .models import User, Task, get_now_pst, PST
from datetime import datetime
import pytz
from .supabase_client import get_supabase
import uuid

main_bp = Blueprint('main', __name__)

def get_person_summary(employees, tasks):
    person_summary = {}
    now = get_now_pst().replace(tzinfo=None)

    def to_naive(dt):
        if not dt:
            return now
        if hasattr(dt, 'to_datetime'):
            return dt.to_datetime().replace(tzinfo=None)
        if isinstance(dt, datetime):
            return dt.replace(tzinfo=None)
        return dt

    for emp in employees:
        emp_tasks = [t for t in tasks if str(t.assigned_to_id) == str(emp.id)]
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

    supabase = get_supabase()
    # Get all employees
    response = supabase.table('users').select("*").eq('role', 'employee').execute()
    employees = [User(**doc) for doc in response.data]

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
        
    supabase = get_supabase()
    # 1. Get Employees
    response = supabase.table('users').select("*").eq('role', 'employee').execute()
    employees = [User(**doc) for doc in response.data]
    emp_map = {e.id: e for e in employees}
    
    # 2. Get Active/Paused Tasks for the Matrix cells
    tasks = Task.get_all()
    filtered_tasks = [t for t in tasks if t.status in ['active', 'break', 'pending', 'clocked_out', 'clocked_in', 'Active', 'Break', 'Pending', 'Clocked_In']]
    
    # 3. Get MOs from Supabase - sorted by ID
    response = supabase.table('manufacturing_orders').select("*").execute()
    mos = []
    for doc in response.data:
        mos.append({
            'name': doc.get('name', doc['id']),
            'product_id': [0, doc.get('product', 'N/A')],
            'state': doc.get('status', 'draft')
        })
    # Sort by name after fetching
    mos.sort(key=lambda x: x['name'])
    
    # 4. Get Operations from Supabase Table
    response_ops = supabase.table('operations').select("*").order('sort_order', desc=False).execute()
    operations = [op['name'] for op in response_ops.data]
        
    return render_template('control_matrix.html',
                          employees=[e.to_dict() for e in employees],
                          emp_map={e.id: e.to_dict() for e in employees},
                          mos=mos,
                          tasks=[t.to_dict() for t in filtered_tasks],
                          operations=operations)

@main_bp.route('/control-table')
@login_required
def control_table():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
        
    supabase = get_supabase()
    # 1. Get Employees
    response = supabase.table('users').select("*").eq('role', 'employee').execute()
    employees = [User(**doc) for doc in response.data]
    emp_map = {e.id: e.to_dict() for e in employees}
    
    # 2. Get Manufacturing Orders
    response_mo = supabase.table('manufacturing_orders').select("*").execute()
    mos = []
    for doc in response_mo.data:
        mos.append({'name': doc.get('name', doc['id'])})
    mos.sort(key=lambda x: x['name'])
    
    # 3. Get Operations
    response_ops = supabase.table('operations').select("*").order('sort_order', desc=False).execute()
    operations = response_ops.data
    
    # 4. Get all tasks
    tasks = Task.get_all()
    
    # Apply date filters
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    filtered_tasks = []
    for t in tasks:
        # Filter Status
        if t.status not in ['active', 'break', 'pending', 'clocked_out', 'clocked_in', 'completed', 'Active', 'Break', 'Pending', 'Clocked_In', 'Clocked_Out', 'Completed']:
            continue
            
        # Filter Date
        if start_date:
            s_dt = datetime.strptime(start_date, '%Y-%m-%d')
            if t.created_at and t.created_at < s_dt:
                continue
        if end_date:
            e_dt = datetime.strptime(end_date, '%Y-%m-%d')
            # End of day check
            e_dt = e_dt.replace(hour=23, minute=59, second=59)
            if t.created_at and t.created_at > e_dt:
                continue
                
        filtered_tasks.append(t)
    
    return render_template('control_table.html',
                          employees=[e.to_dict() for e in employees],
                          emp_map=emp_map,
                          mos=mos,
                          operations=operations,
                          tasks=filtered_tasks,
                          filters={'start_date': start_date, 'end_date': end_date})


@main_bp.route('/manufacturing-orders')
@login_required
def manufacturing_orders():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
    
    supabase = get_supabase()
    response = supabase.table('manufacturing_orders').select("*").order('created_at', desc=True).execute()
    orders = []
    for doc in response.data:
        d = doc
        if 'name' not in d:
            d['name'] = doc['id']
        orders.append(d)
            
    return render_template('manufacturing_orders.html', orders=orders)

@main_bp.route('/employee-activity')
@login_required
def employee_activity():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
    
    supabase = get_supabase()
    response = supabase.table('users').select("*").eq('role', 'employee').execute()
    employees = [User(**doc) for doc in response.data]
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
    
    supabase = get_supabase()
    response = supabase.table('users').select("*").eq('role', 'employee').execute()
    employees = [User(**doc) for doc in response.data]
    
    return render_template('workers.html', workers=employees)

@main_bp.route('/operations')
@login_required
def operations():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
    
    supabase = get_supabase()
    response = supabase.table('operations').select("*").order('sort_order', desc=False).execute()
    ops_list = response.data
    
    if not ops_list:
        # Initial defaults if empty
        defaults = [
            {'name': 'Receiving', 'description': 'Receiving raw materials'},
            {'name': 'Staging', 'description': 'Staging materials'},
            {'name': 'Weighing', 'description': 'Weighing components'},
            {'name': 'Filling', 'description': 'Filling containers'},
            {'name': 'Packing', 'description': 'Packing finished goods'}
        ]
        supabase.table('operations').insert(defaults).execute()
        response = supabase.table('operations').select("*").order('sort_order', desc=False).execute()
        ops_list = response.data
        
    return render_template('operations.html', operations=ops_list)

@main_bp.route('/api/operations/add', methods=['POST'])
@login_required
def add_operation():
    data = request.json
    supabase = get_supabase()
    
    new_op = {
        'name': data['name'],
        'description': data.get('desc', '')
    }
    supabase.table('operations').insert(new_op).execute()
    return jsonify({'success': True})

@main_bp.route('/api/orders/add', methods=['POST'])
@login_required
def add_order():
    data = request.json
    supabase = get_supabase()

    # Use provided ID as name
    mo_name = data.get('id')
    if not mo_name:
        return jsonify({'success': False, 'error': 'Name is required'}), 400

    supabase.table('manufacturing_orders').insert({
        'name': mo_name,
        'product': data.get('product', 'Unknown Product'),
        'status': 'draft',
        'dates': data.get('dates', get_now_pst().strftime('%b %d → %b %d')),
        'created_at': get_now_pst().isoformat()
    }).execute()
    return jsonify({'success': True})

@main_bp.route('/api/orders/update', methods=['POST'])
@login_required
def update_order():
    data = request.json
    supabase = get_supabase()
    updates = {
        'product': data['product'],
        'status': data['status']
    }
    if 'dates' in data:
        updates['dates'] = data['dates']
        
    supabase.table('manufacturing_orders').update(updates).eq('id', data['id']).execute()
    return jsonify({'success': True})

@main_bp.route('/api/orders/delete', methods=['POST'])
@login_required
def delete_order():
    data = request.json
    supabase = get_supabase()
    supabase.table('manufacturing_orders').delete().eq('id', data['id']).execute()
    return jsonify({'success': True})

@main_bp.route('/api/operations/update', methods=['POST'])
@login_required
def update_operation():
    data = request.json
    supabase = get_supabase()
    
    # Get old name for task update
    old_op_res = supabase.table('operations').select("name").eq('id', data['id']).execute()
    if old_op_res.data:
        old_name = old_op_res.data[0]['name']
        if old_name != data['name']:
            supabase.table('tasks').update({'description': data['name']}).eq('description', old_name).execute()

    updates = {
        'name': data['name'],
        'description': data.get('desc', '')
    }
    supabase.table('operations').update(updates).eq('id', data['id']).execute()
    return jsonify({'success': True})

@main_bp.route('/api/operations/reorder', methods=['POST'])
@login_required
def reorder_operations():
    data = request.json
    ids = data.get('ids', [])
    supabase = get_supabase()
    
    # Update each operation with its new sort_order (its index in the list)
    for index, op_id in enumerate(ids):
        supabase.table('operations').update({'sort_order': index}).eq('id', op_id).execute()
        
    return jsonify({'success': True})

@main_bp.route('/api/operations/delete', methods=['POST'])
@login_required
def delete_operation():
    data = request.json
    supabase = get_supabase()
    supabase.table('operations').delete().eq('id', data['id']).execute()
    return jsonify({'success': True})

@main_bp.route('/api/manual_entry', methods=['POST'])
@login_required
def manual_entry():
    data = request.json
    supabase = get_supabase()
    
    # Fetch worker's predefined rate
    response = supabase.table('users').select("hourly_rate").eq('id', data['employee_id']).execute()
    rate = response.data[0]['hourly_rate'] if response.data else 0.0
    
    # Calculate duration from start/end times
    try:
        # Browser sends naive local time string
        start_naive = datetime.fromisoformat(data['start_time'])
        end_naive = datetime.fromisoformat(data['end_time'])
        
        # Localize to PST and then get UTC for duration calculation
        start_pst = PST.localize(start_naive)
        end_pst = PST.localize(end_naive)
        
        active_seconds = int((end_pst - start_pst).total_seconds())
        if active_seconds < 0: active_seconds = 0
        
        # Format for storage (ISO with offset)
        start_iso = start_pst.isoformat()
        end_iso = end_pst.isoformat()
    except Exception as e:
        print(f"Manual Entry Error: {e}")
        active_seconds = 0
        start_iso = data['start_time']
        end_iso = data['end_time']
    
    task_id = str(uuid.uuid4())
    task_data = {
        'id': task_id,
        'description': data['operation'],
        'mo_reference': data['mo_reference'],
        'assigned_to_id': data['employee_id'],
        'hourly_rate': float(rate),
        'status': 'completed',
        'active_seconds': active_seconds,
        'break_seconds': 0,
        'total_duration_seconds': active_seconds,
        'created_at': get_now_pst().isoformat(),
        'start_time': start_iso,
        'end_time': end_iso,
        'last_action_time': end_iso,
        'manual': True
    }
    supabase.table('tasks').insert(task_data).execute()
    return jsonify({'success': True})

@main_bp.route('/reports')
@login_required
def reports():
    if current_user.role != 'manager':
        return redirect(url_for('main.index'))
        
    supabase = get_supabase()
    
    # Get filters from query params
    emp_id = request.args.get('employee')
    mo_ref = request.args.get('mo')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    operation = request.args.get('operation')
    
    # Fetch all data for filters
    response_emp = supabase.table('users').select("*").eq('role', 'employee').execute()
    employees = [User(**doc) for doc in response_emp.data]
    
    response_mo = supabase.table('manufacturing_orders').select("*").execute()
    mos = []
    for doc in response_mo.data:
        d = doc
        if 'name' not in d:
            d['name'] = doc['id']
        mos.append(d)
    
    response_ops = supabase.table('operations').select("*").order('sort_order', desc=False).execute()
    operations = response_ops.data
    
    # Fetch tasks and apply filters manually (Firestore has limited multi-field queries)
    tasks = Task.get_all()
    filtered_tasks = []
    
    for t in tasks:
        # Status must be completed or manual for reports
        status_norm = (t.status or '').lower()
        if status_norm != 'completed':
            continue
            
        if emp_id and emp_id != 'all' and str(t.assigned_to_id) != str(emp_id):
            continue
        if mo_ref and mo_ref != 'all' and t.mo_reference != mo_ref:
            continue
        if operation and operation != 'all' and t.description != operation:
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
                          filters={'employee': emp_id, 'mo': mo_ref, 'operation': operation, 'start': start_date, 'end': end_date})



@main_bp.route('/api/reports/export_csv')
@login_required
def export_reports_csv():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
        
    supabase = get_supabase()
    
    # Get filters
    emp_id = request.args.get('employee')
    mo_ref = request.args.get('mo')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    operation = request.args.get('operation')
    
    # Fetch data
    response_emp = supabase.table('users').select("*").eq('role', 'employee').execute()
    employees = {doc['id']: doc.get('name', 'Unknown') for doc in response_emp.data}
    
    tasks = Task.get_all()
    
    import csv
    from io import StringIO
    from flask import Response
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['Worker', 'Order', 'Operation', 'Start Time', 'Duration (Hours)', 'Duration (Mins)', 'Type', 'Cost', 'Hourly Rate'])
    
    for t in tasks:
        # Status filter - case insensitive
        status_norm = (t.status or '').lower()
        if status_norm != 'completed': continue
        
        # Safe string comparison for IDs
        if emp_id and emp_id != 'all' and str(t.assigned_to_id) != str(emp_id): continue
        if mo_ref and mo_ref != 'all' and t.mo_reference != mo_ref: continue
        if operation and operation != 'all' and t.description != operation: continue
        
        if start_date:
            s_dt = datetime.strptime(start_date, '%Y-%m-%d')
            if t.created_at and t.created_at.replace(tzinfo=None) < s_dt: continue
        if end_date:
            e_dt = datetime.strptime(end_date, '%Y-%m-%d')
            if t.created_at and t.created_at.replace(tzinfo=None) > e_dt: continue
            
        worker_name = employees.get(str(t.assigned_to_id), 'Unknown')
        duration_hours = (t.active_seconds or 0) / 3600.0
        cost = duration_hours * t.hourly_rate
        
        writer.writerow([
            worker_name,
            t.mo_reference,
            t.description,
            t.start_time or t.created_at,
            f"{duration_hours:.2f}",
            f"{(t.active_seconds or 0) // 60}",
            'Manual' if getattr(t, 'manual', False) else 'Auto',
            f"${cost:.2f}",
            f"${t.hourly_rate:.2f}"
        ])
        
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=labor_report.csv"}
    )

@main_bp.route('/api/task/<task_id>/cancel', methods=['POST'])
@login_required
def cancel_task(task_id):
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    supabase = get_supabase()
    supabase.table('tasks').update({'status': 'cancelled'}).eq('id', task_id).execute()
    return jsonify({'success': True})

@main_bp.route('/api/assign_task', methods=['POST'])
@login_required
def assign_task():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    supabase = get_supabase()
    
    assignments = data.get('assignments', [])
    description = data.get('description')
    mo_ref = data.get('mo_reference', 'N/A')

    if not assignments:
        return jsonify({'error': 'No employees selected'}), 400

    new_tasks_to_insert = []
    for assign in assignments:
        task_id = str(uuid.uuid4())
        
        # Fetch worker's predefined rate
        response_user = supabase.table('users').select("hourly_rate").eq('id', assign['employee_id']).execute()
        rate = response_user.data[0]['hourly_rate'] if response_user.data else 0.0

        task_data = {
            'id': task_id,
            'description': description,
            'mo_reference': mo_ref,
            'assigned_to_id': assign['employee_id'],
            'hourly_rate': float(rate),
            'status': 'pending',
            'active_seconds': 0,
            'break_seconds': 0,
            'total_duration_seconds': 0,
            'created_at': get_now_pst().isoformat()
        }
        new_tasks_to_insert.append(task_data)

    if new_tasks_to_insert:
        supabase.table('tasks').insert(new_tasks_to_insert).execute()

    return jsonify({'success': True, 'new_tasks': new_tasks_to_insert})

# --- Administrative Actions ---


@main_bp.route('/api/task/<task_id>/action', methods=['POST'])
@login_required
def task_action(task_id):
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json() or {}
    action = data.get('action')
    supabase = get_supabase()
    
    response = supabase.table('tasks').select("*").eq('id', task_id).execute()
    if not response.data:
        return jsonify({'error': 'Task not found'}), 404

    task_data = response.data[0]
    now = get_now_pst().replace(tzinfo=None)

    def to_naive(dt_str):
        if not dt_str:
            return now
        try:
            # Task.to_dt already converts to PST naive
            dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = pytz.utc.localize(dt)
            return dt.astimezone(pytz.timezone('America/Los_Angeles')).replace(tzinfo=None)
        except Exception:
            return now

    updates = {}
    current_status = task_data.get('status', 'pending')
    last_act = to_naive(task_data.get('last_action_time'))
    
    # Calculate duration since last action if relevant
    diff = int((now - last_act).total_seconds()) if last_act else 0
    if diff < 0: diff = 0

    if action == 'clock_in':
        # Clock In: Worker arrives, but timer doesn't start yet
        updates['status'] = 'clocked_in'
        updates['last_action_time'] = now
        
    elif action == 'start':
        # Start: Begin timer (from clocked_in or pending)
        if current_status == 'clocked_in':
            # Already clocked in, just start the timer
            pass
        updates['status'] = 'active'
        updates['last_action_time'] = now
        if not task_data.get('start_time'):
            updates['start_time'] = now
            
    elif action == 'stop':
        # Stop: Pause timer (from active to clocked_in)
        if current_status == 'active':
            current_act = task_data.get('active_seconds', 0)
            updates['active_seconds'] = current_act + diff
        updates['status'] = 'clocked_in'
        updates['last_action_time'] = now
        
    elif action == 'resume':
        # Resume: Restart timer after break
        if current_status == 'break':
            current_brk = task_data.get('break_seconds', 0)
            updates['break_seconds'] = current_brk + diff
            
            # Close break record in breaks table
            supabase.table('breaks').update({'end_time': now.isoformat()}).eq('task_id', task_id).is_('end_time', 'null').execute()
        
        updates['status'] = 'active'
        updates['last_action_time'] = now

    elif action == 'clock_out':
        # Clock Out: End shift (from any status)
        if current_status == 'active':
            current_act = task_data.get('active_seconds', 0)
            updates['active_seconds'] = current_act + diff
        elif current_status == 'break':
            current_brk = task_data.get('break_seconds', 0)
            updates['break_seconds'] = current_brk + diff

        updates['status'] = 'clocked_out'
        updates['last_action_time'] = now

    elif action == 'break':
        # Break: Pause for break
        if current_status == 'active':
            current_act = task_data.get('active_seconds', 0)
            updates['active_seconds'] = current_act + diff
        
        updates['status'] = 'break'
        updates['last_action_time'] = now.isoformat()
        updates['reason'] = data.get('reason', 'Break')
        
        supabase.table('breaks').insert({
            'task_id': task_id,
            'reason': data.get('reason', 'Break'),
            'start_time': now.isoformat()
        }).execute()

    elif action == 'complete':
        # Complete: Finalize task
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

    if updates:
        # Convert any remaining datetime objects to string
        for k, v in updates.items():
            if isinstance(v, datetime):
                updates[k] = v.isoformat()
        supabase.table('tasks').update(updates).eq('id', task_id).execute()
    
    return jsonify({'success': True})


@main_bp.route('/api/task/<task_id>/edit_time', methods=['POST'])
@login_required
def edit_task_time(task_id):
    """Allow managers to manually edit task duration"""
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.json
    active_seconds = data.get('active_seconds')
    
    if active_seconds is None or active_seconds < 0:
        return jsonify({'error': 'Invalid duration'}), 400
    
    supabase = get_supabase()
    response = supabase.table('tasks').select("*").eq('id', task_id).execute()
    
    if not response.data:
        return jsonify({'error': 'Task not found'}), 404
    
    task_db = response.data[0]
    
    # We use the end_time (preferred) or last_action_time as the anchor point
    # We subtract the duration from this anchor to get the new start_time
    ref_time_str = task_db.get('last_action_time') or task_db.get('end_time') or task_db.get('created_at')
    updates = {'active_seconds': int(active_seconds)}
    
    if ref_time_str:
        try:
            from datetime import timedelta
            # Parse the reference time (Supabase returns ISO with offset usually)
            ref_dt = datetime.fromisoformat(ref_time_str.replace('Z', '+00:00'))
            
            # Recalculate start time: Anchor - Duration
            new_start_dt = ref_dt - timedelta(seconds=int(active_seconds))
            updates['start_time'] = new_start_dt.isoformat()
            
            # If the task was 'pending' and we added time, we should probably mark it 'completed' or 'clocked_out'
            if task_db.get('status') == 'pending' and int(active_seconds) > 0:
                updates['status'] = 'completed'
                
        except Exception as e:
            print(f"Error recalculating start_time: {e}")

    supabase.table('tasks').update(updates).eq('id', task_id).execute()
    
    return jsonify({'success': True, 'active_seconds': int(active_seconds)})


@main_bp.route('/api/update_employee_rate', methods=['POST'])
@login_required
def update_employee_rate():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    supabase = get_supabase()
    updates = {}
    if 'hourly_rate' in data: updates['hourly_rate'] = float(data['hourly_rate'])
    if 'name' in data: updates['name'] = data['name']
    if 'username' in data: updates['username'] = data['username']
    if 'worker_id' in data: updates['worker_id'] = data['worker_id']

    if not updates:
        return jsonify({'error': 'No data to update'}), 400

    try:
        supabase.table('users').update(updates).eq('id', data['employee_id']).execute()
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'success': True})

@main_bp.route('/api/tasks')
@login_required
def get_tasks():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    
    tasks = Task.get_all()
    filtered_tasks = [t for t in tasks if t.status in ['active', 'break', 'pending', 'clocked_out', 'clocked_in', 'Active', 'Break', 'Pending', 'Clocked_In', 'Clocked_Out']]
    
    return jsonify({
        'tasks': [t.to_dict() for t in filtered_tasks]
    })



@main_bp.route('/api/hire_employee', methods=['POST'])
@login_required
def hire_employee():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    supabase = get_supabase()

    username = data.get('username')
    worker_id = data.get('worker_id')
    name = data.get('name')
    password = data.get('password')
    hourly_rate = float(data.get('hourly_rate', 0.0))

    if User.find_by_username(username):
        return jsonify({'error': 'Username already exists'}), 400

    user_id = str(uuid.uuid4())
    try:
        supabase.table('users').insert({
            'id': user_id,
            'worker_id': worker_id,
            'username': username,
            'name': name,
            'password': password,
            'role': 'employee',
            'hourly_rate': hourly_rate
        }).execute()
    except Exception as e:
        return jsonify({'error': str(e)}), 500
        
    return jsonify({'success': True})


@main_bp.route('/api/delete_employee', methods=['POST'])
@login_required
def delete_employee():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    supabase = get_supabase()
    supabase.table('users').delete().eq('id', data['employee_id']).execute()
    return jsonify({'success': True})

