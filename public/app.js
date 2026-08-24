const API_BASE = '/api/v1';

// ─── Tab Navigation ───────────────────────────────────────────
document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    link.classList.add('active');
    document.getElementById(`${link.dataset.tab}-tab`).classList.add('active');
    if (link.dataset.tab === 'events') loadEvents();
  });
});

// ─── Payload Field Templates ──────────────────────────────────
const PAYLOAD_FIELDS = {
  SALARY_CHANGE: `
    <div class="payload-section">
      <h3>Salary Change Details</h3>
      <div class="form-group">
        <label for="effectiveDate">Effective Date</label>
        <input type="date" id="effectiveDate" required>
      </div>
      <div class="form-group">
        <label for="newSalary">New Salary</label>
        <input type="number" id="newSalary" min="0" step="0.01" placeholder="75000" required>
      </div>
      <div class="form-group">
        <label for="currency">Currency</label>
        <input type="text" id="currency" placeholder="USD" value="USD" required>
      </div>
    </div>
  `,
  ADDRESS_CHANGE: `
    <div class="payload-section">
      <h3>Address Change Details</h3>
      <div class="form-group">
        <label for="effectiveDate">Effective Date</label>
        <input type="date" id="effectiveDate" required>
      </div>
      <div class="form-group">
        <label for="street">Street</label>
        <input type="text" id="street" placeholder="123 Main St" required>
      </div>
      <div class="form-group">
        <label for="city">City</label>
        <input type="text" id="city" placeholder="Boston" required>
      </div>
      <div class="form-group">
        <label for="postalCode">Postal Code</label>
        <input type="text" id="postalCode" placeholder="02101" required>
      </div>
      <div class="form-group">
        <label for="country">Country</label>
        <input type="text" id="country" placeholder="US" required>
      </div>
    </div>
  `,
  BANK_ACCOUNT_CHANGE: `
    <div class="payload-section">
      <h3>Bank Account Change Details</h3>
      <div class="form-group">
        <label for="effectiveDate">Effective Date</label>
        <input type="date" id="effectiveDate" required>
      </div>
      <div class="form-group">
        <label for="iban">IBAN</label>
        <input type="text" id="iban" placeholder="DE89370400440532013000" required>
      </div>
    </div>
  `
};

// ─── Event Type Change ────────────────────────────────────────
document.getElementById('eventType').addEventListener('change', (e) => {
  const payloadContainer = document.getElementById('payload-fields');
  const type = e.target.value;
  payloadContainer.innerHTML = PAYLOAD_FIELDS[type] || '';
});

// ─── Generate Idempotency Key ─────────────────────────────────
document.getElementById('generate-key').addEventListener('click', () => {
  const employeeId = document.getElementById('employeeId').value || 'EMP-000';
  const eventType = document.getElementById('eventType').value || 'EVENT';
  const timestamp = Date.now();
  document.getElementById('idempotencyKey').value = `${employeeId.toLowerCase()}-${eventType.toLowerCase()}-${timestamp}`;
});

// ─── Form Submit ──────────────────────────────────────────────
document.getElementById('event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('submit-btn');
  const resultBox = document.getElementById('submit-result');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  resultBox.className = 'result-box hidden';

  try {
    const employeeId = document.getElementById('employeeId').value.trim();
    const eventType = document.getElementById('eventType').value;
    let idempotencyKey = document.getElementById('idempotencyKey').value.trim();

    if (!idempotencyKey) {
      idempotencyKey = `${employeeId.toLowerCase()}-${eventType.toLowerCase()}-${Date.now()}`;
    }

    // Collect payload from dynamic fields
    const payload = {};
    const payloadSection = document.querySelector('.payload-section');
    if (payloadSection) {
      payloadSection.querySelectorAll('input, select').forEach(input => {
        if (input.id && input.value) {
          if (input.type === 'number') {
            payload[input.id] = parseFloat(input.value);
          } else {
            payload[input.id] = input.value;
          }
        }
      });
    }

    const response = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, eventType, idempotencyKey, payload }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.message || data.errors?.join(', ') || 'Request failed';
      throw new Error(errorMsg);
    }

    resultBox.className = 'result-box success';
    resultBox.innerHTML = `
      <strong>${data.message}</strong><br>
      Event ID: <code>${data.event.id}</code><br>
      Status: <span class="status-badge status-${data.event.status}">${data.event.status}</span>
      Sequence: ${data.event.sequence}
    `;
    resultBox.classList.remove('hidden');
  } catch (err) {
    resultBox.className = 'result-box error';
    resultBox.textContent = err.message;
    resultBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Event';
  }
});

// ─── Events List ──────────────────────────────────────────────
let autoRefreshInterval = null;

async function loadEvents() {
  const container = document.getElementById('events-list');
  try {
    const response = await fetch(`${API_BASE}/events`);
    const data = await response.json();

    if (!data.events || data.events.length === 0) {
      container.innerHTML = '<div class="empty-state">No events yet. Submit one to get started.</div>';
      return;
    }

    container.innerHTML = data.events.map(event => `
      <div class="event-card" data-id="${event.id}">
        <div class="event-info">
          <span class="event-type">${event.eventType}</span>
          <span class="event-meta">${event.employeeId} &middot; seq ${event.sequence} &middot; ${formatTime(event.createdAt)}</span>
        </div>
        <span class="status-badge status-${event.status}">${event.status}</span>
      </div>
    `).join('');

    // Attach click handlers
    container.querySelectorAll('.event-card').forEach(card => {
      card.addEventListener('click', () => showEventDetail(card.dataset.id));
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Failed to load events: ${err.message}</div>`;
  }
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString();
}

// ─── Event Detail ─────────────────────────────────────────────
async function showEventDetail(eventId) {
  const modal = document.getElementById('event-modal');
  const detail = document.getElementById('event-detail');
  modal.classList.remove('hidden');
  detail.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const response = await fetch(`${API_BASE}/events/${eventId}`);
    const data = await response.json();
    const e = data.event;

    detail.innerHTML = `
      <div class="detail-section">
        <h3>Event</h3>
        <div class="detail-row"><span class="label">ID</span><span class="value mono">${e.id}</span></div>
        <div class="detail-row"><span class="label">Type</span><span class="value">${e.eventType}</span></div>
        <div class="detail-row"><span class="label">Employee</span><span class="value">${e.employeeId}</span></div>
        <div class="detail-row"><span class="label">Status</span><span class="value"><span class="status-badge status-${e.status}">${e.status}</span></span></div>
        <div class="detail-row"><span class="label">Sequence</span><span class="value">${e.sequence}</span></div>
        <div class="detail-row"><span class="label">Idempotency Key</span><span class="value mono">${e.idempotencyKey}</span></div>
        <div class="detail-row"><span class="label">Created</span><span class="value">${e.createdAt}</span></div>
        <div class="detail-row"><span class="label">Updated</span><span class="value">${e.updatedAt}</span></div>
        ${e.processingStartedAt ? `<div class="detail-row"><span class="label">Processing Started</span><span class="value">${e.processingStartedAt}</span></div>` : ''}
        ${e.completedAt ? `<div class="detail-row"><span class="label">Completed</span><span class="value">${e.completedAt}</span></div>` : ''}
        <div class="detail-row"><span class="label">Attempts</span><span class="value">${e.attemptCount}</span></div>
        ${e.failureReason ? `<div class="detail-row"><span class="label">Failure Reason</span><span class="value" style="color:#721c24">${e.failureReason}</span></div>` : ''}
      </div>

      <div class="detail-section">
        <h3>Payload</h3>
        <div class="json-display">${JSON.stringify(e.payload, null, 2)}</div>
      </div>

      ${e.result ? `
      <div class="detail-section">
        <h3>Result</h3>
        <div class="json-display">${JSON.stringify(e.result, null, 2)}</div>
      </div>
      ` : ''}

      ${e.attempts && e.attempts.length > 0 ? `
      <div class="detail-section">
        <h3>Attempt History</h3>
        <div class="attempt-list">
          ${e.attempts.map(a => `
            <div class="attempt-item">
              <div class="attempt-header">
                <span>Attempt #${a.attemptNumber}</span>
                <span class="status-badge status-${a.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED'}">${a.status}</span>
              </div>
              ${a.failureReason ? `<div style="color:#721c24;font-size:0.8rem;margin-top:0.25rem">${a.failureReason}</div>` : ''}
              <div style="color:#666;font-size:0.75rem;margin-top:0.25rem">${a.startedAt || ''} ${a.completedAt ? '→ ' + a.completedAt : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    `;
  } catch (err) {
    detail.innerHTML = `<div class="empty-state">Failed to load event: ${err.message}</div>`;
  }
}

// ─── Modal Close ──────────────────────────────────────────────
document.querySelector('.modal-close').addEventListener('click', () => {
  document.getElementById('event-modal').classList.add('hidden');
});

document.getElementById('event-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.add('hidden');
  }
});

// ─── Auto-refresh ─────────────────────────────────────────────
document.getElementById('refresh-btn').addEventListener('click', loadEvents);

document.getElementById('auto-refresh').addEventListener('change', (e) => {
  if (e.target.checked) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(loadEvents, 2000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// Start auto-refresh if on events tab
if (document.getElementById('auto-refresh').checked) {
  startAutoRefresh();
}

// ─── Keyboard shortcut ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('event-modal').classList.add('hidden');
  }
});

// ─── Polling for Event Status ───────────────────────────────── 
async function pollEventStatus(eventId) {
  const resultBox = document.getElementById('submit-result');

  const poll = async () => {
    try {
      const response = await fetch(`${API_BASE}/events/${eventId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch event status');
      }

      const event = data.event;

      if (event.status === 'PENDING' || event.status === 'PROCESSING') {
        resultBox.className = 'result-box info';
        resultBox.innerHTML = `
          <strong>Event is being processed...</strong><br>
          Event ID: <code>${event.id}</code><br>
          Status:
          <span class="status-badge status-${event.status}">
            ${event.status}
          </span>
        `;
        resultBox.classList.remove('hidden');

        setTimeout(poll, 1000);
        return;
      }

      if (event.status === 'SUCCESS') {
       resultBox.className = 'result-box info';
       resultBox.innerHTML = `
          <strong>Event submitted successfully.</strong><br>
          Event ID: <code>${data.event.id}</code><br>
          Status:
          <span class="status-badge status-${data.event.status}">
            ${data.event.status}
          </span><br>
          <small>Waiting for payroll processing...</small>
        `;
        resultBox.classList.remove('hidden');

        // Start polling
        pollEventStatus(data.event.id);
        // Refresh event list if user later opens it
        loadEvents();
        return;
      }

      if (event.status === 'FAILED') {
        resultBox.className = 'result-box error';
        resultBox.innerHTML = `
          <strong>Event processing failed</strong><br>
          Event ID: <code>${event.id}</code><br>
          Status:
          <span class="status-badge status-FAILED">
            FAILED
          </span>

          ${
            event.failureReason
              ? `<br>Reason: ${event.failureReason}`
              : ''
          }
        `;
        resultBox.classList.remove('hidden');

        loadEvents();
        return;
      }
    } catch (err) {
      console.error('Polling failed:', err);
    }
  };

  poll();
}
