// Main Logic for Luckyoutmail Frontend
let currentToken = null;
let currentAddress = null;
let pollingInterval = null;
let selectedEmailId = null;
let loadedEmails = [];

// UI Elements
const els = {
    tokenInput: document.getElementById('luckyous-token'),
    fetchBtn: document.getElementById('fetch-btn'),
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
    toastContainer: document.getElementById('toast-container'),
    
    // mobile
    mobileNav: document.getElementById('mobile-nav'),
    openMobileNav: document.getElementById('open-mobile-nav'),
    closeMobileNav: document.getElementById('close-mobile-nav'),
};

function init() {
    setupEventListeners();
}

function setupEventListeners() {
    els.fetchBtn.addEventListener('click', fetchLuckyousInbox);
    
    // Auto-fetch via enter
    els.tokenInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') fetchLuckyousInbox();
    });

    els.manualSync.addEventListener('click', () => {
        if (!currentToken) return;
        fetchLuckyousInbox(true); // isRefresh = true
    });
    
    els.closeDetail.addEventListener('click', closeEmailDetail);

    // Mobile nav
    if(els.openMobileNav) els.openMobileNav.addEventListener('click', () => els.mobileNav.classList.remove('-translate-x-full'));
    if(els.closeMobileNav) els.closeMobileNav.addEventListener('click', () => els.mobileNav.classList.add('-translate-x-full'));
}

async function fetchLuckyousInbox(isRefresh = false) {
    const token = els.tokenInput.value.trim();
    if(!token) {
        toast('Please enter a valid token', 'error');
        return;
    }

    if(!isRefresh) {
        els.fetchBtn.disabled = true;
        els.fetchBtn.style.opacity = '0.5';
    } else {
        toast('Refreshing inbox...');
    }

    try {
        const res = await fetch(`/api/luckyous/${token}/mails`);
        const result = await res.json();
        
        if(result.code !== 0 || !result.data) {
            throw new Error(result.message || 'Failed to fetch emails');
        }

        currentToken = token;
        currentAddress = result.data.email_address;
        
        // Show context
        els.currentAddressPill.classList.remove('hidden');
        els.addressDisplay.textContent = currentAddress;
        els.topbarAddress.textContent = currentAddress;
        
        els.emptyState.querySelector('h3').textContent = "Select an email to read";
        els.emptyState.querySelector('p').textContent = "All your emails fetched successfully.";
        
        // Mobile Fix: Auto-close side nav
        if (window.innerWidth < 768) {
            els.mobileNav.classList.add('-translate-x-full');
        }

        loadedEmails = result.data.mails || [];
        els.inboxCount.textContent = `${loadedEmails.length} emails`;
        
        renderEmailList(loadedEmails);
        
        if(!isRefresh) toast('Inbox loaded successfully');
    } catch(err) {
        toast(err.message, 'error');
    } finally {
        if(!isRefresh) {
            els.fetchBtn.disabled = false;
            els.fetchBtn.style.opacity = '1';
        }
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
        <div onclick="openEmail('${e.message_id}')" class="glass-card rounded-xl p-4 flex flex-col gap-2 cursor-pointer hover:bg-surface-container-highest/40 transition-colors ${selectedEmailId === e.message_id ? 'bg-surface-container-high' : ''}">
            <div class="flex justify-between items-baseline">
                <span class="font-semibold text-on-surface truncate pr-2">${e.from}</span>
                <span class="text-xs text-primary shrink-0">${formatTime(e.received_at)}</span>
            </div>
            <span class="text-sm text-on-surface font-medium truncate">${e.subject}</span>
        </div>
    `).join('');
}

function openEmail(id) {
    selectedEmailId = id;
    els.detailPanel.classList.remove('hidden');
    
    // Find email from cache
    const email = loadedEmails.find(x => x.message_id === id);
    if(!email) return;

    document.getElementById('detail-subject').textContent = email.subject || '(No Subject)';
    document.getElementById('detail-from-name').textContent = email.from || '';
    document.getElementById('detail-from-addr').textContent = '';
    
    const date = new Date(email.received_at);
    document.getElementById('detail-date').textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    
    const htmlContent = email.html_body || `<pre style="white-space: pre-wrap; font-family: monospace;">${email.body || 'No content'}</pre>`;
    document.getElementById('detail-iframe').srcdoc = htmlContent;

    // Remove specific actions unsupported by API
    const btnDel = document.getElementById('detail-delete');
    if(btnDel) btnDel.classList.add('hidden'); // Cannot delete on luckyous yet via token
    
    const btnCopy = document.getElementById('detail-copy');
    if(btnCopy) {
        btnCopy.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(email, null, 2));
            toast('Raw JSON copied to clipboard');
        };
    }

    renderEmailList(loadedEmails);
}

function closeEmailDetail() {
    selectedEmailId = null;
    els.detailPanel.classList.add('hidden');
    renderEmailList(loadedEmails);
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
    if(!isoStr) return '';
    // Format is "2024-03-10 12:05:00". Needs replace space with T for Safari/JS strict Date parsing
    const dStr = isoStr.replace(' ', 'T'); 
    const d = new Date(dStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1 && diffMins >= 0) return 'Just now';
    if (diffMins < 60 && diffMins > 0) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24 && diffHrs > 0) return `${diffHrs}h ago`;
    return `${d.getMonth()+1}/${d.getDate()}`;
}

init();
