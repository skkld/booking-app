const supabaseUrl = 'https://dblgrrusqxkdwgzyagtg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibGdycnVzcXhrZHdnenlhZ3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NDYzNTcsImV4cCI6MjA3NzAyMjM1N30.Au4AyxrxE0HzLqYWfMcUePMesbZTrfoIFF3Cp0RloWI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

function calculateHours(start, end) {
    if (!start || !end) return '0.00';
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return ((endMs - startMs) / (1000 * 60 * 60)).toFixed(2);
}

function getDateRange(filterValue) {
    const now = new Date();
    let startDate, endDate;
    if (filterValue === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (filterValue === 'quarter') {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
    } else if (filterValue === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
    }
    return { startDate, endDate };
}

async function loadStaticDashboardData() {
    const [assignmentsRes, timecardsRes] = await Promise.all([
        _supabase.from('assignments').select('shift_id'),
        _supabase.from('timecard_entries').select('*, employees(full_name), shifts(*, projects(name))').eq('status', 'pending').limit(5)
    ]);
    
    const assignments = assignmentsRes.data || [];
    const pendingTimecards = timecardsRes.data || [];

    displayPendingTimecards(pendingTimecards);
    
    const { data: shifts } = await _supabase.from('shifts').select('*, projects(name, id)').order('start_time');
    displayOpenShifts(shifts || [], assignments);
}

function displayPendingTimecards(timecards) {
    const container = document.getElementById('timecard-summary-list');
    document.getElementById('pending-timecards-count').textContent = timecards.length;
    
    if (timecards.length === 0) {
        container.innerHTML = `<tr><td colspan="4">No timecards awaiting approval.</td></tr>`;
        return;
    }

    container.innerHTML = '';
    timecards.forEach(entry => {
        const projectName = entry.shifts?.projects?.name || 'Unknown Project';
        const shiftName = entry.shifts?.name || 'Unknown Shift';
        const totalHours = calculateHours(entry.clock_in, entry.clock_out);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${entry.employees?.full_name || 'Unknown'}</strong></td>
            <td>${projectName} / ${shiftName}</td>
            <td>${totalHours} hrs</td>
            <td><a href="/timecards.html" class="btn btn-secondary" style="padding: 0.25rem 0.75rem;">Review</a></td>
        `;
        container.appendChild(row);
    });
}

function displayOpenShifts(shifts, assignments) {
    const container = document.getElementById('open-shifts-list');
    const validShifts = shifts.filter(shift => shift.projects);

    const shiftsWithOpenings = validShifts.filter(shift => {
        const assignedCount = assignments.filter(a => a.shift_id === shift.id).length;
        return assignedCount < shift.people_needed;
    }).slice(0, 5);

    document.getElementById('open-shifts-count').textContent = shiftsWithOpenings.length;
    container.innerHTML = '';

    if (shiftsWithOpenings.length === 0) {
        container.innerHTML = `<li class="list-item-summary">All shifts are currently filled.</li>`;
        return;
    }

    shiftsWithOpenings.forEach(shift => {
        const assignedCount = assignments.filter(a => a.shift_id === shift.id).length;
        const needed = shift.people_needed - assignedCount;
        
        const item = document.createElement('li');
        item.className = 'list-item-summary';
        // **UPDATED: Color set to Yellow**
        item.innerHTML = `
            ${shift.projects.name} - ${shift.name} (${shift.role})
            <span style="float: right; color: #fbbf24; font-weight: 700;">Needs ${needed}</span>
        `;
        container.appendChild(item);
    });
}

async function displayUpcomingProjects(filterValue) {
    const container = document.getElementById('upcoming-projects-list');
    container.innerHTML = `<li class="list-item-summary">Loading projects...</li>`;

    const { startDate, endDate } = getDateRange(filterValue);
    
    const { data: projects, error } = await _supabase
        .from('projects')
        .select('*')
        .eq('status', 'active')
        .gte('start_date', startDate.toISOString())
        .lte('start_date', endDate.toISOString())
        .order('start_date', { ascending: true });

    if (error) {
        console.error("Error fetching projects:", error);
        container.innerHTML = `<li class="list-item-summary">Error loading projects.</li>`;
        return;
    }

    container.innerHTML = '';
    if (projects.length === 0) {
        container.innerHTML = `<li class="list-item-summary">No projects scheduled for this period.</li>`;
        return;
    }

    projects.forEach(project => {
        const projDate = new Date(project.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const item = document.createElement('li');
        item.className = 'list-item-summary';
        item.innerHTML = `<a href="/project-details.html?id=${project.id}" style="text-decoration: none; color: inherit;">
            <strong>${project.name}</strong> <span style="float: right; color: var(--text-light);">${projDate}</span>
        </a>`;
        container.appendChild(item);
    });
}

document.getElementById('project-date-filter').addEventListener('change', (event) => {
    const selectedFilter = event.target.value;
    displayUpcomingProjects(selectedFilter);
});

loadStaticDashboardData();
displayUpcomingProjects('month');