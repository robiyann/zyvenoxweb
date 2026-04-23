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
    addressDisplay: document.getElementById('nav-address-display'),
    currentAddressPill: document.getElementById('current-address-pill'),
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
    await fetchDomains();
    setupEventListeners();
    loadRecents();
    
    // Auto-select last used address if available
    const r = getRecents();
    if (r.length > 0) {
        setAddress(r[0]);
    }
}

async function fetchDomains(attempt = 1) {
    try {
        const res = await apiFetch('/api/domains');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        currentDomains = data.domains || [];
        
        if (currentDomains.length > 0) {
            currentSelectedDomain = currentDomains[0];
            els.domainSelectedText.textContent = currentSelectedDomain;
            
            // Render menu items with DESIGN.md palette classes
            els.domainDropdownMenu.innerHTML = currentDomains.map(d =>
                `<button type="button" data-value="${d}" class="dd-item${currentSelectedDomain === d ? ' dd-active' : ''}">${d}</button>`
            ).join('');
        } else {
            els.domainSelectedText.textContent = 'No domains';
            els.domainDropdownMenu.innerHTML = '<div style="padding:12px 14px;color:#6b7280;font-size:12px;text-align:center;">No active domains</div>';
        }
        syncDomainLabel();
    } catch(err) {
        if (attempt < 3) {
            // Auto-retry up to 3x with 2 second delay
            setTimeout(() => fetchDomains(attempt + 1), 2000);
        } else {
            toast('Failed to load domains after 3 attempts', 'error');
        }
    }
}

function closeDomainMenu() {
    isDomainMenuOpen = false;
    els.domainDropdownMenu.classList.add('hidden');
    els.domainDropdownBtn.classList.remove('dd-open');
}

function openDomainMenu() {
    isDomainMenuOpen = true;
    els.domainDropdownMenu.classList.remove('hidden');
    els.domainDropdownBtn.classList.add('dd-open');
}

function setupEventListeners() {
    // Mode toggler
    els.modeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            els.modeBtns.forEach(b => {
                b.className = "flex-1 py-1.5 px-3 rounded-lg text-slate-400 hover:text-slate-200 font-medium text-sm transition-all text-center";
            });
            const clicked = e.target;
            clicked.className = "flex-1 py-1.5 px-3 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-medium text-sm shadow-lg transition-all text-center";
            currentMode = clicked.dataset.mode;
            
            if (currentMode === 'custom') {
                els.customInputWrap.classList.remove('hidden');
                els.generateBtn.innerHTML = `<span class="material-symbols-outlined text-base">person_add</span> Create Custom`;
            } else {
                els.customInputWrap.classList.add('hidden');
                els.generateBtn.innerHTML = `<span class="material-symbols-outlined text-base">auto_awesome</span> Generate Random`;
            }
        });
    });

    els.generateBtn.addEventListener('click', generateAddress);
    
    // Custom dropdown logic
    els.domainDropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isDomainMenuOpen) closeDomainMenu();
        else openDomainMenu();
    });
    
    document.addEventListener('click', (e) => {
        if (!els.domainDropdownContainer.contains(e.target)) {
            closeDomainMenu();
        }
    });

    els.domainDropdownMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.dd-item');
        if (!btn) return;
        
        currentSelectedDomain = btn.dataset.value;
        els.domainSelectedText.textContent = currentSelectedDomain;
        
        // Update highlight classes
        els.domainDropdownMenu.querySelectorAll('.dd-item').forEach(el => {
            el.classList.remove('dd-active');
        });
        btn.classList.add('dd-active');
        
        closeDomainMenu();
        syncDomainLabel();
    });
    
    // Copy pill
    els.currentAddressPill.addEventListener('click', () => {
        if (!currentAddress) return;
        navigator.clipboard.writeText(currentAddress);
        toast('Address copied to clipboard!');
    });

    els.manualSync.addEventListener('click', () => {
        if (!currentAddress) return;
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

function syncDomainLabel() {
    if(currentSelectedDomain) {
        els.customDomainLabel.textContent = `@${currentSelectedDomain}`;
    }
}

async function generateAddress() {
    const domain = currentSelectedDomain;
    if(!domain) {
        toast('No domain selected', 'error');
        return;
    }

    els.generateBtn.disabled = true;
    els.generateBtn.style.opacity = '0.5';

    try {
        let endpoint = '/api/mailboxes/generate';
        let body = { domain };
        
        if (currentMode === 'custom') {
            const prefix = els.customPrefix.value.trim();
            if(!prefix) throw new Error("Prefix cannot be empty");
            endpoint = '/api/mailboxes/custom';
            body.prefix = prefix;
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        
        const data = await res.json();
        if(data.error) throw new Error(data.error);

        setAddress(data.address);
        saveRecent(data.address);
    } catch(err) {
        toast(err.message, 'error');
    } finally {
        els.generateBtn.disabled = false;
        els.generateBtn.style.opacity = '1';
    }
}

function setAddress(address) {
    currentAddress = address;
    els.currentAddressPill.classList.remove('hidden');
    els.addressDisplay.textContent = address;
    els.topbarAddress.textContent = address;
    els.emptyState.querySelector('h3').textContent = "Waiting for incoming mail...";
    
    els.clearBox.classList.remove('opacity-50', 'cursor-not-allowed');
    els.syncDot.classList.remove('hidden');
    els.syncText.textContent = 'Live Sync';

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
}

let loadedEmails = [];

async function pollEmails() {
    if (!currentAddress) return;
    try {
        const res = await fetch(`/api/mailboxes/${currentAddress}`);
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
        const res = await fetch(`/api/mailboxes/${currentAddress}/${id}`);
        const email = await res.json();
        
        document.getElementById('detail-subject').textContent = email.subject || '(No Subject)';
        document.getElementById('detail-from-name').textContent = email.from_name || '';
        document.getElementById('detail-from-addr').textContent = `<${email.from_addr}>`;
        
        const date = new Date(email.received_at);
        document.getElementById('detail-date').textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        
        let htmlContent = email.body_html || `<pre style="white-space: pre-wrap; font-family: monospace;">${email.body_text || 'No content'}</pre>`;
        
        // Sanitize content to prevent phishing flags
        if (typeof DOMPurify !== 'undefined') {
            htmlContent = DOMPurify.sanitize(htmlContent, {
                FORBID_TAGS: ['form', 'input', 'textarea', 'select', 'button', 'iframe', 'script', 'object', 'embed'],
                FORBID_ATTR: ['enctype', 'action', 'method']
            });
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
    if(!confirm("Delete this email?")) return;
    try {
        await fetch(`/api/mailboxes/${currentAddress}/${id}`, { method: 'DELETE' });
        closeEmailDetail();
        pollEmails();
        toast('Email deleted');
    } catch(err) {
        toast('Failed to delete email');
    }
}

async function clearInbox() {
    if(!currentAddress || !confirm("Clear all emails in this inbox?")) return;
    try {
        await fetch(`/api/mailboxes/${currentAddress}`, { method: 'DELETE' });
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

// Recents logic
function getRecents() {
    try { return JSON.parse(localStorage.getItem('cfmail_recents') || '[]'); } catch(e) { return []; }
}
function saveRecent(addr) {
    let r = getRecents().filter(x => x !== addr);
    r.unshift(addr);
    if (r.length > 5) r = r.slice(0, 5);
    localStorage.setItem('cfmail_recents', JSON.stringify(r));
    loadRecents();
}
function loadRecents() {
    const r = getRecents();
    if(r.length === 0) {
        els.recentBox.innerHTML = '<span class="text-xs text-slate-500 px-1">No recent inboxes</span>';
        return;
    }
    els.recentBox.innerHTML = r.map(addr => `
        <button onclick="setAddress('${addr}')" class="flex items-center gap-3 px-3 py-2 w-full text-left text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-white/5 transition-colors group">
            <span class="material-symbols-outlined text-base opacity-50 group-hover:text-indigo-400">mail</span>
            <span class="font-mono-pill truncate flex-1 leading-none pt-0.5">${addr}</span>
        </button>
    `).join('');
}

// start
init();
