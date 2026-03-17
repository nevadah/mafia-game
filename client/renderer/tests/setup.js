// Suppress i18next's Locize promotional message from test output.
const _info = console.info;
console.info = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('i18next')) return;
  _info(...args);
};
