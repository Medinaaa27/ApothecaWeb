import { supabase } from './db.js';

// Simple admin credentials (in production, use proper authentication)
const ADMIN_CREDENTIALS = {
  'Hans': 'Hans4321',
  'Allen': 'Allen4321',
  'Marc': 'Marc4321',
  'Damian': 'Damian4321'
};

// fix dapat separate per log in siya

window.login = async function() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorDiv = document.getElementById('login-error');

  if (!username || !password) {
    showError('Please enter both username and password.');
    return;
  }

  // Check credentials
  if (ADMIN_CREDENTIALS[username] === password) {
    // Store login state
    localStorage.setItem('adminLoggedIn', 'true');
    localStorage.setItem('adminUser', username);
    localStorage.setItem('adminRole', getRoleFromUsername(username));
    
    // Redirect to main dashboard
    window.location.href = 'index.html';
  } else {
    showError('Invalid username or password.');
  }
};

function getRoleFromUsername(username) {
  switch(username) {
    case 'Hans': return 'admin';
    case 'Allen': return 'admin';
    case 'Marc': return 'admin';
    case 'Damian': return 'admin';
    default: return 'user';
  }
}

function showError(message) {
  const errorDiv = document.getElementById('login-error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Handle Enter key
document.addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    login();
  }
});
