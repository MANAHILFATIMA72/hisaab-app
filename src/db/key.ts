import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

const KEY_NAME = 'hisaab.db.key.v1';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Unlocks the SQLCipher database with a random key kept in the Android Keystore (via SecureStore).
 * Must run before any other statement on the connection. Web has no SQLCipher, so it is skipped.
 */
export async function applyEncryptionKey(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') return;
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key) {
    key = toHex(Crypto.getRandomBytes(32));
    await SecureStore.setItemAsync(KEY_NAME, key);
  }
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
}
