import { getEvent } from './api.js';

export function initEventDetail() {
  const modal =
    document.getElementById('event-modal');

  const closeButton =
    document.querySelector('.modal-close');

  closeButton.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });
}

export async function showEventDetail(eventId) {
  const modal =
    document.getElementById('event-modal');

  const detail =
    document.getElementById('event-detail');

  modal.classList.remove('hidden');

  detail.innerHTML =
    '<div class="loading">Loading...</div>';

  try {
    const data = await getEvent(eventId);
    const event = data.event;

    detail.innerHTML = renderEvent(event);

  } catch (error) {
    detail.innerHTML = `
      <div class="empty-state">
        Failed to load event:
        ${error.message}
      </div>
    `;
  }
}

function renderEvent(event) {
  return `
    <div class="detail-section">
      <h3>Event</h3>

      ${row('ID', event.id, true)}
      ${row('Type', event.eventType)}
      ${row('Employee', event.employeeId)}

      <div class="detail-row">
        <span class="label">Status</span>
        <span class="value">
          <span class="status-badge status-${event.status}">
            ${event.status}
          </span>
        </span>
      </div>

      ${row('Sequence', event.sequence)}
      ${row('Idempotency Key', event.idempotencyKey, true)}
      ${row('Created', event.createdAt)}
      ${row('Updated', event.updatedAt)}

      ${
        event.processingStartedAt
          ? row(
              'Processing Started',
              event.processingStartedAt
            )
          : ''
      }

      ${
        event.completedAt
          ? row('Completed', event.completedAt)
          : ''
      }

      ${row('Attempts', event.attemptCount)}

      ${
        event.failureReason
          ? `
            <div class="detail-row">
              <span class="label">Failure Reason</span>
              <span class="value failure">
                ${escapeHtml(event.failureReason)}
              </span>
            </div>
          `
          : ''
      }
    </div>

    <div class="detail-section">
      <h3>Payload</h3>

      <div class="json-display">
        ${escapeHtml(
          JSON.stringify(event.payload, null, 2)
        )}
      </div>
    </div>

    ${
      event.result
        ? `
          <div class="detail-section">
            <h3>Result</h3>

            <div class="json-display">
              ${escapeHtml(
                JSON.stringify(event.result, null, 2)
              )}
            </div>
          </div>
        `
        : ''
    }

    ${
      event.attempts?.length
        ? `
          <div class="detail-section">
            <h3>Attempt History</h3>

            <div class="attempt-list">
              ${event.attempts
                .map(
                  (attempt) => `
                    <div class="attempt-item">
                      <div class="attempt-header">
                        <span>
                          Attempt #${attempt.attemptNumber}
                        </span>

                        <span class="status-badge status-${
                          attempt.status === 'SUCCESS'
                            ? 'SUCCESS'
                            : 'FAILED'
                        }">
                          ${attempt.status}
                        </span>
                      </div>

                      ${
                        attempt.failureReason
                          ? `
                            <div class="failure">
                              ${escapeHtml(
                                attempt.failureReason
                              )}
                            </div>
                          `
                          : ''
                      }

                      <div class="attempt-time">
                        ${attempt.startedAt || ''}

                        ${
                          attempt.completedAt
                            ? ` → ${attempt.completedAt}`
                            : ''
                        }
                      </div>
                    </div>
                  `
                )
                .join('')}
            </div>
          </div>
        `
        : ''
    }
  `;
}

function row(label, value, mono = false) {
  return `
    <div class="detail-row">
      <span class="label">${label}</span>
      <span class="value ${mono ? 'mono' : ''}">
        ${escapeHtml(value)}
      </span>
    </div>
  `;
}

function closeModal() {
  document
    .getElementById('event-modal')
    .classList.add('hidden');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}