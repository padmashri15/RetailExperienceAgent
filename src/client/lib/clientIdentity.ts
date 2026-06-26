const clientIdStorageKey = "brand-experience-agent.client-id";
const sessionIdStorageKey = "brand-experience-agent.session-id";
const gaClientIdPattern = /^\d+\.\d+$/;

export function getClientId() {
  if (typeof window === "undefined") return "brand-experience-agent.server";

  const existingId = window.localStorage.getItem(clientIdStorageKey);
  if (existingId && gaClientIdPattern.test(existingId)) return existingId;

  const clientId = createGoogleAnalyticsClientId();
  window.localStorage.setItem(clientIdStorageKey, clientId);
  return clientId;
}

export function getSessionId() {
  if (typeof window === "undefined") return "brand-experience-agent.server-session";

  const existingSessionId = window.sessionStorage.getItem(sessionIdStorageKey);
  if (existingSessionId) return existingSessionId;

  const sessionId = String(Math.floor(Date.now() / 1000));
  window.sessionStorage.setItem(sessionIdStorageKey, sessionId);
  return sessionId;
}

function createGoogleAnalyticsClientId() {
  const left = Math.floor(Date.now() / 1000);
  const right = Math.floor(Math.random() * 1_000_000_000);
  return `${left}.${right}`;
}
