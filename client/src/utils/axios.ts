import axios from 'axios';

/** Client HTTP bersama yang memasang base URL API dan token login otomatis. */
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const normalizedApiUrl = configuredApiUrl && /^https?:\/\/[^/]+$/i.test(configuredApiUrl)
    ? `${configuredApiUrl}/api`
    : configuredApiUrl;
const isLocalApiUrl = normalizedApiUrl
    ? /^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(normalizedApiUrl)
    : false;
const apiBaseUrl = import.meta.env.PROD
    ? normalizedApiUrl && /^https?:\/\//i.test(normalizedApiUrl) && !isLocalApiUrl
        ? normalizedApiUrl
        : 'https://eventvite-server.vercel.app/api'
    : normalizedApiUrl || '/api';

const api = axios.create({
    baseURL: apiBaseUrl,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
