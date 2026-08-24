import { createEvent } from './api.js';
import { startEventPolling } from './polling.js';

const PAYLOAD_FIELDS = {
  SALARY_CHANGE: `
    <div class="payload-section">
      <h3>Salary Change Details</h3>

      <div class="form-group">
        <label>Effective Date</label>
        <input type="date" id="effectiveDate" required>
      </div>

      <div class="form-group">
        <label>New Salary</label>
        <input
          type="number"
          id="newSalary"
          min="0"
          step="0.01"
          placeholder="75000"
          required
        >
      </div>

      <div class="form-group">
        <label>Currency</label>
        <input
          type="text"
          id="currency"
          placeholder="USD"
          value="USD"
          required
        >
      </div>
    </div>
  `,

  ADDRESS_CHANGE: `
    <div class="payload-section">
      <h3>Address Change Details</h3>

      <div class="form-group">
        <label>Effective Date</label>
        <input type="date" id="effectiveDate" required>
      </div>

      <div class="form-group">
        <label>Street</label>
        <input type="text" id="street" placeholder="123 Main St" required>
      </div>

      <div class="form-group">
        <label>City</label>
        <input type="text" id="city" placeholder="Boston" required>
      </div>

      <div class="form-group">
        <label>Postal Code</label>
        <input type="text" id="postalCode" placeholder="02101" required>
      </div>

      <div class="form-group">
        <label>Country</label>
        <input type="text" id="country" placeholder="US" required>
      </div>
    </div>
  `,

  BANK_ACCOUNT_CHANGE: `
    <div class="payload-section">
      <h3>Bank Account Change Details</h3>

      <div class="form-group">
        <label>Effective Date</label>
        <input type="date" id="effectiveDate" required>
      </div>

      <div class="form-group">
        <label>IBAN</label>
        <input
          type="text"
          id="iban"
          placeholder="DE89370400440532013000"
          required
        >
      </div>
    </div>
  `,
};

export function initEventForm() {
  const eventType = document.getElementById('eventType');
  const form = document.getElementById('event-form');
  const generateKey = document.getElementById('generate-key');

  eventType.addEventListener('change', () => {
    document.getElementById('payload-fields').innerHTML =
      PAYLOAD_FIELDS[eventType.value] || '';
  });

  generateKey.addEventListener('click', generateIdempotencyKey);

  form.addEventListener('submit', handleSubmit);
}

function generateIdempotencyKey() {
  const employeeId =
    document.getElementById('employeeId').value || 'EMP-000';

  const eventType =
    document.getElementById('eventType').value || 'EVENT';

  document.getElementById('idempotencyKey').value =
    `${employeeId.toLowerCase()}-${eventType.toLowerCase()}-${Date.now()}`;
}

function collectPayload() {
  const payload = {};

  document
    .querySelectorAll('#payload-fields input, #payload-fields select')
    .forEach((input) => {
      if (!input.value) return;

      payload[input.id] =
        input.type === 'number'
          ? Number(input.value)
          : input.value;
    });

  return payload;
}

async function handleSubmit(event) {
  event.preventDefault();

  const button = document.getElementById('submit-btn');
  const result = document.getElementById('submit-result');

  button.disabled = true;
  button.textContent = 'Submitting...';

  try {
    const employeeId =
      document.getElementById('employeeId').value.trim();

    const eventType =
      document.getElementById('eventType').value;

    let idempotencyKey =
      document.getElementById('idempotencyKey').value.trim();

    if (!idempotencyKey) {
      idempotencyKey =
        `${employeeId.toLowerCase()}-${eventType.toLowerCase()}-${Date.now()}`;
    }

    const payload = collectPayload();

    const data = await createEvent({
      employeeId,
      eventType,
      idempotencyKey,
      payload,
    });

    const createdEvent = data.event;

    showSubmissionStatus(createdEvent);

    // IMPORTANT:
    // Backend initially returns PENDING.
    // Now frontend keeps asking backend until terminal state.
    startEventPolling(createdEvent.id);

  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Submit Event';
  }
}

export function showSubmissionStatus(event) {
  const result = document.getElementById('submit-result');

  result.className = 'result-box info';

  result.innerHTML = `
    <strong>Event submitted successfully.</strong>
    <br>
    Event ID:
    <code>${event.id}</code>
    <br>
    Status:
    <span class="status-badge status-${event.status}">
      ${event.status}
    </span>
    <br>
    <small>
      Waiting for payroll processing...
    </small>
  `;

  result.classList.remove('hidden');
}

export function showError(message) {
  const result = document.getElementById('submit-result');

  result.className = 'result-box error';
  result.textContent = message;
  result.classList.remove('hidden');
}

export function updateSubmissionStatus(event) {
  const result = document.getElementById('submit-result');

  if (!result) return;

  if (event.status === 'PENDING') {
    result.className = 'result-box info';

    result.innerHTML = `
      <strong>Event queued.</strong>
      <br>
      Event ID: <code>${event.id}</code>
      <br>
      Status:
      <span class="status-badge status-PENDING">
        PENDING
      </span>
    `;
  }

  if (event.status === 'PROCESSING') {
    result.className = 'result-box info';

    result.innerHTML = `
      <strong>Payroll processing in progress...</strong>
      <br>
      Event ID: <code>${event.id}</code>
      <br>
      Status:
      <span class="status-badge status-PROCESSING">
        PROCESSING
      </span>
      <br>
      <small>Please wait...</small>
    `;
  }

  if (event.status === 'SUCCESS') {
    result.className = 'result-box success';

    result.innerHTML = `
      <strong>Payroll event processed successfully.</strong>
      <br>
      Event ID: <code>${event.id}</code>
      <br>
      Status:
      <span class="status-badge status-SUCCESS">
        SUCCESS
      </span>
      ${
        event.result
          ? `<div class="json-display">
              ${escapeHtml(JSON.stringify(event.result, null, 2))}
             </div>`
          : ''
      }
    `;
  }

  if (event.status === 'FAILED') {
    result.className = 'result-box error';

    result.innerHTML = `
      <strong>Payroll processing failed.</strong>
      <br>
      Event ID: <code>${event.id}</code>
      <br>
      Status:
      <span class="status-badge status-FAILED">
        FAILED
      </span>

      ${
        event.failureReason
          ? `<br>Reason: ${escapeHtml(event.failureReason)}`
          : ''
      }
    `;
  }

  result.classList.remove('hidden');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}