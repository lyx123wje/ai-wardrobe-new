import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';

export default function CollabToolbar({
  isConnected,
  partnerNickname,
  roomCode,
  voiceEnabled,
  chatVisible,
  onToggleVoice,
  onToggleChat,
  onLeave,
  onShareWardrobe,
}) {
  return (
    <View style={styles.container}>
      <View style={[styles.statusRow, isConnected && { marginBottom: 6 }]}>
        <View style={[styles.statusDot, isConnected ? styles.dotOnline : styles.dotOffline]} />
        <Text style={styles.statusText}>
          {isConnected
            ? partnerNickname
              ? `与 ${partnerNickname} 协作中`
              : '已连接'
            : '未连接'}
        </Text>
        {roomCode && (
          <Text style={styles.roomCode}>房间 {roomCode}</Text>
        )}
      </View>

      {isConnected && (
        <View style={styles.actions}>
          <Pressable style={styles.btn} onPress={onShareWardrobe}>
            <Text style={styles.btnText}>分享衣柜</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, chatVisible && styles.btnActive]}
            onPress={onToggleChat}
          >
            <Text style={[styles.btnText, chatVisible && styles.btnTextActive]}>聊天</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, voiceEnabled && styles.btnActive]}
            onPress={onToggleVoice}
          >
            <Text style={[styles.btnText, voiceEnabled && styles.btnTextActive]}>
              {voiceEnabled ? '挂断' : '语音'}
            </Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnLeave]} onPress={onLeave}>
            <Text style={styles.btnLeaveText}>离开</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotOnline: {
    backgroundColor: '#10B981',
  },
  dotOffline: {
    backgroundColor: '#D1D5DB',
  },
  statusText: {
    fontSize: 12,
    color: '#4338CA',
    fontWeight: '500',
    flex: 1,
  },
  roomCode: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  btnActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  btnText: {
    fontSize: 12,
    color: '#4338CA',
    fontWeight: '500',
  },
  btnTextActive: {
    color: '#FFFFFF',
  },
  btnLeave: {
    marginLeft: 'auto',
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  btnLeaveText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
});
