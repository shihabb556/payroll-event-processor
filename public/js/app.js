import { initNavigation } from './navigation.js';
import { initEventForm } from './event-form.js';
import { initEvents } from './events.js';
import { initEventDetail } from './event-detail.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initEventForm();
  initEvents();
  initEventDetail();
});