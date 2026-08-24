import { getEvents } from './api.js';
import { showEventDetail } from './event-detail.js';
import { state } from './state.js';

export async function loadEvents() {
  const container = document.getElementById('events-list');

  try {
    const data = await getEvents();

    if (!data.events?.length) {
      container.innerHTML = `
        <div class="empty-state">
          No events yet. Submit one to get started.
        </div>
      `;
      return;
    }

    container.innerHTML = data.events
      .map((event) => `
        <div
          class="event-card"
          data-id="${event.id}"
        >
          <div class="event-info">
            <span class="event-type">
              ${event.eventType}
            </span>

            <span class="event-meta">
              ${event.employeeId}
              &middot;
              seq ${event.sequence}
              &middot;
              ${formatTime(event.createdAt)}
            </span>
          </div>

          <span class="status-badge status-${event.status}">
            ${event.status}
          </span>
        </div>
      `)
      .join('');

    container
      .querySelectorAll('.event-card')
      .forEach((card) => {
        card.addEventListener('click', () => {
          showEventDetail(card.dataset.id);
        });
      });

  } catch (error) {
    container.innerHTML = `
      <div class="empty-state">
        Failed to load events:
        ${error.message}
      </div>
    `;
  }
}

export function initEvents() {
  document
    .getElementById('refresh-btn')
    .addEventListener('click', loadEvents);

  const checkbox =
    document.getElementById('auto-refresh');

  checkbox.addEventListener('change', (event) => {
    if (event.target.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });

  if (checkbox.checked) {
    startAutoRefresh();
  }
}

function startAutoRefresh() {
  stopAutoRefresh();

  state.autoRefreshTimer = setInterval(
    loadEvents,
    2000
  );
}

function stopAutoRefresh() {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
}

function formatTime(value) {
  if (!value) return '';

  return new Date(value).toLocaleTimeString();
}