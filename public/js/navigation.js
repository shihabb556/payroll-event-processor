import { loadEvents } from './events.js';

export function initNavigation() {
  document.querySelectorAll('.nav-link[data-tab]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      document
        .querySelectorAll('.nav-link')
        .forEach((item) => item.classList.remove('active'));

      document
        .querySelectorAll('.tab-content')
        .forEach((tab) => tab.classList.remove('active'));

      link.classList.add('active');

      const tab = document.getElementById(
        `${link.dataset.tab}-tab`
      );

      if (tab) {
        tab.classList.add('active');
      }

      if (link.dataset.tab === 'events') {
        loadEvents();
      }
    });
  });
}