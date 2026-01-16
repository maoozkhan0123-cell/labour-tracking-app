let activeTimer = null;
let startTime = null;
let currentMo = null;

document.addEventListener('DOMContentLoaded', () => {
    loadMOs();
    loadEmployees();
});

// --- Data Loading ---
async function loadMOs() {
    try {
        const res = await fetch('/api/mos');
        const data = await res.json();
        const container = document.getElementById('mo-dashboard');

        if (data.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #64748b; margin-top: 50px;">No Active Manufacturing Orders</div>';
            return;
        }

        container.innerHTML = data.map(mo => `
            <div class="mo-card glass ${mo.state}" onclick='openModal(${JSON.stringify(mo).replace(/'/g, "&#39;")})'>
                <span class="status-badge">${mo.state}</span>
                <h3>${mo.name}</h3>
                <div class="mo-detail">${mo.product_id[1]}</div>
                <div class="mo-detail">Qty: ${mo.qty_producing}</div>
                <div class="mo-detail" style="margin-top: 1rem; color: #60a5fa;">Click to Start Work →</div>
            </div>
        `).join('');
    } catch (e) {
        console.error("Error loading MOs", e);
    }
}

async function loadEmployees() {
    try {
        const res = await fetch('/api/employees');
        const employees = await res.json();
        const select = document.getElementById('employee-select');
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.name} (${emp.job_id ? emp.job_id[1] : 'Staff'})`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Error loading employees", e);
    }
}

// --- Modal Logic ---
const modal = document.getElementById('timer-overlay');
const setupStep = document.getElementById('setup-step');
const activeStep = document.getElementById('active-step');

function openModal(mo) {
    if (activeTimer) {
        alert("Please complete the current task before starting a new one.");
        return;
    }
    currentMo = mo;
    document.getElementById('modal-mo-title').textContent = mo.name;
    document.getElementById('modal-product').textContent = mo.product_id[1];

    // Reset state
    setupStep.classList.remove('hidden');
    activeStep.classList.add('hidden');
    document.getElementById('task-desc').value = '';

    modal.classList.add('active');
}

function closeModal() {
    if (activeTimer) return; // Cannot close if timer running
    modal.classList.remove('active');
    currentMo = null;
}

// --- Specific Task Helper ---
function fillTask(text) {
    document.getElementById('task-desc').value = text;
}

// --- Timer Logic ---
function startTimer() {
    const employeeId = document.getElementById('employee-select').value;
    const taskDesc = document.getElementById('task-desc').value;

    if (!employeeId || !taskDesc) {
        alert("Please select an employee and enter a task description.");
        return;
    }

    startTime = new Date();

    // Switch Views
    setupStep.classList.add('hidden');
    activeStep.classList.remove('hidden');

    // Update Info
    const empName = document.getElementById('employee-select').options[document.getElementById('employee-select').selectedIndex].text;
    document.getElementById('active-info').innerHTML = `
        <strong>${empName}</strong><br>
        ${taskDesc}
    `;

    // Start Clock
    activeTimer = setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const diff = now - startTime;

    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    document.getElementById('timer').textContent =
        `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function stopTimer() {
    if (!confirm("Are you sure you are done?")) return;

    clearInterval(activeTimer);
    activeTimer = null;

    const endTime = new Date();
    const durationMs = endTime - startTime;
    const durationHours = durationMs / 3600000; // Decimal hours

    const payload = {
        mo_id: currentMo.id,
        employee_id: parseInt(document.getElementById('employee-select').value),
        duration_hours: parseFloat(durationHours.toFixed(4)), // 4 decimal precision
        description: document.getElementById('task-desc').value
    };

    // Show loading
    const btn = document.querySelector('.btn-danger');
    const originalText = btn.textContent;
    btn.textContent = "Syncing with Odoo...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            alert("Success! Time recorded and costs updated.");
            closeModal();
            modal.classList.remove('active'); // Force close
        } else {
            alert("Error syncing with Odoo. Please check the logs.");
        }
    } catch (e) {
        alert("Network error.");
        console.error(e);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
