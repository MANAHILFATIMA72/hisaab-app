import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Takes or picks a receipt photo and keeps a private copy in the app's documents folder,
 * so it survives the picker's cache being cleared. Returns the saved file uri, or null if cancelled.
 */
export async function captureReceipt(source: 'camera' | 'library'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5 };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const uri = result.assets[0].uri;
  if (Platform.OS === 'web') return uri;
  const dir = new Directory(Paths.document, 'receipts');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${Date.now()}.jpg`);
  await new File(uri).copy(dest);
  return dest.uri;
}

export function deleteReceipt(uri: string | null) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // The photo is already gone; nothing to clean up.
  }
}
