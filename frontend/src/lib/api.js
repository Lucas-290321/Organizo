export const getBackendUrl = () => {
  if (typeof window !== "undefined") {
    const { hostname, origin } = window.location;
    const isLocalNetworkHost =
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    // If the page was opened from the file system (file://) or the
    // origin is invalid/null, prefer the local backend address so
    // development pages opened directly still reach the API.
    if (window.location.protocol === 'file:' || !origin || origin === 'null') {
      return 'http://localhost:8000';
    }

    if (isLocalNetworkHost) {
      return origin;
    }
  }

  const configuredUrl = process.env.REACT_APP_BACKEND_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:8000";
};

// Prefer relative paths when running in the browser without an explicit
// backend URL configured. This allows the CRA dev server to proxy `/api`
// and `/ws` to the backend without triggering mixed-content errors.
export const getApiUrl = () => {
  if (typeof window !== "undefined" && !process.env.REACT_APP_BACKEND_URL) {
    return "/api";
  }
  return `${getBackendUrl()}/api`;
};

export const getAuthApiUrl = () => {
  if (typeof window !== "undefined" && !process.env.REACT_APP_BACKEND_URL) {
    return "/api/auth";
  }
  return `${getBackendUrl()}/api/auth`;
};

export const getWebSocketBaseUrl = () => {
  // For dev (served in browser) use the current origin so the WebSocket
  // uses the same protocol (ws/wss) and host as the page. This avoids
  // mixed-content when page is https but backend is http.
  if (typeof window !== "undefined" && !process.env.REACT_APP_BACKEND_URL) {
    return window.location.origin;
  }
  return getBackendUrl();
};
