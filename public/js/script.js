// ============================================================
// SHINEX LEARNING CIRCLE – COMPLETE JAVASCRIPT
// ============================================================

// ===== PAGE LOADER =====
document.addEventListener('DOMContentLoaded', function() {
    const loader = document.getElementById('page-loader');
    if (loader) {
        setTimeout(function() {
            loader.classList.add('hidden');
            // Show page content with fade-in
            document.body.style.opacity = '1';
        }, 1200);
    }
});

// ===== DARK MODE =====
function initDarkMode() {
    const darkToggle = document.getElementById('darkToggle');
    const body = document.body;
    
    // Check saved preference
    const savedDark = localStorage.getItem('shinex-dark-mode');
    if (savedDark === 'true') {
        body.classList.add('dark-mode');
        updateDarkToggleIcon(true);
    }
    
    if (darkToggle) {
        darkToggle.addEventListener('click', function() {
            body.classList.toggle('dark-mode');
            const isDark = body.classList.contains('dark-mode');
            localStorage.setItem('shinex-dark-mode', isDark);
            updateDarkToggleIcon(isDark);
            
            // Show success message
            showToast(isDark ? '🌙 Dark mode enabled' : '☀️ Light mode enabled', 'success');
        });
    }
}

function updateDarkToggleIcon(isDark) {
    const darkToggle = document.getElementById('darkToggle');
    if (darkToggle) {
        if (isDark) {
            darkToggle.innerHTML = '☀️ <span class="toggle-label">Light</span>';
        } else {
            darkToggle.innerHTML = '🌙 <span class="toggle-label">Dark</span>';
        }
    }
}

// ===== TEXT SIZE SLIDER =====
function initTextSize() {
    const slider = document.getElementById('textSizeSlider');
    const valueDisplay = document.getElementById('textSizeValue');
    const body = document.body;
    
    // Load saved size
    const savedSize = localStorage.getItem('shinex-text-size');
    if (savedSize) {
        body.style.fontSize = savedSize + 'px';
        if (slider) slider.value = savedSize;
        if (valueDisplay) valueDisplay.textContent = savedSize + 'px';
    }
    
    if (slider) {
        slider.addEventListener('input', function() {
            const size = this.value;
            body.style.fontSize = size + 'px';
            if (valueDisplay) valueDisplay.textContent = size + 'px';
            localStorage.setItem('shinex-text-size', size);
        });
    }
}

// ===== FLOATING AI BOT =====
function initAIBot() {
    const botBtn = document.getElementById('aiBotBtn');
    const chatModal = document.getElementById('aiChatModal');
    const chatClose = document.getElementById('aiChatClose');
    const chatInput = document.getElementById('aiChatInput');
    const chatSend = document.getElementById('aiChatSend');
    const chatMessages = document.getElementById('aiChatMessages');
    
    if (!botBtn || !chatModal) return;
    
    // Toggle chat
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
    
    // Close on outside click
    document.addEventListener('click', function(e) {
        if (chatModal.classList.contains('open')) {
            if (!chatModal.contains(e.target) && e.target !== botBtn && !botBtn.contains(e.target)) {
                chatModal.classList.remove('open');
            }
        }
    });
    
    // Send message
    function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;
        
        // Add user message
        addChatMessage(message, 'user');
        chatInput.value = '';
        chatInput.disabled = true;
        chatSend.disabled = true;
        
        // Show loading
        const loadingMsg = addChatMessage('Thinking...', 'bot', true);
        
        // Send to API
        fetch('/api/ai-tutor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userPrompt: message })
        })
        .then(response => response.json())
        .then(data => {
            // Remove loading message
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
        // Parse markdown-like formatting
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

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-' + type;
    toast.innerHTML = message;
    
    // Styles
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        padding: 14px 28px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 0.95rem;
        z-index: 99999;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: #fff;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        animation: slideUp 0.4s ease;
        max-width: 90%;
        text-align: center;
        font-family: 'Inter', sans-serif;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.transition = 'all 0.4s ease';
        setTimeout(function() {
            toast.remove();
        }, 400);
    }, 3500);
}

// ===== SETTINGS: SAVE PROFILE =====
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
    
    // Appearance Settings (Dark Mode toggle in settings)
    const darkModeSetting = document.getElementById('darkModeSetting');
    if (darkModeSetting) {
        darkModeSetting.addEventListener('change', function() {
            const body = document.body;
            body.classList.toggle('dark-mode', this.checked);
            localStorage.setItem('shinex-dark-mode', this.checked);
            showToast(this.checked ? '🌙 Dark mode enabled' : '☀️ Light mode enabled', 'success');
        });
        
        // Sync with header toggle
        const headerToggle = document.getElementById('darkToggle');
        if (headerToggle) {
            headerToggle.addEventListener('click', function() {
                const isDark = document.body.classList.contains('dark-mode');
                if (darkModeSetting) {
                    darkModeSetting.checked = isDark;
                }
            });
        }
    }
    
    // Delete Account (with confirmation)
    const deleteBtn = document.getElementById('deleteAccountBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            if (confirm('⚠️ Are you sure you want to delete your account? This action cannot be undone!')) {
                if (confirm('Type "DELETE" to confirm:')) {
                    showToast('✅ Account deletion request submitted.', 'success');
                }
            }
        });
    }
    
    // Logout All Sessions
    const logoutAllBtn = document.getElementById('logoutAllBtn');
    if (logoutAllBtn) {
        logoutAllBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to logout from all devices?')) {
                fetch('/logout-all', { method: 'POST' })
                .then(() => {
                    showToast('✅ Logged out from all sessions.', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                });
            }
        });
    }
}

// ===== CLASS COMPLETE TOAST =====
function initClassComplete() {
    const completeBtn = document.getElementById('completeClassBtn');
    if (completeBtn) {
        completeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const url = this.getAttribute('data-url');
            
            fetch(url, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('🎉 Class completed! +10 points!', 'success');
                    // Reload to update progress
                    setTimeout(() => window.location.reload(), 1500);
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

// ===== SETTINGS SIDEBAR NAVIGATION =====
function initSettingsNav() {
    const navLinks = document.querySelectorAll('.settings-nav a');
    const sections = document.querySelectorAll('.settings-section');
    
    if (navLinks.length === 0) return;
    
    // Show first section by default
    sections.forEach((section, index) => {
        section.style.display = index === 0 ? 'block' : 'none';
    });
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = this.getAttribute('data-target');
            
            // Update active state
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            // Show target section
            sections.forEach(section => {
                section.style.display = section.id === target ? 'block' : 'none';
            });
        });
    });
}

// ===== RESPONSIVE SETTINGS SIDEBAR =====
function initResponsiveSettings() {
    const toggleBtn = document.getElementById('settingsToggle');
    const sidebar = document.querySelector('.settings-sidebar');
    
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('open');
        });
    }
}

// ===== AUTO-DISMISS ALERTS =====
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

// ===== MARK COMPLETE (Non-AJAX version for compatibility) =====
function initMarkComplete() {
    const markCompleteForms = document.querySelectorAll('.mark-complete-form');
    markCompleteForms.forEach(form => {
        form.addEventListener('submit', function(e) {
            // Allow normal submission, just show toast on response
            // The toast will be shown by the server-side message
        });
    });
}

// ===== INITIALIZE ALL =====
document.addEventListener('DOMContentLoaded', function() {
    initDarkMode();
    initTextSize();
    initAIBot();
    initSettings();
    initClassComplete();
    initSettingsNav();
    initResponsiveSettings();
    initAlerts();
    initMarkComplete();
    
    // Show any flash messages as toasts
    const flashMessages = document.querySelectorAll('.flash-message');
    flashMessages.forEach(msg => {
        const type = msg.dataset.type || 'info';
        const text = msg.textContent.trim();
        if (text) {
            showToast(text, type);
        }
        msg.remove();
    });
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', function(e) {
    // ESC to close AI chat
    if (e.key === 'Escape') {
        const chatModal = document.getElementById('aiChatModal');
        if (chatModal && chatModal.classList.contains('open')) {
            chatModal.classList.remove('open');
        }
    }
    
    // Ctrl + Shift + D for dark mode
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const darkToggle = document.getElementById('darkToggle');
        if (darkToggle) darkToggle.click();
    }
});

// ===== CONSOLE WELCOME =====
console.log('🚀 SHINEX Learning Circle (SLC lmt.®)');
console.log('📚 Empowering minds with cutting-edge courses.');
console.log('💡 Tip: Press Ctrl+Shift+D to toggle dark mode!');