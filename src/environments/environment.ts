export const environment = {
  production: false,
  // Base API URL: By default empty string '', so all /api/v1 calls go through the configured proxy or same origin.
  // Can also be set to full URL e.g. 'http://localhost:8000' or overridden at runtime via localStorage.
  apiUrl: 'http://localhost:8000',
  appName: 'Aivora Desktop AI Assistant',
  version: '0.1.2',
};
