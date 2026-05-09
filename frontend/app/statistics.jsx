import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function StatisticsScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>统计</Text>
      <Text style={styles.sub}>CPW 分析 — 开发中</Text>
      <Pressable style={styles.btn} onPress={() => router.back()}>
        <Text style={styles.btnText}>返回首页</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fc' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  sub: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  btn: { padding: 12, backgroundColor: '#6366f1', borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 16 },
});
