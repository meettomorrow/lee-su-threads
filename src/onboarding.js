// Onboarding script - localization support

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Localize all elements with data-i18n attribute
function localizeOnboarding() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const message = browserAPI.i18n.getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  localizeOnboarding();
});
