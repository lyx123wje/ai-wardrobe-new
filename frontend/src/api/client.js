import axios from 'axios';
import Constants from 'expo-constants';

const API_BASE = Constants.expoConfig?.extra?.apiBaseUrl || 'http://10.29.137.80:5000';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message || err.message || '请求失败';
    console.error('[API Error]', msg);
    return Promise.reject(err);
  },
);

export default api;
