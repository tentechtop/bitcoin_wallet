import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { Platform } from 'react-native';

const WALLETS_STORAGE_KEY = 'wallets_list';
const ACTIVE_WALLET_KEY = 'active_wallet_id';
const ENCRYPTION_KEY = 'bitcoin_wallet_encryption';
const ENCRYPTION_VERSION = 'v1';
const PASSWORD_CHECK = 'bitcoin-wallet-password-check-v1';
const PBKDF2_ITERATIONS = 100_000;
const LEGACY_STORAGE_READ_TIMEOUT_MS = 3_000;

const isSecureStoreAvailable = Platform.OS !== 'web';
const webStorage = {
  getItemAsync: async (key: string): Promise<string | null> => {
    try { return localStorage.getItem(key); } catch (error) { console.error('localStorage 读取失败:', error); return null; }
  },
  setItemAsync: async (key: string, value: string): Promise<void> => {
    try { localStorage.setItem(key, value); } catch (error) { console.error('localStorage 写入失败:', error); throw error; }
  },
  deleteItemAsync: async (key: string): Promise<void> => {
    try { localStorage.removeItem(key); } catch (error) { console.error('localStorage 删除失败:', error); throw error; }
  }
};
const asyncStorage = {
  getItemAsync: (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  setItemAsync: (key: string, value: string): Promise<void> => AsyncStorage.setItem(key, value),
  deleteItemAsync: (key: string): Promise<void> => AsyncStorage.removeItem(key)
};

// Wallet records contain encrypted seeds, mnemonics, passwords, and an
// expandable address list. Android SecureStore has a small per-value limit,
// so storing the whole wallet collection in it makes saving fail as soon as a
// record grows beyond that limit. The sensitive fields remain encrypted before
// they reach AsyncStorage. Keep SecureStore as a legacy source so existing
// installs can migrate without losing wallets.
const storage = Platform.OS === 'web' ? webStorage : asyncStorage;
const legacyStorage = isSecureStoreAvailable ? SecureStore : null;

async function readLegacyStorageItem(key: string): Promise<{ value: string | null; timedOut: boolean }> {
  if (!legacyStorage) return { value: null, timedOut: false };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      legacyStorage.getItemAsync(key).then(value => ({ value, timedOut: false })),
      new Promise<{ value: null; timedOut: true }>(resolve => {
        timeoutId = setTimeout(() => resolve({ value: null, timedOut: true }), LEGACY_STORAGE_READ_TIMEOUT_MS);
      })
    ]);
    return result;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

type EncryptedParts = { encryptionKey: CryptoJS.lib.WordArray; macKey: CryptoJS.lib.WordArray };
type EncryptionContext = EncryptedParts & { salt: CryptoJS.lib.WordArray };

function deriveKeys(password: string, salt: CryptoJS.lib.WordArray): EncryptedParts {
  const keyMaterial = CryptoJS.PBKDF2(password + ENCRYPTION_KEY, salt, {
    keySize: 16, iterations: PBKDF2_ITERATIONS, hasher: CryptoJS.algo.SHA256
  });
  return {
    encryptionKey: CryptoJS.lib.WordArray.create(keyMaterial.words.slice(0, 8), 32),
    macKey: CryptoJS.lib.WordArray.create(keyMaterial.words.slice(8, 16), 32)
  };
}

function createEncryptionContext(password: string): EncryptionContext {
  const salt = CryptoJS.lib.WordArray.random(16);
  return { salt, ...deriveKeys(password, salt) };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function encryptWithContext(data: string, context: EncryptionContext): string {
  const iv = CryptoJS.lib.WordArray.random(16);
  const ciphertext = CryptoJS.AES.encrypt(data, context.encryptionKey, { iv }).ciphertext;
  const saltHex = context.salt.toString(CryptoJS.enc.Hex);
  const ivHex = iv.toString(CryptoJS.enc.Hex);
  const ciphertextBase64 = ciphertext.toString(CryptoJS.enc.Base64);
  const payload = `${ENCRYPTION_VERSION}.${saltHex}.${ivHex}.${ciphertextBase64}`;
  const mac = CryptoJS.HmacSHA256(payload, context.macKey).toString(CryptoJS.enc.Hex);
  return `${payload}.${mac}`;
}

function encrypt(data: string, password: string): string {
  return encryptWithContext(data, createEncryptionContext(password));
}

function decryptV1(encryptedData: string, password: string): string | null {
  const parts = encryptedData.split('.');
  if (parts.length !== 5 || parts[0] !== ENCRYPTION_VERSION) return null;
  try {
    const [, saltHex, ivHex, ciphertextBase64, expectedMac] = parts;
    const salt = CryptoJS.enc.Hex.parse(saltHex);
    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const { encryptionKey, macKey } = deriveKeys(password, salt);
    const payload = `${ENCRYPTION_VERSION}.${saltHex}.${ivHex}.${ciphertextBase64}`;
    const actualMac = CryptoJS.HmacSHA256(payload, macKey).toString(CryptoJS.enc.Hex);
    if (!constantTimeEqual(actualMac, expectedMac)) return null;
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(ciphertextBase64)
    });
    return CryptoJS.AES.decrypt(cipherParams, encryptionKey, { iv }).toString(CryptoJS.enc.Utf8);
  } catch { return null; }
}

/** Decrypts the current authenticated format and the legacy CryptoJS format. */
function decrypt(encryptedData: string, password: string): string | null {
  if (typeof encryptedData !== 'string' || typeof password !== 'string') return null;
  if (encryptedData.startsWith(`${ENCRYPTION_VERSION}.`)) return decryptV1(encryptedData, password);
  try {
    const key = CryptoJS.SHA256(password + ENCRYPTION_KEY).toString();
    const decrypted = CryptoJS.AES.decrypt(encryptedData, key).toString(CryptoJS.enc.Utf8);
    // Legacy ciphertext has no authentication tag. Preserve empty plaintext
    // for old wallets that were created with an empty optional password.
    return decrypted;
  } catch { return null; }
}

function generateWalletId(): string {
  return `wallet_${Date.now()}_${CryptoJS.lib.WordArray.random(12).toString(CryptoJS.enc.Hex)}`;
}

export interface WalletAddress {
  path: string;
  address: string;
  publicKey: string;
  /** Deprecated. New records never persist this field in plaintext. */
  privateKey: string;
  encryptedPrivateKey?: string;
}

export interface Wallet {
  id: string;
  name: string;
  networkUrl: string;
  encryptedMnemonic: string;
  encryptedSeed: string;
  encryptedPassword: string;
  balance: number;
  addresses: (string | WalletAddress)[];
  createdAt: number;
  updatedAt: number;
}

type WalletInput = Partial<Wallet> & { mnemonic?: string; seed?: string; password?: string };

function normalizeAddress(address: string | WalletAddress, password?: string, context?: EncryptionContext): string | WalletAddress {
  if (typeof address === 'string') return address;
  if (!address || typeof address.address !== 'string') return '';
  // Keep the legacy TypeScript shape for callers while omitting privateKey at runtime.
  const normalized = {
    path: typeof address.path === 'string' ? address.path : '',
    address: address.address,
    publicKey: typeof address.publicKey === 'string' ? address.publicKey : ''
  } as WalletAddress;
  if (address.encryptedPrivateKey) normalized.encryptedPrivateKey = address.encryptedPrivateKey;
  else if (address.privateKey && password !== undefined) {
    normalized.encryptedPrivateKey = context
      ? encryptWithContext(address.privateKey, context)
      : encrypt(address.privateKey, password);
  } else if (address.privateKey) {
    // A password is unavailable while loading the wallet list. Preserve the
    // legacy key in memory so the unlock flow can encrypt it before writing.
    // Do not persist this shape from getWallets (see the migration guard below).
    normalized.privateKey = address.privateKey;
  }
  return normalized;
}

function normalizeAddresses(addresses: unknown, password?: string, context?: EncryptionContext): (string | WalletAddress)[] {
  if (!Array.isArray(addresses)) return [];
  return addresses.map(address => normalizeAddress(address as string | WalletAddress, password, context)).filter(address => address !== '');
}

function containsLegacyPlaintextPrivateKey(wallets: Wallet[]): boolean {
  return wallets.some(wallet => wallet.addresses.some(address =>
    typeof address !== 'string' && typeof address.privateKey === 'string' && address.privateKey.length > 0 && !address.encryptedPrivateKey
  ));
}

function normalizeWallet(wallet: Partial<Wallet>): Wallet | null {
  if (!wallet || typeof wallet.id !== 'string' || typeof wallet.encryptedMnemonic !== 'string' ||
      typeof wallet.encryptedSeed !== 'string' || typeof wallet.encryptedPassword !== 'string') return null;
  return {
    id: wallet.id,
    name: typeof wallet.name === 'string' ? wallet.name : '钱包',
    networkUrl: typeof wallet.networkUrl === 'string' ? wallet.networkUrl : '',
    encryptedMnemonic: wallet.encryptedMnemonic,
    encryptedSeed: wallet.encryptedSeed,
    encryptedPassword: wallet.encryptedPassword,
    balance: typeof wallet.balance === 'number' && Number.isFinite(wallet.balance) ? wallet.balance : 0,
    addresses: normalizeAddresses(wallet.addresses),
    createdAt: typeof wallet.createdAt === 'number' ? wallet.createdAt : Date.now(),
    updatedAt: typeof wallet.updatedAt === 'number' ? wallet.updatedAt : Date.now()
  };
}

export const multiWalletStorage = {
  async getWallets(): Promise<Wallet[]> {
    try {
      let data = await storage.getItemAsync(WALLETS_STORAGE_KEY);
      if (!data && legacyStorage) {
        const legacyRead = await readLegacyStorageItem(WALLETS_STORAGE_KEY);
        if (legacyRead.timedOut) throw new Error('读取旧钱包数据超时，请解锁设备后重试');
        const legacyData = legacyRead.value;
        if (legacyData) {
          data = legacyData;
          try {
            await storage.setItemAsync(WALLETS_STORAGE_KEY, legacyData);
          } catch (error) {
            console.error('迁移钱包数据失败:', error);
          }
        }
      }
      if (!data) return [];
      const parsed: unknown = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      const wallets = parsed.map(wallet => normalizeWallet(wallet as Partial<Wallet>)).filter((wallet): wallet is Wallet => wallet !== null);
      // Normalize legacy records on first read. Records containing plaintext
      // address keys stay untouched until the unlock flow can encrypt them.
      const normalizedData = JSON.stringify(wallets);
      if (normalizedData !== data && !containsLegacyPlaintextPrivateKey(wallets)) {
        try { await storage.setItemAsync(WALLETS_STORAGE_KEY, normalizedData); }
        catch (error) { console.error('迁移钱包数据失败:', error); }
      }
      return wallets;
    } catch (error) {
      console.error('获取钱包列表失败:', error);
      throw error;
    }
  },

  async saveWallet(walletData: WalletInput, password: string): Promise<Wallet | null> {
    try {
      if (typeof password !== 'string') return null;
      const wallets = await this.getWallets();
      const now = Date.now();
      const encryptionContext = createEncryptionContext(password);
      const wallet: Wallet = {
        id: typeof walletData.id === 'string' && walletData.id.length > 0 ? walletData.id : generateWalletId(),
        name: typeof walletData.name === 'string' && walletData.name.trim() ? walletData.name.trim() : `钱包 ${wallets.length + 1}`,
        networkUrl: typeof walletData.networkUrl === 'string' ? walletData.networkUrl : '',
        encryptedMnemonic: encryptWithContext(typeof walletData.mnemonic === 'string' ? walletData.mnemonic : '', encryptionContext),
        encryptedSeed: encryptWithContext(typeof walletData.seed === 'string' ? walletData.seed : '', encryptionContext),
        encryptedPassword: encryptWithContext(PASSWORD_CHECK, encryptionContext),
        balance: typeof walletData.balance === 'number' && Number.isFinite(walletData.balance) ? walletData.balance : 0,
        addresses: normalizeAddresses(walletData.addresses, password, encryptionContext),
        createdAt: typeof walletData.createdAt === 'number' ? walletData.createdAt : now,
        updatedAt: now
      };
      const existingIndex = wallets.findIndex(existing => existing.id === wallet.id);
      if (existingIndex >= 0) wallets[existingIndex] = wallet; else wallets.push(wallet);
      await storage.setItemAsync(WALLETS_STORAGE_KEY, JSON.stringify(wallets));
      return wallet;
    } catch (error) { console.error('保存钱包失败:', error); return null; }
  },

  async updateWallet(walletId: string, updateData: WalletInput, password?: string): Promise<Wallet | null> {
    try {
      const wallets = await this.getWallets();
      const index = wallets.findIndex(wallet => wallet.id === walletId);
      if (index < 0) return null;
      const current = wallets[index];
      const encryptionContext = password !== undefined && typeof password === 'string'
        ? createEncryptionContext(password)
        : undefined;
      const updatedWallet: Wallet = {
        ...current,
        ...(typeof updateData.name === 'string' ? { name: updateData.name.trim() } : {}),
        ...(typeof updateData.networkUrl === 'string' ? { networkUrl: updateData.networkUrl } : {}),
        ...(typeof updateData.balance === 'number' && Number.isFinite(updateData.balance) ? { balance: updateData.balance } : {}),
        ...(updateData.addresses !== undefined ? { addresses: normalizeAddresses(updateData.addresses, password, encryptionContext) } : {}),
        updatedAt: Date.now()
      };
      // Never spread arbitrary input fields. Sensitive values are encrypted only when a password is supplied.
      if (password !== undefined && typeof password === 'string') {
        if (typeof updateData.mnemonic === 'string') {
          updatedWallet.encryptedMnemonic = encryptionContext
            ? encryptWithContext(updateData.mnemonic, encryptionContext)
            : encrypt(updateData.mnemonic, password);
        }
        if (typeof updateData.seed === 'string') {
          updatedWallet.encryptedSeed = encryptionContext
            ? encryptWithContext(updateData.seed, encryptionContext)
            : encrypt(updateData.seed, password);
        }
        if (typeof updateData.mnemonic === 'string' || typeof updateData.seed === 'string') {
          updatedWallet.encryptedPassword = encryptionContext
            ? encryptWithContext(PASSWORD_CHECK, encryptionContext)
            : encrypt(PASSWORD_CHECK, password);
        }
        if (typeof updateData.password === 'string') {
          const passwordContext = updateData.password === password
            ? encryptionContext
            : createEncryptionContext(updateData.password);
          updatedWallet.encryptedPassword = passwordContext
            ? encryptWithContext(PASSWORD_CHECK, passwordContext)
            : encrypt(PASSWORD_CHECK, updateData.password);
        }
      }
      wallets[index] = updatedWallet;
      await storage.setItemAsync(WALLETS_STORAGE_KEY, JSON.stringify(wallets));
      return updatedWallet;
    } catch (error) { console.error('更新钱包失败:', error); return null; }
  },

  async updateWalletBalance(walletId: string, balance: number): Promise<boolean> {
    if (!Number.isFinite(balance) || balance < 0) return false;
    return (await this.updateWallet(walletId, { balance })) !== null;
  },

  async getWalletById(walletId: string): Promise<Wallet | null> {
    const wallets = await this.getWallets();
    return wallets.find(wallet => wallet.id === walletId) || null;
  },

  async getActiveWalletId(): Promise<string | null> {
    try {
      let walletId = await storage.getItemAsync(ACTIVE_WALLET_KEY);
      if (!walletId && legacyStorage) {
        const legacyRead = await readLegacyStorageItem(ACTIVE_WALLET_KEY);
        if (legacyRead.timedOut) throw new Error('读取旧激活钱包超时，请解锁设备后重试');
        walletId = legacyRead.value;
        if (walletId) {
          try {
            await storage.setItemAsync(ACTIVE_WALLET_KEY, walletId);
          } catch (error) {
            console.error('迁移激活钱包失败:', error);
          }
        }
      }
      return walletId;
    } catch (error) { console.error('获取激活钱包ID失败:', error); return null; }
  },

  async setActiveWalletId(walletId: string): Promise<boolean> {
    try {
      if (!(await this.getWalletById(walletId))) return false;
      await storage.setItemAsync(ACTIVE_WALLET_KEY, walletId);
      return true;
    } catch (error) { console.error('设置激活钱包失败:', error); return false; }
  },

  async getActiveWallet(): Promise<Wallet | null> {
    const walletId = await this.getActiveWalletId();
    return walletId ? this.getWalletById(walletId) : null;
  },

  async clearActiveWallet(): Promise<boolean> {
    try { await storage.deleteItemAsync(ACTIVE_WALLET_KEY); return true; } catch (error) { console.error('清除激活钱包失败:', error); return false; }
  },

  async deleteWallet(walletId: string): Promise<boolean> {
    try {
      const wallets = await this.getWallets();
      if (!wallets.some(wallet => wallet.id === walletId)) return false;
      const remainingWallets = wallets.filter(wallet => wallet.id !== walletId);
      await storage.setItemAsync(WALLETS_STORAGE_KEY, JSON.stringify(remainingWallets));
      if ((await this.getActiveWalletId()) === walletId) {
        if (remainingWallets.length > 0) {
          await storage.setItemAsync(ACTIVE_WALLET_KEY, remainingWallets[0].id);
        } else {
          await this.clearActiveWallet();
        }
      }
      return true;
    } catch (error) { console.error('删除钱包失败:', error); return false; }
  },

  decryptMnemonic(encryptedMnemonic: string, password: string): string | null { return decrypt(encryptedMnemonic, password); },
  decryptSeed(encryptedSeed: string, password: string): string | null { return decrypt(encryptedSeed, password); },
  decryptPrivateKey(encryptedPrivateKey: string, password: string): string | null { return decrypt(encryptedPrivateKey, password); },

  async verifyWalletPassword(walletId: string, password: string): Promise<boolean> {
    try {
      const wallet = await this.getWalletById(walletId);
      if (!wallet || typeof password !== 'string') return false;
      const decrypted = decrypt(wallet.encryptedPassword, password);
      return decrypted === PASSWORD_CHECK || decrypted === password;
    } catch (error) { console.error('验证钱包密码失败:', error); return false; }
  }
};
