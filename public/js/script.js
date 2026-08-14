// ============================================================
// SHINEX LEARNING CIRCLE – GLOBAL THEME CONTROLLER v5.0
// COMPLETE DARK/LIGHT MODE WITH ZERO THEME MIXING
// ============================================================

// ===== PAGE LOADER =====
document.addEventListener('DOMContentLoaded', function() {
    const loader = document.getElementById('page-loader');
    if (loader) {
        setTimeout(function() {
            loader.classList.add('hidden');
            document.body.style.opacity = '1';
        }, 1200);
    }
    
    // Initialize theme
    initGlobalTheme();
    initAllComponents();
});

// ============================================================
// GLOBAL THEME SYSTEM - SINGLE SOURCE OF TRUTH
// ============================================================
function initGlobalTheme() {
    const body = document.body;
    
    // Check saved theme
    const savedTheme = localStorage.getItem('shinex-theme');
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
    } else {
        body.classList.remove('dark-mode');
    }
    
    // Update all toggle buttons
    updateAllThemeToggles();
    
    // Listen for theme changes
    document.addEventListener('themeChanged', function(e) {
        updateAllThemeToggles();
    });
}

function toggleGlobalTheme() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('shinex-theme', isDark ? 'dark' : 'light');
    
    // Dispatch event for other components
    document.dispatchEvent(new CustomEvent('themeChanged', { 
        detail: { isDark: isDark } 
    }));
    
    // Show toast notification
    showToast(isDark ? '🌙 Dark mode activated' : '☀️ Light mode activated', 'success');
    
    // Update all toggles
    updateAllThemeToggles();
}

function updateAllThemeToggles() {
    const isDark = document.body.classList.contains('dark-mode');
    const toggles = document.querySelectorAll('.theme-toggle, .dark-toggle');
    
    toggles.forEach(toggle => {
        const label = toggle.querySelector('.toggle-label');
        const icon = toggle.querySelector('i') || toggle;
        
        if (isDark) {
            if (label) label.textContent = 'Light';
            if (icon.tagName === 'I') {
                icon.className = 'fas fa-sun';
            } else {
                toggle.innerHTML = '☀️ <span class="toggle-label">Light</span>';
            }
        } else {
            if (label) label.textContent = 'Dark';
            if (icon.tagName === 'I') {
                icon.className = 'fas fa-moon';
            } else {
                toggle.innerHTML = '🌙 <span class="toggle-label">Dark</span>';
            }
        }
    });
    
    // Update settings checkboxes
    const darkModeSettings = document.querySelectorAll('.dark-mode-setting');
    darkModeSettings.forEach(cb => {
        if (cb.type === 'checkbox') {
            cb.checked = isDark;
        }
    });
}

// ============================================================
// TEXT SIZE CONTROL
// ============================================================
function initTextSizeControl() {
    const sliders = document.querySelectorAll('.text-size-slider');
    const body = document.body;
    
    // Load saved size
    const savedSize = localStorage.getItem('shinex-text-size') || 16;
    body.style.fontSize = savedSize + 'px';
    
    sliders.forEach(slider => {
        const valueDisplay = slider.parentElement.querySelector('.text-size-value');
        
        slider.value = savedSize;
        if (valueDisplay) valueDisplay.textContent = savedSize + 'px';
        
        slider.addEventListener('input', function() {
            const size = this.value;
            body.style.fontSize = size + 'px';
            if (valueDisplay) valueDisplay.textContent = size + 'px';
            localStorage.setItem('shinex-text-size', size);
            
            // Sync all sliders
            document.querySelectorAll('.text-size-slider').forEach(s => {
                if (s !== this) s.value = size;
                const display = s.parentElement.querySelector('.text-size-value');
                if (display) display.textContent = size + 'px';
            });
        });
    });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.transition = 'all 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// ============================================================
// FLOATING AI BOT
// ============================================================
function initAIBot() {
    const botBtn = document.getElementById('aiBotBtn');
    const chatModal = document.getElementById('aiChatModal');
    const chatClose = document.getElementById('aiChatClose');
    const chatInput = document.getElementById('aiChatInput');
    const chatSend = document.getElementById('aiChatSend');
    const chatMessages = document.getElementById('aiChatMessages');
    
    if (!botBtn || !chatModal) return;
    
    botBtn.addEventListener('click', function() {
        chatModal.classList.toggle('open');
        if (chatModal.classList.contains('open')) {
            chatInput.focus();
        }
    });
    
    if (chatClose) {
        chatClose.addEventListener('click', function() {
            chatModal.classList.remove('open');
        });
    }
    
    document.addEventListener('click', function(e) {
        if (chatModal.classList.contains('open')) {
            if (!chatModal.contains(e.target) && e.target !== botBtn && !botBtn.contains(e.target)) {
                chatModal.classList.remove('open');
            }
        }
    });
    
    function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;
        
        addChatMessage(message, 'user');
        chatInput.value = '';
        chatInput.disabled = true;
        chatSend.disabled = true;
        
        const loadingMsg = addChatMessage('Thinking...', 'bot', true);
        
        fetch('/api/ai-tutor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userPrompt: message })
        })
        .then(response => response.json())
        .then(data => {
            if (loadingMsg) loadingMsg.remove();
            
            if (data.error) {
                addChatMessage('❌ ' + data.error, 'bot');
            } else {
                addChatMessage(data.answer, 'bot');
            }
            chatInput.disabled = false;
            chatSend.disabled = false;
            chatInput.focus();
        })
        .catch(error => {
            if (loadingMsg) loadingMsg.remove();
            addChatMessage('❌ Sorry, I\'m having trouble connecting. Please try again.', 'bot');
            chatInput.disabled = false;
            chatSend.disabled = false;
        });
    }
    
    if (chatSend) {
        chatSend.addEventListener('click', sendMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

function addChatMessage(text, type, isLoading = false) {
    const container = document.getElementById('aiChatMessages');
    if (!container) return null;
    
    const div = document.createElement('div');
    div.className = 'ai-chat-msg ' + type;
    if (isLoading) {
        div.innerHTML = '<span class="ai-chat-loading">⏳ Thinking...</span>';
        div.id = 'aiChatLoading';
    } else {
        let formatted = text;
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/`(.+?)`/g, '<code>$1</code>');
        formatted = formatted.replace(/\n/g, '<br>');
        div.innerHTML = formatted;
    }
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

// ============================================================
// SETTINGS: SAVE PROFILE & ALL TABS
// ============================================================
function initSettings() {
    // Profile Save
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            
            fetch('/settings/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('✅ Profile updated successfully!', 'success');
                } else {
                    showToast('❌ ' + data.error, 'error');
                }
            })
            .catch(() => {
                showToast('❌ Something went wrong. Please try again.', 'error');
            });
        });
    }
    
    // Password Change
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const newPass = formData.get('newPassword');
            const confirmPass = formData.get('confirmPassword');
            
            if (newPass !== confirmPass) {
                showToast('❌ Passwords do not match!', 'error');
                return;
            }
            if (newPass.length < 6) {
                showToast('❌ Password must be at least 6 characters.', 'error');
                return;
            }
            
            fetch('/settings/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('✅ Password changed successfully!', 'success');
                    this.reset();
                } else {
                    showToast('❌ ' + data.error, 'error');
                }
            })
            .catch(() => {
                showToast('❌ Something went wrong. Please try again.', 'error');
            });
        });
    }
    
    // Appearance Settings - Dark Mode
    const darkModeSettings = document.querySelectorAll('.dark-mode-setting');
    darkModeSettings.forEach(cb => {
        cb.addEventListener('change', function() {
            const isChecked = this.checked;
            const body = document.body;
            
            if (isChecked) {
                body.classList.add('dark-mode');
                localStorage.setItem('shinex-theme', 'dark');
            } else {
                body.classList.remove('dark-mode');
                localStorage.setItem('shinex-theme', 'light');
            }
            
            document.dispatchEvent(new CustomEvent('themeChanged', {
                detail: { isDark: isChecked }
            }));
            
            updateAllThemeToggles();
            showToast(isChecked ? '🌙 Dark mode enabled' : '☀️ Light mode enabled', 'success');
        });
    });
    
    // Other settings...
    const notificationCheckboxes = document.querySelectorAll('.notification-checkbox');
    notificationCheckboxes.forEach(cb => {
        cb.addEventListener('change', function() {
            const formData = new FormData();
            formData.append(this.name, this.checked ? 'on' : 'off');
            fetch('/settings/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('✅ Notification preference updated', 'success');
                } else {
                    showToast('❌ ' + data.error, 'error');
                }
            })
            .catch(() => showToast('❌ Something went wrong.', 'error'));
        });
    });
}

// ============================================================
// CLASS COMPLETE
// ============================================================
function initClassComplete() {
    const completeBtn = document.getElementById('completeClassBtn');
    if (completeBtn) {
        completeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const url = this.getAttribute('data-url');
            const nextUrl = this.getAttribute('data-next') || window.location.href;
            
            fetch(url, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('🎉 Class completed! +10 points!', 'success');
                    setTimeout(() => window.location.href = nextUrl, 1500);
                } else {
                    showToast('❌ ' + data.error, 'error');
                }
            })
            .catch(() => {
                showToast('❌ Something went wrong. Please try again.', 'error');
            });
        });
    }
}

// ============================================================
// SETTINGS SIDEBAR NAVIGATION
// ============================================================
function initSettingsNav() {
    const navLinks = document.querySelectorAll('.settings-nav a');
    const sections = document.querySelectorAll('.settings-section');
    
    if (navLinks.length === 0) return;
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = this.getAttribute('data-target');
            
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === target) {
                    section.classList.add('active');
                }
            });
        });
    });
}

// ============================================================
// RESPONSIVE SETTINGS SIDEBAR
// ============================================================
function initResponsiveSettings() {
    const toggleBtn = document.getElementById('settingsToggle');
    const sidebar = document.querySelector('.settings-sidebar');
    
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('open');
        });
    }
}

// ============================================================
// AUTO-DISMISS ALERTS
// ============================================================
function initAlerts() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.transition = 'opacity 0.5s ease';
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 500);
        }, 5000);
    });
}

// ============================================================
// FAQ ACCORDION
// ============================================================
function initFaq() {
    const questions = document.querySelectorAll('.faq-question');
    questions.forEach(q => {
        q.addEventListener('click', function() {
            const answer = this.nextElementSibling;
            const icon = this.querySelector('.fa-chevron-down');
            answer.classList.toggle('open');
            if (icon) icon.classList.toggle('rotated');
        });
    });
}

// ============================================================
// INITIALIZE ALL COMPONENTS
// ============================================================
function initAllComponents() {
    initTextSizeControl();
    initAIBot();
    initSettings();
    initClassComplete();
    initSettingsNav();
    initResponsiveSettings();
    initAlerts();
    initFaq();
    
    // Show flash messages as toasts
    const flashMessages = document.querySelectorAll('.flash-message');
    flashMessages.forEach(msg => {
        const type = msg.dataset.type || 'info';
        const text = msg.textContent.trim();
        if (text) {
            showToast(text, type);
        }
        msg.remove();
    });
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const chatModal = document.getElementById('aiChatModal');
        if (chatModal && chatModal.classList.contains('open')) {
            chatModal.classList.remove('open');
        }
    }
    
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleGlobalTheme();
    }
});

// ============================================================
// CONSOLE WELCOME
// ============================================================
console.log('🚀 SHINEX Learning Circle (SLC lmt.®)');
console.log('📚 Empowering minds with cutting-edge courses.');
console.log('💡 Tip: Press Ctrl+Shift+D to toggle dark mode!');
console.log('🎨 Theme: ' + (localStorage.getItem('shinex-theme') || 'light'));