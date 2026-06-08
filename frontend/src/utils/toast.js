import { Platform, Alert } from 'react-native';

let _toastShow = null;

export function setToastRef(showFn) {
  _toastShow = showFn;
}

export function showToast(message) {
  if (Platform.OS === 'android') {
    try {
      const { ToastAndroid } = require('react-native');
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    } catch {
      // ignore, fall through to custom toast
    }
  }
  if (_toastShow) {
    _toastShow(message);
  } else {
    Alert.alert('', message);
  }
}
