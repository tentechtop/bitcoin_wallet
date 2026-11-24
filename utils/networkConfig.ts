import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bitcoin_api_base_url';
const ENV_DEFAULT = (process.env.EXPO_PUBLIC_BITCOIN_API_URL || '').trim();
let cachedBaseUrl: string | null | undefined;

export type ApiUrlValidation = { valid: true; value: string } | { valid: false; error: string };

/**
 * Validate and normalize the chain API base URL. HTTPS is required for remote
 * nodes. HTTP is accepted only for local development endpoints.
 */
export function validateApiBaseUrl(input: string): ApiUrlValidation {
  const value = typeof input === 'string' ? input.trim().replace(/\/+$/, '') : '';
  if (!value) return { valid: false, error: '请输入链上节点地址' };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { valid: false, error: '节点地址必须是完整 URL，例如 https://node.example.com/bitcoin/chain' };
  }

  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(localHost && parsed.protocol === 'http:')) {
    return { valid: false, error: '远程节点必须使用 HTTPS' };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { valid: false, error: '节点地址不能包含账号、查询参数或片段' };
  }
  return { valid: true, value: parsed.toString().replace(/\/+$/, '') };
}
export async function getApiBaseUrl(): Promise<string> {
  if (cachedBaseUrl !== undefined) return cachedBaseUrl || '';
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const candidate = stored || ENV_DEFAULT;
    const validation = validateApiBaseUrl(candidate);
    cachedBaseUrl = validation.valid ? validation.value : null;
  } catch (error) {
    console.error('读取链上节点配置失败:', error);
    cachedBaseUrl = null;
  }
  return cachedBaseUrl || '';
}

export async function setApiBaseUrl(input: string): Promise<string> {
  const validation = validateApiBaseUrl(input);
  if (!validation.valid) throw new Error(validation.error);
  await AsyncStorage.setItem(STORAGE_KEY, validation.value);
  cachedBaseUrl = validation.value;
  return validation.value;
}

export async function clearApiBaseUrl(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  cachedBaseUrl = null;
}
