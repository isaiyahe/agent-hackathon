import type { ActionEvent, NetworkFailure, RuntimeError } from './types';

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

export function statusText(network: NetworkFailure): string {
  return network.statusText || STATUS_TEXT[network.status] || '';
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour12: false });
}

export function describeAction(action: ActionEvent): string {
  switch (action.type) {
    case 'click':
      return `Clicked "${action.label}"`;
    case 'input':
      return `Typed into "${action.label}"`;
    case 'navigation':
      return `Navigated to ${action.label}`;
  }
}

export function errorParts(error: RuntimeError): { name: string; message: string } {
  if (error.name) return { name: error.name, message: error.message };
  const match = /^([A-Z]\w*(?:Error|Exception)):\s*(.*)$/s.exec(error.message);
  if (!match) return { name: 'Error', message: error.message };
  return { name: match[1] ?? 'Error', message: match[2] ?? '' };
}

export function formatError(error: RuntimeError): string {
  const { name, message } = errorParts(error);
  return `${name}: ${message}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Shows "/api/checkout" whether capture passes a path or a full URL (e.g. via a dev proxy). */
export function displayEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.pathname + url.search;
  } catch {
    return endpoint;
  }
}

export function requestLine(network: NetworkFailure): string {
  return `${network.method} ${displayEndpoint(network.endpoint)}`;
}
