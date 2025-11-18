import { _supabase } from './auth.js';

// Global state
let navDate = new Date();
let allShiftsData = [];
let allAssignmentsData = [];

import { formatProjectTime, loadDisplayPreferences } from './utils.js';
// Helper to format time
const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function loadCalendar() {
    const month = navDate.getMonth();
    const year = navDate.getFullYear();
    
    if (allShiftsData.length === 0) {
        const { data: shifts, error: shiftError } = await _supabase.from('shifts').select('*, projects(id, name)');
        const { data: assignments, error: asgnError } = await _supabase.from('assignments').select('*, employees(full_name)');
        
        if (shiftError) return console.error(shiftError);
        if (asgnError) return console.error(asgnError);
        
        allShiftsData = shifts || [];
        allAssignmentsData = assignments || [];
    }
    
    const shiftsByDay = {};
    allShiftsData.forEach(shift => {
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
    
    for (let i = 0; i < firstDayOfMonth; i++) {
        container.innerHTML += `<div class="day-cell other-month"></div>`;
    }
    
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
                </a>
            `;
        });
        
        container.innerHTML += `
            <div class="day-cell">
                <div class="day-number">${day}</div>
                ${shiftsHtml}
            </div>
        `;
    }
}

// --- Add Event Listeners for Navigation ---
document.getElementById('prev-month-btn').addEventListener('click', () => {
    navDate.setMonth(navDate.getMonth() - 1);
    loadCalendar();
});

document.getElementById('next-month-btn').addEventListener('click', () => {
    navDate.setMonth(navDate.getMonth() + 1);
    loadCalendar();
});

// Initial Load
loadCalendar();