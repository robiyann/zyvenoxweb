// Main Logic for CF Mail Frontend

// Simple fetch wrapper - no auth needed for public routes
async function apiFetch(url, options = {}) {
    options.headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };
    return fetch(url, options);
}
let currentAddress = null;
let currentToken = null;
let currentDomains = [];
let pollingInterval = null;
let selectedEmailId = null;

// UI Elements
const els = {
    domainDropdownContainer: document.getElementById('domain-dropdown-container'),
    domainDropdownBtn: document.getElementById('domain-dropdown-btn'),
    domainSelectedText: document.getElementById('domain-selected-text'),
    domainChevron: document.getElementById('domain-chevron'),
    domainDropdownMenu: document.getElementById('domain-dropdown-menu'),
    generateBtn: document.getElementById('generate-btn'),
    modeBtns: document.querySelectorAll('#mode-tabs button'),
    customInputWrap: document.getElementById('custom-input-wrap'),
    customPrefix: document.getElementById('custom-prefix'),
    customDomainLabel: document.getElementById('custom-domain-label'),
    tokenInput: document.getElementById('token-input'),
    currentTokenPill: document.getElementById('current-token-pill'),
    tokenDisplay: document.getElementById('nav-token-display'),
    topbarAddress: document.getElementById('topbar-address'),
    inboxCount: document.getElementById('inbox-count'),
    emailList: document.getElementById('email-list'),
    emptyState: document.getElementById('empty-state'),
    detailPanel: document.getElementById('email-detail-panel'),
    closeDetail: document.getElementById('close-email-detail'),
    syncDot: document.getElementById('sync-dot'),
    syncText: document.getElementById('sync-text'),
    manualSync: document.getElementById('manual-sync'),
    topbarCopy: document.getElementById('topbar-copy'),
    clearBox: document.getElementById('clear-box'),
    recentBox: document.getElementById('recent-inboxes'),
    toastContainer: document.getElementById('toast-container'),
    
    // mobile
    mobileNav: document.getElementById('mobile-nav'),
    openMobileNav: document.getElementById('open-mobile-nav'),
    closeMobileNav: document.getElementById('close-mobile-nav'),
};

let currentMode = 'random'; // 'random' | 'custom'
let currentSelectedDomain = '';
let isDomainMenuOpen = false;

// Initialize
async function init() {
    setupEventListeners();
    loadRecents();
    
    // Auto-select last used token if available
    const r = getRecents();
    if (r.length > 0) {
        setToken(r[0].token);
    }
}

function setupEventListeners() {
    // Smart Token Detector
    els.tokenInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        // If it looks like a token (at least 8 chars), try to submit it
        if (val.length >= 8) {
            setToken(val);
        }
    });

    // Enter key support for manual submission
    els.tokenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val) setToken(val);
        }
    });

    // Copy pill
    els.currentTokenPill.addEventListener('click', () => {
        if (!currentToken) return;
        navigator.clipboard.writeText(currentToken);
        toast('Token copied to clipboard!');
    });

    els.manualSync.addEventListener('click', () => {
        if (!currentToken) return;
        pollEmails();
        toast('Refreshing inbox...');
    });
    
    els.topbarCopy.addEventListener('click', () => {
        if (!currentAddress) return;
        navigator.clipboard.writeText(currentAddress);
        toast('Address copied to clipboard!');
    });
    
    els.clearBox.addEventListener('click', clearInbox);
    els.closeDetail.addEventListener('click', closeEmailDetail);

    // Mobile nav
    els.openMobileNav.addEventListener('click', () => els.mobileNav.classList.remove('-translate-x-full'));
    els.closeMobileNav.addEventListener('click', () => els.mobileNav.classList.add('-translate-x-full'));
}

async function setToken(token) {
    if (currentToken === token) return;
    currentToken = token;
    
    // Fetch mailbox info to verify token and get address
    try {
        const res = await fetch(`/api/mailboxes/token/${token}`);
        if (!res.ok) throw new Error("Invalid token");
        const data = await res.json();
        
        currentAddress = data.address;
        
        els.currentTokenPill.classList.remove('hidden');
        els.tokenDisplay.textContent = token;
        els.topbarAddress.textContent = currentAddress;
        els.emptyState.querySelector('h3').textContent = "Waiting for incoming mail...";
        
        els.clearBox.classList.remove('opacity-50', 'cursor-not-allowed');
        els.syncDot.classList.remove('hidden');
        els.syncText.textContent = 'Live Sync';

        // Clear input to avoid confusion
        els.tokenInput.value = '';

        // Mobile Fix: Auto-close side nav on selection
        if (window.innerWidth < 768) {
            els.mobileNav.classList.add('-translate-x-full');
        }

        // Start polling
        if(pollingInterval) clearInterval(pollingInterval);
        closeEmailDetail();
        loadedEmails = []; // Clear current email list cache
        els.emailList.innerHTML = '';
        els.inboxCount.textContent = '0 emails';
        
        pollEmails();
        pollingInterval = setInterval(pollEmails, 5000);
        
        // Ensure it's in recents
        saveRecent(token, currentAddress);

    } catch (err) {
        toast(err.message, 'error');
        currentToken = null;
    }
}

let loadedEmails = [];

async function pollEmails() {
    if (!currentToken) return;
    try {
        const res = await fetch(`/api/mailboxes/token/${currentToken}`);
        const data = await res.json();
        
        if(data.emails) {
            if(data.emails.length > loadedEmails.length && loadedEmails.length > 0) {
                toast(`New email received!`);
            }
            
            loadedEmails = data.emails;
            els.inboxCount.textContent = `${data.count} emails`;
            renderEmailList(data.emails);
        }
    } catch(err) {
        console.error("Polling error", err);
    }
}

function renderEmailList(emails) {
    if (emails.length === 0) {
        els.emailList.innerHTML = '';
        els.emptyState.classList.remove('hidden');
        els.emptyState.classList.add('flex');
        return;
    }

    els.emptyState.classList.add('hidden');
    els.emptyState.classList.remove('flex');
    els.emailList.innerHTML = emails.map(e => `
        <div onclick="openEmail('${e.id}')" class="glass-card rounded-xl p-4 flex flex-col gap-2 cursor-pointer hover:bg-surface-container-highest/40 transition-colors ${!e.read ? 'border-l-4 border-l-primary': 'opacity-70'} ${selectedEmailId === e.id ? 'bg-surface-container-high' : ''}">
            <div class="flex justify-between items-baseline">
                <span class="font-semibold text-on-surface truncate pr-2">${e.from_name || e.from_addr}</span>
                <span class="text-xs text-primary shrink-0">${formatTime(e.received_at)}</span>
            </div>
            <span class="text-sm text-on-surface font-medium truncate">${e.subject}</span>
        </div>
    `).join('');
}

async function openEmail(id) {
    if (!currentToken) return;
    selectedEmailId = id;
    els.detailPanel.classList.remove('hidden');
    
    // loading state
    document.getElementById('detail-subject').textContent = "Loading...";
    document.getElementById('detail-from-name').textContent = "...";
    document.getElementById('detail-from-addr').textContent = "";
    document.getElementById('detail-date').textContent = "...";
    document.getElementById('detail-iframe').srcdoc = `<body style="background:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">Loading content...</body>`;

    // Re-render list to show active state
    renderEmailList(loadedEmails);
    
    try {
        const res = await fetch(`/api/mailboxes/token/${currentToken}/${id}`);
        const email = await res.json();
        
        document.getElementById('detail-subject').textContent = email.subject || '(No Subject)';
        document.getElementById('detail-from-name').textContent = email.from_name || '';
        document.getElementById('detail-from-addr').textContent = `<${email.from_addr}>`;
        
        const date = new Date(email.received_at);
        document.getElementById('detail-date').textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        
        let htmlContent = email.body_html || `<pre style="white-space: pre-wrap; font-family: monospace;">${email.body_text || 'No content'}</pre>`;
        
        // NOTE: The iframe is sandboxed (no allow-scripts), so we skip DOMPurify here.
        // DOMPurify strips <style> tags from email HTML making content invisible.
        // Inject light-mode override to prevent dark media queries making text invisible.
        const lightModeOverride = `<style>html,body{color-scheme:light!important;background-color:#fff!important;color:#333!important}</style>`;
        if (htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<head>', `<head>${lightModeOverride}`);
        } else {
            htmlContent = lightModeOverride + htmlContent;
        }
        document.getElementById('detail-iframe').srcdoc = htmlContent;

        // update actions
        document.getElementById('detail-delete').onclick = () => deleteEmail(id);
        document.getElementById('detail-copy').onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(email, null, 2));
            toast('Raw JSON copied to clipboard');
        };
        
        const cachedItem = loadedEmails.find(e=>e.id===id);
        if(cachedItem) cachedItem.read = 1;
        
    } catch(err) {
        toast('Failed to load email detail', 'error');
    }
}

function closeEmailDetail() {
    selectedEmailId = null;
    els.detailPanel.classList.add('hidden');
    renderEmailList(loadedEmails);
}

async function deleteEmail(id) {
    if(!currentToken || !confirm("Delete this email?")) return;
    try {
        await fetch(`/api/mailboxes/token/${currentToken}/${id}`, { method: 'DELETE' });
        closeEmailDetail();
        pollEmails();
        toast('Email deleted');
    } catch(err) {
        toast('Failed to delete email');
    }
}

async function clearInbox() {
    if(!currentToken || !confirm("Clear all emails in this inbox?")) return;
    try {
        await fetch(`/api/mailboxes/token/${currentToken}`, { method: 'DELETE' });
        closeEmailDetail();
        loadedEmails = [];
        renderEmailList([]);
        els.inboxCount.textContent = '0 emails';
        toast('Inbox cleared');
    } catch(err) {
        toast('Failed to clear inbox');
    }
}

function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `p-4 rounded-lg shadow-2xl backdrop-blur-md border text-sm font-medium toast-animate pointer-events-auto ${type === 'error' ? 'bg-error/20 border-error/50 text-error' : 'bg-surface-container-high border-indigo-500/30 text-slate-200'}`;
    el.textContent = msg;
    els.toastContainer.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.3s ease';
        setTimeout(()=>el.remove(), 300);
    }, 3000);
}

function formatTime(isoStr) {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${d.getMonth()+1}/${d.getDate()}`;
}

// Recents logic - store token and address
function getRecents() {
    try { return JSON.parse(localStorage.getItem('cfmail_recents_v2') || '[]'); } catch(e) { return []; }
}
function saveRecent(token, addr) {
    let r = getRecents().filter(x => x.token !== token);
    r.unshift({ token, addr });
    if (r.length > 5) r = r.slice(0, 5);
    localStorage.setItem('cfmail_recents_v2', JSON.stringify(r));
    loadRecents();
}
function loadRecents() {
    const r = getRecents();
    if(r.length === 0) {
        els.recentBox.innerHTML = '<span class="text-xs text-slate-500 px-1">No recent inboxes</span>';
        return;
    }
    els.recentBox.innerHTML = r.map(item => `
        <button onclick="setToken('${item.token}')" class="flex flex-col gap-0.5 px-3 py-2 w-full text-left text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-white/5 transition-colors group">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-sm opacity-50 group-hover:text-indigo-400">key</span>
                <span class="font-mono-pill truncate flex-1 leading-none text-xs font-bold text-indigo-300/80">${item.token}</span>
            </div>
            <span class="text-[10px] text-slate-500 truncate ml-6">${item.addr}</span>
        </button>
    `).join('');
}

// start
init();
