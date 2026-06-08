import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
  FlatList,
  Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { createRoom, joinRoom } from '../api/collab';
import { getToken } from '../services/auth';
import { getRecentCollabs, clearRecentCollabs } from '../services/recentCollabs';
import CameraScanner from './CameraScanner';

function formatRelativeTime(iso) {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return `${Math.floor(diffDay / 7)}周前`;
}

export default function CollabInviteModal({ visible, onClose, onRoomReady }) {
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'join' | 'recent'
  const [roomCode, setRoomCode] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [recentCollabs, setRecentCollabs] = useState([]);

  const loadRecent = useCallback(async () => {
    const data = await getRecentCollabs();
    setRecentCollabs(data);
  }, []);

  useEffect(() => {
    if (visible) {
      loadRecent();
    }
  }, [visible, loadRecent]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const data = await createRoom(token);
      setCreatedCode(data.room_code);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || '创建失败';
      Alert.alert('错误', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const code = roomCode.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      Alert.alert('提示', '请输入6位数字房间码');
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const data = await joinRoom(code, token);
      onRoomReady(code, data);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || '加入失败';
      Alert.alert('错误', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEnterRoom = () => {
    onRoomReady(createdCode);
  };

  const handleClose = () => {
    setRoomCode('');
    setCreatedCode('');
    setActiveTab('create');
    onClose();
  };

  const handleShare = () => {
    Share.share({
      message: `来AI衣橱和我一起搭配衣服吧！房间码：${createdCode}`,
    });
  };

  const handleScanned = (code) => {
    setShowScanner(false);
    setRoomCode(code);
    setActiveTab('join');
  };

  const handleRecentPress = (item) => {
    setRoomCode(item.roomCode);
    setActiveTab('join');
  };

  const handleClearRecent = () => {
    clearRecentCollabs();
    setRecentCollabs([]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>好友共创</Text>

          {createdCode ? (
            // Created room - show code + QR + share
            <View style={styles.createdBox}>
              <Text style={styles.createdLabel}>房间已创建</Text>
              <Text style={styles.codeDisplay}>{createdCode}</Text>
              <View style={styles.qrWrap}>
                <QRCode value={createdCode} size={160} />
              </View>
              <Text style={styles.createdHint}>好友可扫码或输入上方码加入</Text>
              <Pressable style={styles.shareBtn} onPress={handleShare}>
                <Text style={styles.shareBtnText}>📤 分享给好友</Text>
              </Pressable>
              <View style={styles.createdActions}>
                <Pressable style={styles.secondaryBtn} onPress={handleClose}>
                  <Text style={styles.secondaryBtnText}>取消</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={handleEnterRoom}>
                  <Text style={styles.primaryBtnText}>进入房间</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {/* Tabs */}
              <View style={styles.tabs}>
                <Pressable
                  style={[styles.tab, activeTab === 'create' && styles.tabActive]}
                  onPress={() => setActiveTab('create')}
                >
                  <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>
                    创建房间
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, activeTab === 'join' && styles.tabActive]}
                  onPress={() => setActiveTab('join')}
                >
                  <Text style={[styles.tabText, activeTab === 'join' && styles.tabTextActive]}>
                    加入房间
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
                  onPress={() => {
                    setActiveTab('recent');
                    loadRecent();
                  }}
                >
                  <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>
                    最近
                  </Text>
                </Pressable>
              </View>

              {activeTab === 'create' ? (
                <View style={styles.tabContent}>
                  <Text style={styles.hint}>
                    创建一个协作房间，邀请好友一起搭配衣服
                  </Text>
                  <Pressable
                    style={[styles.primaryBtn, loading && styles.btnDisabled]}
                    onPress={handleCreate}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>创建房间</Text>
                    )}
                  </Pressable>
                </View>
              ) : activeTab === 'join' ? (
                <View style={styles.tabContent}>
                  <Text style={styles.hint}>
                    输入好友分享的6位房间码加入协作
                  </Text>
                  <TextInput
                    style={styles.codeInput}
                    placeholder="输入6位房间码"
                    placeholderTextColor="#9CA3AF"
                    value={roomCode}
                    onChangeText={(t) => setRoomCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                  <Pressable
                    style={[styles.primaryBtn, loading && styles.btnDisabled]}
                    onPress={handleJoin}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>加入房间</Text>
                    )}
                  </Pressable>

                  {/* Divider + Scan */}
                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>或者</Text>
                    <View style={styles.dividerLine} />
                  </View>
                  <Pressable style={styles.scanBtn} onPress={() => setShowScanner(true)}>
                    <Text style={styles.scanBtnText}>📷 扫描二维码</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.tabContent}>
                  {recentCollabs.length === 0 ? (
                    <Text style={styles.emptyRecent}>暂无最近协作者</Text>
                  ) : (
                    <>
                      <FlatList
                        data={recentCollabs}
                        keyExtractor={(item) => item.roomCode}
                        style={styles.recentList}
                        renderItem={({ item }) => (
                          <Pressable
                            style={styles.recentItem}
                            onPress={() => handleRecentPress(item)}
                          >
                            <View style={styles.recentInfo}>
                              <Text style={styles.recentName}>
                                {item.partnerNickname || '好友'}
                              </Text>
                              <Text style={styles.recentCode}>
                                房间 {item.roomCode}
                              </Text>
                            </View>
                            <Text style={styles.recentTime}>
                              {formatRelativeTime(item.lastConnectedAt)}
                            </Text>
                          </Pressable>
                        )}
                      />
                      <Pressable style={styles.clearBtn} onPress={handleClearRecent}>
                        <Text style={styles.clearBtnText}>清空记录</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}

              <Pressable style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* Camera Scanner */}
      <CameraScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScanned={handleScanned}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 20,
  },
  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#6366f1',
    fontWeight: '600',
  },
  tabContent: {
    alignItems: 'center',
    marginBottom: 12,
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  codeInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    letterSpacing: 4,
    width: '100%',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  primaryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  secondaryBtnText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  cancelBtn: {
    marginTop: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  // Created state
  createdBox: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  createdLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  codeDisplay: {
    fontSize: 36,
    fontWeight: '800',
    color: '#6366f1',
    letterSpacing: 8,
    marginBottom: 12,
  },
  qrWrap: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  createdHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  shareBtn: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  shareBtnText: {
    color: '#4338CA',
    fontSize: 15,
    fontWeight: '600',
  },
  createdActions: {
    flexDirection: 'row',
    width: '100%',
  },
  // Divider + Scan
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#9CA3AF',
  },
  scanBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  scanBtnText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  // Recent tab
  recentList: {
    width: '100%',
    maxHeight: 200,
    marginBottom: 8,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  recentCode: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  recentTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyRecent: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 12,
  },
  clearBtn: {
    paddingVertical: 8,
  },
  clearBtnText: {
    fontSize: 13,
    color: '#EF4444',
  },
});
