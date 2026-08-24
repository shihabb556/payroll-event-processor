import { API_BASE } from './config.js';

async function request(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data.message ||
      data.errors?.join(', ') ||
      'Request failed';

    throw new Error(message);
  }

  return data;
}

export function createEvent(payload) {
  return request('/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getEvents() {
  return request('/events');
}

export function getEvent(eventId) {
  return request(`/events/${eventId}`);
}