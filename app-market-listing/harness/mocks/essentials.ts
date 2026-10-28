import { fakeFetch } from '../fixtures';

export const httpClient = { fetchWithAuth: (url: string, init?: { method?: string; body?: string }) => fakeFetch(url, init) };
