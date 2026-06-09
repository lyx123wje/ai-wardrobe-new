import React, { useState } from 'react';
import {
  View,
  ImageBackground,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { register, login } from '../src/api/auth';
import { saveAuth } from '../src/services/auth';
import { useAuth } from './_layout';

export default function AuthScreen() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [mode, setMode] = useState('register');
  const [nickname, setNickname] = useState('');
  const [userIdForLogin, setUserIdForLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  const goHome = () => {
    setTimeout(() => router.replace('/'), 50);
  };

  const handleSubmit = async () => {
    if (isRegister) {
      if (!nickname.trim()) {
        Alert.alert('提示', '请输入昵称');
        return;
      }
    } else {
      if (!userIdForLogin.trim()) {
        Alert.alert('提示', '请输入用户ID');
        return;
      }
    }
    if (!password.trim()) {
      Alert.alert('提示', '请输入密码');
      return;
    }
    if (password.length < 4) {
      Alert.alert('提示', '密码至少需要4位');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        const data = await register(nickname.trim(), password);
        Alert.alert('注册成功', `你的用户ID是: ${data.user_id}\n请牢记，用于登录！`, [
          {
            text: '确定，去登录',
            onPress: () => {
              setMode('login');
              setUserIdForLogin(data.user_id);
              setNickname('');
              setPassword('');
            },
          },
        ]);
      } else {
        const data = await login(userIdForLogin.trim(), password);
        const user = { user_id: data.user_id, nickname: data.nickname };
        await saveAuth(data.token, user);
        setUser(user);
        goHome();
      }
    } catch (e) {
      const msg = e.response?.data?.message || e.message || '请求失败';
      Alert.alert('错误', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={require('../assets/bg.png')} style={styles.container}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.headerSection}>
          <Text style={styles.appName}>AI 衣橱</Text>
          <Text style={styles.subtitle}>你的智能穿搭伙伴</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>{isRegister ? '注册新账号' : '登录'}</Text>

          {isRegister ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>昵称</Text>
              <TextInput
                style={styles.input}
                placeholder="输入你的昵称"
                placeholderTextColor="#9CA3AF"
                value={nickname}
                onChangeText={setNickname}
                autoCapitalize="none"
              />
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>用户ID 或 昵称</Text>
              <TextInput
                style={styles.input}
                placeholder="输入昵称或用户ID"
                placeholderTextColor="#9CA3AF"
                value={userIdForLogin}
                onChangeText={setUserIdForLogin}
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>密码</Text>
            <TextInput
              style={styles.input}
              placeholder="输入密码（至少4位）"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <Pressable
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isRegister ? '注册' : '登录'}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.toggleBtn}
            onPress={() => {
              setMode(isRegister ? 'login' : 'register');
              setNickname('');
              setUserIdForLogin('');
              setPassword('');
            }}
          >
            <Text style={styles.toggleText}>
              {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  toggleBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '500',
  },
});
