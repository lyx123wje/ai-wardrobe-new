// WebRTC 语音管理 — 用于协作房间内的语音通话
// react-native-webrtc 在 Expo Go 中受限，web 端测试正常

let pc = null;
let localStream = null;
const iceCandidates = [];

// 模块级存储 WebRTC 类
let _RTCSessionDescription = null;
let _RTCIceCandidate = null;

function getRTCTypes() {
  if (_RTCSessionDescription) return true;
  try {
    const webrtc = require('react-native-webrtc');
    _RTCSessionDescription = webrtc.RTCSessionDescription;
    _RTCIceCandidate = webrtc.RTCIceCandidate;
    return true;
  } catch {
    // Web fallback
    if (typeof window !== 'undefined' && window.RTCPeerConnection) {
      _RTCSessionDescription = window.RTCSessionDescription;
      _RTCIceCandidate = window.RTCIceCandidate;
      return true;
    }
    return false;
  }
}

export function getLocalStream() {
  return localStream;
}

export async function startMic() {
  try {
    let mediaDevices;

    try {
      const webrtc = require('react-native-webrtc');
      const RTCPeerConnection = webrtc.RTCPeerConnection;
      mediaDevices = webrtc.mediaDevices;
      _RTCSessionDescription = webrtc.RTCSessionDescription;
      _RTCIceCandidate = webrtc.RTCIceCandidate;

      if (!RTCPeerConnection || !mediaDevices) {
        return { success: false, error: 'WebRTC not available (native)' };
      }

      localStream = await mediaDevices.getUserMedia({ audio: true, video: false });

      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
    } catch {
      // Web fallback
      if (typeof window === 'undefined' || !window.RTCPeerConnection) {
        return { success: false, error: 'WebRTC not available' };
      }
      _RTCSessionDescription = window.RTCSessionDescription;
      _RTCIceCandidate = window.RTCIceCandidate;
      mediaDevices = navigator.mediaDevices;

      localStream = await mediaDevices.getUserMedia({ audio: true, video: false });

      pc = new window.RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
    }

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        iceCandidates.push(event.candidate);
      }
    };

    return { success: true, pc, stream: localStream };
  } catch (e) {
    console.error('[VoiceChat] Failed to start mic:', e);
    return { success: false, error: e.message };
  }
}

export async function createOffer() {
  if (!pc) return null;
  const offer = await pc.createOffer({ offerToReceiveAudio: true });
  await pc.setLocalDescription(offer);
  await new Promise((r) => setTimeout(r, 2000));
  return {
    sdp: pc.localDescription,
    candidates: [...iceCandidates],
  };
}

export async function handleOffer(remoteSdp) {
  if (!pc) return null;
  if (!_RTCSessionDescription) getRTCTypes();
  await pc.setRemoteDescription(new _RTCSessionDescription(remoteSdp));
  const answer = await pc.createAnswer({ offerToReceiveAudio: true });
  await pc.setLocalDescription(answer);
  await new Promise((r) => setTimeout(r, 2000));
  return {
    sdp: pc.localDescription,
    candidates: [...iceCandidates],
  };
}

export async function handleAnswer(remoteSdp) {
  if (!pc) return null;
  if (!_RTCSessionDescription) getRTCTypes();
  await pc.setRemoteDescription(new _RTCSessionDescription(remoteSdp));
}

export async function addIceCandidate(candidate) {
  if (!pc) return;
  try {
    if (!_RTCIceCandidate) getRTCTypes();
    await pc.addIceCandidate(new _RTCIceCandidate(candidate));
  } catch (e) {
    console.warn('[VoiceChat] ICE candidate error:', e);
  }
}

export function stopVoice() {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  iceCandidates.length = 0;
}
