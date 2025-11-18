import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = 'https://dblgrrusqxkdwgzyagtg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibGdycnVzcXhrZHdnenlhZ3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NDYzNTcsImV4cCI6MjA3NzAyMjM1N30.Au4AyxrxE0HzLqYWfMcUePMesbZTrfoIFF3Cp0RloWI';

export const _supabase = createClient(supabaseUrl, supabaseKey);

// 1. Check Session
const { data: { session } } = await _supabase.auth.getSession();

if (!session) {
    window.location.href = '/login.html';
} else {
    const { data: employee, error } = await _supabase
        .from('employees')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

    if (error || !employee) {
        console.error("Authenticated user has no matching employee profile.");
        localStorage.setItem('userRole', 'crew');
    } else {
        localStorage.setItem('userRole', employee.role);
    }

    // --- NEW: Initialize Mobile Menu ---
    initMobileMenu();
    
    // --- NEW: Initialize Single Session Listener ---
    initSingleSessionListener(session.user.id);
}

export function getUserRole() {
    return localStorage.getItem('userRole') || 'crew';
}

// --- Mobile Menu Logic ---
function initMobileMenu() {
    // Only run if we are in a browser environment
    if (typeof document === 'undefined') return;

    // Inject the hamburger button into the header if it doesn't exist
    const header = document.querySelector('.header');
    if (header && !document.getElementById('mobile-menu-toggle')) {
        const btn = document.createElement('button');
        btn.id = 'mobile-menu-toggle';
        btn.innerHTML = '&#9776;'; // Hamburger icon
        // Insert as the very first item in the header
        header.insertBefore(btn, header.firstChild);

        // Add click listener
        btn.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            sidebar.classList.toggle('active');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            const sidebar = document.querySelector('.sidebar');
            const btn = document.getElementById('mobile-menu-toggle');
            if (window.innerWidth <= 768 && 
                sidebar.classList.contains('active') && 
                !sidebar.contains(e.target) && 
                e.target !== btn) {
                sidebar.classList.remove('active');
            }
        });
    }
}

// --- Single Session Logic ---
function initSingleSessionListener(userId) {
    // Listen for a 'force_logout' event on a channel specific to this user ID
    const channel = _supabase.channel(`user_session_${userId}`);
    
    channel.on('broadcast', { event: 'force_logout' }, async (payload) => {
        console.log('New login detected elsewhere. Logging out...');
        alert('You have logged in from another device. This session will now close.');
        await _supabase.auth.signOut();
        window.location.href = '/login.html';
    })
    .subscribe();
}