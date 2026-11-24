import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import { Platform } from 'react-native';

const WALLETS_STORAGE_KEY = 'wallets_list';
const ACTIVE_WALLET_KEY = 'active_wallet_id';
const ENCRYPTION_KEY = 'bitcoin_wallet_encryption';
const ENCRYPTION_VERSION = 'v1';
const PASSWORD_CHECK = 'bitcoin-wallet-password-check-v1';
const PBKDF2_ITERATIONS = 100_000;

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
const storage = isSecureStoreAvailable ? SecureStore : webStorage;

type EncryptedParts = { encryptionKey: CryptoJS.lib.WordArray; macKey: CryptoJS.lib.WordArray };

function deriveKeys(password: string, salt: CryptoJS.lib.WordArray): EncryptedParts {
  const keyMaterial = CryptoJS.PBKDF2(password + ENCRYPTION_KEY, salt, {
    keySize: 16, iterations: PBKDF2_ITERATIONS, hasher: CryptoJS.algo.SHA256
  });
  return {
    encryptionKey: CryptoJS.lib.WordArray.create(keyMaterial.words.slice(0, 8), 32),
    macKey: CryptoJS.lib.WordArray.create(keyMaterial.words.slice(8, 16), 32)
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function encrypt(data: string, password: string): string {
  const salt = CryptoJS.lib.WordArray.random(16);
  const iv = CryptoJS.lib.WordArray.random(16);
  const { encryptionKey, macKey } = deriveKeys(password, salt);
  const ciphertext = CryptoJS.AES.encrypt(data, encryptionKey, { iv }).ciphertext;
  const saltHex = salt.toString(CryptoJS.enc.Hex);
  const ivHex = iv.toString(CryptoJS.enc.Hex);
  const ciphertextBase64 = ciphertext.toString(CryptoJS.enc.Base64);
  const payload = `${ENCRYPTION_VERSION}.${saltHex}.${ivHex}.${ciphertextBase64}`;
  const mac = CryptoJS.HmacSHA256(payload, macKey).toString(CryptoJS.enc.Hex);
  return `${payload}.${mac}`;
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

function normalizeAddress(address: string | WalletAddress, password?: string): string | WalletAddress {
  if (typeof address === 'string') return address;
  if (!address || typeof address.address !== 'string') return '';
  // Keep the legacy TypeScript shape for callers while omitting privateKey at runtime.
  const normalized = {
    path: typeof address.path === 'string' ? address.path : '',
    address: address.address,
    publicKey: typeof address.publicKey === 'string' ? address.publicKey : ''
  } as WalletAddress;
  if (address.encryptedPrivateKey) normalized.encryptedPrivateKey = address.encryptedPrivateKey;
  else if (address.privateKey && password !== undefined) normalized.encryptedPrivateKey = encrypt(address.privateKey, password);
  return normalized;
}

function normalizeAddresses(addresses: unknown, password?: string): (string | WalletAddress)[] {
  if (!Array.isArray(addresses)) return [];
  return addresses.map(address => normalizeAddress(address as string | WalletAddress, password)).filter(address => address !== '');
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
      const data = await storage.getItemAsync(WALLETS_STORAGE_KEY);
      if (!data) return [];
      const parsed: unknown = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      const wallets = parsed.map(wallet => normalizeWallet(wallet as Partial<Wallet>)).filter((wallet): wallet is Wallet => wallet !== null);
      // Strip legacy plaintext address private keys on first read. This is a
      // one-way migration because no password is available at list-loading time.
      const normalizedData = JSON.stringify(wallets);
      if (normalizedData !== data) {
        try { await storage.setItemAsync(WALLETS_STORAGE_KEY, normalizedData); }
        catch (error) { console.error('迁移钱包数据失败:', error); }
      }
      return wallets;
    } catch (error) { console.error('获取钱包列表失败:', error); return []; }
  },

  async saveWallet(walletData: WalletInput, password: string): Promise<Wallet | null> {
    try {
      if (typeof password !== 'string') return null;
      const wallets = await this.getWallets();
      const now = Date.now();
      const wallet: Wallet = {
        id: typeof walletData.id === 'string' && walletData.id.length > 0 ? walletData.id : generateWalletId(),
        name: typeof walletData.name === 'string' && walletData.name.trim() ? walletData.name.trim() : `钱包 ${wallets.length + 1}`,
        networkUrl: typeof walletData.networkUrl === 'string' ? walletData.networkUrl : '',
        encryptedMnemonic: encrypt(typeof walletData.mnemonic === 'string' ? walletData.mnemonic : '', password),
        encryptedSeed: encrypt(typeof walletData.seed === 'string' ? walletData.seed : '', password),
        encryptedPassword: encrypt(PASSWORD_CHECK, password),
        balance: typeof walletData.balance === 'number' && Number.isFinite(walletData.balance) ? walletData.balance : 0,
        addresses: normalizeAddresses(walletData.addresses, password),
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
      const updatedWallet: Wallet = {
        ...current,
        ...(typeof updateData.name === 'string' ? { name: updateData.name.trim() } : {}),
        ...(typeof updateData.networkUrl === 'string' ? { networkUrl: updateData.networkUrl } : {}),
        ...(typeof updateData.balance === 'number' && Number.isFinite(updateData.balance) ? { balance: updateData.balance } : {}),
        ...(updateData.addresses !== undefined ? { addresses: normalizeAddresses(updateData.addresses, password) } : {}),
        updatedAt: Date.now()
      };
      // Never spread arbitrary input fields. Sensitive values are encrypted only when a password is supplied.
      if (password !== undefined && typeof password === 'string') {
        if (typeof updateData.mnemonic === 'string') updatedWallet.encryptedMnemonic = encrypt(updateData.mnemonic, password);
        if (typeof updateData.seed === 'string') updatedWallet.encryptedSeed = encrypt(updateData.seed, password);
        if (typeof updateData.mnemonic === 'string' || typeof updateData.seed === 'string') {
          updatedWallet.encryptedPassword = encrypt(PASSWORD_CHECK, password);
        }
        if (typeof updateData.password === 'string') updatedWallet.encryptedPassword = encrypt(PASSWORD_CHECK, updateData.password);
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
    try { return await storage.getItemAsync(ACTIVE_WALLET_KEY); } catch (error) { console.error('获取激活钱包ID失败:', error); return null; }
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
      await storage.setItemAsync(WALLETS_STORAGE_KEY, JSON.stringify(wallets.filter(wallet => wallet.id !== walletId)));
      if ((await this.getActiveWalletId()) === walletId) await this.clearActiveWallet();
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
