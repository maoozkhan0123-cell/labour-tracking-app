
@main_bp.route('/api/tasks')
@login_required
def get_all_tasks():
    if current_user.role != 'manager':
        return jsonify({'error': 'Unauthorized'}), 403
    
    tasks = Task.get_all()
    # Filter pending active break clocked_in clocked_out
    filtered = [t.to_dict() for t in tasks if t.status in ['active', 'break', 'pending', 'clocked_out', 'clocked_in']]
    # Include completed if needed or keep light? 
    # Frontend logic seems to replace allPendingTasks array. If we omit completed, they disappear from matrix?
    # Matrix cell logic filters by MO and Op. If completed task is missing, it won't show in cell. 
    # Usually matrix shows pending/active. Completed tasks might be hidden or shown.
    # Let's inspect control_matrix.html usage.
    # It uses it to "renderAssignedWorkers".
    return jsonify({'tasks': filtered})
