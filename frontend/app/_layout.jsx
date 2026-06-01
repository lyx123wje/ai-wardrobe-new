import React from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const WEB_MAX_WIDTH = 430;

export default function RootLayout() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  const content = (
    <Stack screenOptions={{ headerShown: false }} />
  );

  if (!isWeb) {
    return (
      <>
        <StatusBar style="dark" />
        {content}
      </>
    );
  }

  return (
    <View style={styles.webOuter}>
      <View style={[styles.webInner, { maxWidth: WEB_MAX_WIDTH, height }]}>
        <StatusBar style="dark" />
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webOuter: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webInner: {
    width: '100%',
    backgroundColor: '#fff',
    overflow: 'hidden',
    boxShadow: '0 0 40px rgba(0,0,0,0.12)',
  },
});
