from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from .models import db, User, Task, Break
from datetime import datetime

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
        role = request.form.get('role') # 'manager' or 'employee'
        user = User.query.filter_by(username=username).first()
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
    employees = User.query.filter_by(role='employee').all()
    tasks = Task.query.all()
    
    # Calculate Person Summary and Status
    person_summary = {}
    for emp in employees:
        emp_tasks = [t for t in tasks if t.assigned_to_id == emp.id]
        active_sec = sum(t.active_seconds for t in emp_tasks)
        break_sec = sum(t.break_seconds for t in emp_tasks)
        
        # Check current status
        current_task = Task.query.filter_by(assigned_to_id=emp.id, status='active').first()
        on_break_task = Task.query.filter_by(assigned_to_id=emp.id, status='break').first()
        
        status = 'Free'
        current_job = ""
        if current_task:
            status = 'Working'
            current_job = current_task.description
        elif on_break_task:
            status = 'On Break'
            current_job = on_break_task.description

        person_summary[emp.id] = {
            'active_sec': active_sec,
            'break_sec': break_sec,
            'total_sec': active_sec + break_sec,
            'total_earned': sum(t.amount_earned for t in emp_tasks),
            'status': status,
            'current_job': current_job
        }
    
    return render_template('manager_dashboard.html', 
                          employees=employees, 
                          tasks=tasks, 
                          person_summary=person_summary)

@main_bp.route('/api/assign_task', methods=['POST'])
@login_required
def assign_task():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    
    assignments = data.get('assignments', [])
    description = data.get('description')
    mo_ref = data.get('mo_reference', 'N/A')

    if not assignments:
        return jsonify({'error': 'No employees selected'}), 400

    for assign in assignments:
        try:
            rate = float(assign.get('hourly_rate')) if assign.get('hourly_rate') else 0.0
        except:
            rate = 0.0
            
        new_task = Task(
            description=description,
            mo_reference=mo_ref,
            assigned_to_id=assign['employee_id'],
            hourly_rate=rate,
            status='pending'
        )
        db.session.add(new_task)
    
    db.session.commit()
    return jsonify({'success': True})

# --- Employee Actions ---
@main_bp.route('/employee')
@login_required
def employee_portal():
    if current_user.role != 'employee':
        return redirect(url_for('main.index'))
    tasks = Task.query.filter_by(assigned_to_id=current_user.id).order_by(Task.id.desc()).all()
    return render_template('employee_portal.html', tasks=tasks)

@main_bp.route('/api/task/<int:task_id>/action', methods=['POST'])
@login_required
def task_action(task_id):
    data = request.get_json()
    action = data.get('action') 
    task = Task.query.get_or_404(task_id)
    now = datetime.utcnow()
    
    if action == 'start':
        task.status = 'active'
        task.start_time = now
        task.last_action_time = now
    elif action == 'break':
        # 1. Close current active period and add to active_seconds
        if task.status == 'active' and task.last_action_time:
            diff = now - task.last_action_time
            task.active_seconds += int(diff.total_seconds())
        
        # 2. Transition to break
        task.status = 'break'
        task.last_action_time = now # Use this as the break start time
        new_break = Break(task_id=task.id, reason=data.get('reason', 'Break'), start_time=now)
        db.session.add(new_break)
    elif action == 'resume':
        # 1. Close current break period and add to break_seconds
        if task.status == 'break' and task.last_action_time:
            diff = now - task.last_action_time
            task.break_seconds += int(diff.total_seconds())
            
            # Also close the Break record in DB
            last_break = Break.query.filter_by(task_id=task.id).order_by(Break.id.desc()).first()
            if last_break and not last_break.end_time:
                last_break.end_time = now

        # 2. Transition back to active
        task.status = 'active'
        task.last_action_time = now # Use this as the new active period start
    elif action == 'complete':
        # 1. Finalize the current period (either active or break)
        if task.last_action_time:
            diff = now - task.last_action_time
            if task.status == 'active':
                task.active_seconds += int(diff.total_seconds())
            elif task.status == 'break':
                task.break_seconds += int(diff.total_seconds())
        
        # 2. Transition to completed
        task.status = 'completed'
        task.end_time = now
        total_diff = now - task.start_time
        task.total_duration_seconds = int(total_diff.total_seconds())

    db.session.commit()
    return jsonify({'success': True})

@main_bp.route('/api/update_employee_rate', methods=['POST'])
@login_required
def update_employee_rate():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    user = User.query.get(data['employee_id'])
    if user:
        user.hourly_rate = float(data['hourly_rate'])
        db.session.commit()
    return jsonify({'success': True})
@main_bp.route('/api/hire_employee', methods=['POST'])
@login_required
def hire_employee():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.json
    
    username = data.get('username')
    name = data.get('name')
    password = data.get('password')
    hourly_rate = float(data.get('hourly_rate', 0.0))

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400

    new_user = User(
        username=username,
        name=name,
        password=password,
        role='employee',
        hourly_rate=hourly_rate
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'success': True})
