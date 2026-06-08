import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Pressable } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getToken, getUser, clearAuth } from '../src/services/auth';
import { verify } from '../src/api/auth';
import Toast from '../src/components/Toast';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const didInitialCheck = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setAuthLoading(false);
          didInitialCheck.current = true;
          return;
        }
        const res = await verify(token);
        if (res.valid) {
          const savedUser = await getUser();
          setUser(savedUser || { nickname: res.nickname, user_id: res.user_id });
        } else {
          await clearAuth();
        }
      } catch {
        await clearAuth();
      } finally {
        setAuthLoading(false);
        didInitialCheck.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!didInitialCheck.current) return;
    if (authLoading) return;
    const onAuthPage = segments[0] === 'auth';
    if (user && onAuthPage) {
      router.replace('/');
    } else if (!user && !onAuthPage) {
      router.replace('/auth');
    }
  }, [authLoading]);

  const logout = useCallback(async () => {
    await clearAuth();
    setUser(null);
    router.replace('/auth');
  }, []);

  const content = (
    <Stack screenOptions={{ headerShown: false }} />
  );

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      <StatusBar style="dark" />
      {content}
      <Toast />
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
});
