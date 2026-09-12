import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../lib/api";

const Ctx = createContext(null);

export function useAuth() {
  return useContext(Ctx);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(({ user: u }) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: u, demo } = await api.login(email, password);
    setUser(u);
    return { user: u, demo };
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user: u, demo } = await api.register(payload);
    setUser(u);
    return { user: u, demo };
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}
