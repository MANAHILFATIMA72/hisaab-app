import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PIN_KEY = 'hisaab.pin.v1';

async function hash(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

const store = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(k)) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) =>
    Platform.OS === 'web' ? Promise.resolve(localStorage.setItem(k, v)) : SecureStore.setItemAsync(k, v),
  del: (k: string) =>
    Platform.OS === 'web' ? Promise.resolve(localStorage.removeItem(k)) : SecureStore.deleteItemAsync(k),
};

export async function setPin(pin: string) {
  const salt = Crypto.randomUUID();
  await store.set(PIN_KEY, `${salt}:${await hash(pin, salt)}`);
}

export async function clearPin() {
  await store.del(PIN_KEY);
}

export async function checkPin(pin: string): Promise<boolean> {
  const saved = await store.get(PIN_KEY);
  if (!saved) return true;
  const [salt, digest] = saved.split(':');
  return (await hash(pin, salt)) === digest;
}

export async function biometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function authenticateBiometric(prompt: string): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: true });
  return r.success;
}
