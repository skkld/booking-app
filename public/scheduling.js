import { _supabase, getUserRole } from './auth.js';

let navDate = new Date();
let allShiftsData = [];
let allAssignmentsData = [];

const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function loadCalendar() {
    const month = navDate.getMonth();
    const year = navDate.getFullYear();
    
    // --- ROLE CHECK ---
    const role = getUserRole();
    const { data: { user } } = await _supabase.auth.getUser();
    // ------------------

    if (allShiftsData.length === 0) {
        const { data: shifts, error: shiftError } = await _supabase.from('shifts').select('*, projects(id, name)');
        const { data: assignments, error: asgnError } = await _supabase.from('assignments').select('*, employees(id, full_name, user_id)');
        
        if (shiftError || asgnError) return console.error(shiftError || asgnError);
        
        allShiftsData = shifts || [];
        allAssignmentsData = assignments || [];
    }

    // **FILTERING LOGIC**
    let filteredShifts = allShiftsData;
    
    if (role === 'crew' && user) {
        // 1. Find the employee record for this user
        // We need to search the assignments data because we can't trust local storage for ID
        // Or better, fetch the employee ID once.
        const { data: employee } = await _supabase.from('employees').select('id').eq('user_id', user.id).single();
        
        if (employee) {
            // 2. Get all shift IDs assigned to this employee
            const myShiftIds = allAssignmentsData
                .filter(a => a.employee_id === employee.id)
                .map(a => a.shift_id);
            
            // 3. Filter the master shift list
            filteredShifts = allShiftsData.filter(s => myShiftIds.includes(s.id));
        } else {
            filteredShifts = []; // No employee profile found
        }
    }

    const shiftsByDay = {};
    filteredShifts.forEach(shift => {
        if (!shift.projects) return;
        
        const shiftDate = new Date(shift.start_time);
        const dayKey = `${shiftDate.getFullYear()}-${shiftDate.getMonth() + 1}-${shiftDate.getDate()}`;
        if (!shiftsByDay[dayKey]) shiftsByDay[dayKey] = [];
        
        const assignments = allAssignmentsData.filter(a => a.shift_id === shift.id);
        const crewNames = assignments.map(a => a.employees.full_name).join(', ');
        const needsCount = shift.people_needed - assignments.length;
        
        shiftsByDay[dayKey].push({
            project_name: shift.projects.name,
            project_id: shift.projects.id,
            role: shift.role,
            time: formatTime(shift.start_time),
            crew: crewNames || 'None',
            needed: needsCount > 0 ? `Needs ${needsCount}` : ''
        });
    });

    renderCalendarGrid(year, month, shiftsByDay);
}

function renderCalendarGrid(year, month, shiftsByDay) {
    const container = document.getElementById('calendar-days-container');
    container.innerHTML = ''; 
    document.getElementById('month-year-header').textContent = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDayOfMonth; i++) container.innerHTML += `<div class="day-cell other-month"></div>`;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = `${year}-${month + 1}-${day}`;
        const shifts = shiftsByDay[dayKey] || [];
        let shiftsHtml = '';
        shifts.forEach(shift => {
            shiftsHtml += `
                <a href="/project-details.html?id=${shift.project_id}" class="shift-entry-link">
                    <div class="shift-entry">
                        <strong>${shift.project_name}</strong>
                        <div>${shift.role} - ${shift.time}</div>
                        <div class="crew-list">${shift.crew}</div>
                        ${shift.needed ? `<div class="crew-needed">${shift.needed}</div>` : ''}
                    </div>
                </a>`;
        });
        container.innerHTML += `<div class="day-cell"><div class="day-number">${day}</div>${shiftsHtml}</div>`;
    }
}

document.getElementById('prev-month-btn').addEventListener('click', () => { navDate.setMonth(navDate.getMonth() - 1); loadCalendar(); });
document.getElementById('next-month-btn').addEventListener('click', () => { navDate.setMonth(navDate.getMonth() + 1); loadCalendar(); });
loadCalendar();