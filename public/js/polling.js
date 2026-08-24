import { getEvent } from './api.js';
import { POLL_INTERVAL } from './config.js';
import { state } from './state.js';
import { updateSubmissionStatus } from './event-form.js';
import { loadEvents } from './events.js';

const TERMINAL_STATUSES = ['SUCCESS', 'FAILED'];

export function startEventPolling(eventId) {
  stopEventPolling(eventId);

  let attempts = 0;
  const maxAttempts = 60;

  const poll = async () => {
    attempts++;

    try {
      const data = await getEvent(eventId);
      const event = data.event;

      console.log(
        `[Polling] ${eventId}: ${event.status}`
      );

      updateSubmissionStatus(event);

      // Refresh event list immediately
      loadEvents();

      // SUCCESS / FAILED = STOP
      if (TERMINAL_STATUSES.includes(event.status)) {
        stopEventPolling(eventId);
        return;
      }

      // Safety limit
      if (attempts >= maxAttempts) {
        console.warn(
          `[Polling] stopped after ${maxAttempts} attempts`
        );

        stopEventPolling(eventId);
        return;
      }

      // Continue polling
      const timer = setTimeout(poll, POLL_INTERVAL);

      state.polling.set(eventId, timer);

    } catch (error) {
      console.error(
        `[Polling] ${eventId} failed:`,
        error
      );

      // Network failure হলে polling বন্ধ না করে retry
      const timer = setTimeout(poll, POLL_INTERVAL * 2);

      state.polling.set(eventId, timer);
    }
  };

  poll();
}

export function stopEventPolling(eventId) {
  const timer = state.polling.get(eventId);

  if (timer) {
    clearTimeout(timer);
    state.polling.delete(eventId);
  }
}