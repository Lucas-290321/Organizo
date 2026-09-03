import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from "sonner";

// Componentes
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import AgendaPage from './components/AgendaPage';
import InventoryPage from './components/InventoryPage';
import AccountPage from './components/AccountPage';
import PerfilPage from './components/PerfilPage';
import Login from './components/Login';
import Register from './components/Register';
import { getAuthApiUrl, getWebSocketBaseUrl } from './lib/api';

// Config
const API = getAuthApiUrl();

// ==========================
// Auth Context
// ==========================
export const AuthContext = createContext(null);
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const loadCurrentUser = async () => {
    const response = await axios.get(`${API}/me`);
    setUser(response.data);
    return response.data;
  };

  useEffect(() => {
    const init = async () => {
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        try {
          await loadCurrentUser();
        } catch (error) {
          // Apenas logout se for erro 401 (unauthorized), não para outros erros
          if (error.response?.status === 401) {
            logout();
          } else {
            console.error('Erro ao carregar usuário:', error);
            // Mesmo com erro, manter o token e deixar a página funcionar
            // O usuário pode tentar novamente
          }
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    init();
  }, [token]);

  const fetchAccountProfiles = async (email) => {
    if (!email?.trim()) return [];

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data } = await axios.get(`${API}/account-profiles`, {
        params: { email: normalizedEmail },
      });
      return data?.profiles || [];
    } catch (error) {
      console.error('Profile lookup failed:', error);
      return [];
    }
  };

  const login = async (email, password, profileId = "") => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPassword = password.trim();
      const { data } = await axios.post(`${API}/login`, {
        email: normalizedEmail,
        password: normalizedPassword,
        profile_id: profileId || null,
      });
      const { access_token } = data;
      localStorage.setItem('token', access_token);
      setToken(access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      await loadCurrentUser();
      toast.success('Bem-vindo de volta!');
      return true;
    } catch (error) {
      console.error('Login request failed:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url,
      });
      const message =
        error.response?.data?.detail ||
        (error.request ? `Não foi possível conectar ao servidor (${error.config?.url || 'URL desconhecida'})` : 'Falha no login');
      toast.error(message);
      return false;
    }
  };

  const register = async (userData) => {
    try {
      const payload = {
        ...userData,
        email: userData.email.trim().toLowerCase(),
        password: userData.password.trim(),
        full_name: userData.full_name.trim(),
        username: userData.username?.trim(),
        department: userData.department?.trim(),
      };
      await axios.post(`${API}/register`, payload);
      toast.success('Cadastro realizado com sucesso! Faça login.');
      return true;
    } catch (error) {
      console.error('Registration request failed:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url,
      });
      const message =
        error.response?.data?.detail ||
        (error.request ? `Não foi possível conectar ao servidor (${error.config?.url || 'URL desconhecida'})` : 'Falha no cadastro');
      toast.error(message);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
    toast.success('Saiu da conta com sucesso');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, fetchAccountProfiles, refreshUser: loadCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// ==========================
// Protected Route
// ==========================
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
      </div>
    );
  return user ? children : <Navigate to="/login" />;
};

// ==========================
// WebSocket Hook & Provider
// ==========================
const useWebSocket = () => {
  const [socket, setSocket] = useState(null);
  const { user } = useAuth();
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const socketRef = useRef(null);
  const connectionIdRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    let shouldReconnect = true;
    const connectionId = connectionIdRef.current + 1;
    connectionIdRef.current = connectionId;
    const base = getWebSocketBaseUrl();
    const wsUrl = base.replace(/^http/, 'ws') + '/ws';

    const connect = () => {
      if (!shouldReconnect || connectionIdRef.current !== connectionId) return;
      console.log('WS connect:', wsUrl);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      const isCurrentSocket = () =>
        shouldReconnect &&
        connectionIdRef.current === connectionId &&
        socketRef.current === ws;

      ws.onopen = () => {
        if (!isCurrentSocket()) {
          ws.close();
          return;
        }
        console.log('WS connected');
        reconnectAttemptsRef.current = 0;
        setSocket(ws);
      };

      ws.onmessage = (event) => {
        try {
          console.log('WS raw message:', event.data);
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'event_created': toast.success('Novo evento criado'); break;
            case 'event_updated': toast.info('Evento atualizado'); break;
            case 'event_deleted': toast.info('Evento excluído'); break;
            case 'inventory_created': toast.success('Novo item de estoque adicionado'); break;
            case 'inventory_updated': toast.info('Item de estoque atualizado'); break;
            case 'inventory_deleted': toast.info('Item de estoque excluído'); break;
            default: break;
          }
          window.dispatchEvent(new CustomEvent('realtimeUpdate', { detail: data }));
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WS error:', error);
      };

      ws.onclose = (event) => {
        if (!isCurrentSocket()) return;
        console.log('WS closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setSocket(null);
        reconnectAttemptsRef.current += 1;
        const retryDelay = Math.min(30000, 1000 * reconnectAttemptsRef.current);
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, retryDelay);
        console.log(`WS reconnecting in ${retryDelay}ms`);
      };
    };

    connect();

    return () => {
      shouldReconnect = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (connectionIdRef.current === connectionId) {
        setSocket(null);
        socketRef.current?.close();
        socketRef.current = null;
      }
    };
  }, [user?.account_id, user?.profile_id]);

  return socket;
};

const WebSocketProvider = ({ children }) => {
  useWebSocket();
  return <>{children}</>;
};

// ==========================
// App Content
// ==========================
const AppContent = () => (
  <>
    <Navigation />
    <div className="pt-16">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/perfil" element={<PerfilPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  </>
);

// ==========================
// Main App
// ==========================
function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <div className="min-h-screen bg-slate-50">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/*" element={<ProtectedRoute><AppContent /></ProtectedRoute>} />
          </Routes>
          <Toaster />
        </div>
      </WebSocketProvider>
    </AuthProvider>
  );
}

export default App;
