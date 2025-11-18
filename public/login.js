import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = 'https://dblgrrusqxkdwgzyagtg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibGdycnVzcXhrZHdnenlhZ3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NDYzNTcsImV4cCI6MjA3NzAyMjM1N30.Au4AyxrxE0HzLqYWfMcUePMesbZTrfoIFF3Cp0RloWI';
const _supabase = createClient(supabaseUrl, supabaseKey);

const loginForm = document.getElementById('login-form');
const errorBox = document.getElementById('error-box');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = loginForm.elements.email.value;
    const password = loginForm.elements.password.value;

    const { error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        errorBox.textContent = `Login Failed: ${error.message}`;
        errorBox.style.display = 'block';
    } else {
        window.location.href = '/'; 
    }
});

// Redirect if already logged in
const { data: { session } } = await _supabase.auth.getSession();
if (session) {
    window.location.href = '/';
}