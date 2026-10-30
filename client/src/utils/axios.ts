import axios from 'axios';

/** Client HTTP bersama yang memasang base URL API dan token login otomatis. */
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const normalizedApiUrl = configuredApiUrl && /^https?:\/\/[^/]+$/i.test(configuredApiUrl)
    ? `${configuredApiUrl}/api`
    : configuredApiUrl;
const apiBaseUrl = import.meta.env.PROD
    ? '/api'
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
