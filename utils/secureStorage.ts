import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import { Platform } from 'react-native';

const WALLETS_STORAGE_KEY = 'wallets_list';
const ACTIVE_WALLET_KEY = 'active_wallet_id';
const ENCRYPTION_KEY = 'bitcoin_wallet_encryption';

// 检查 SecureStore 是否可用
const isSecureStoreAvailable = Platform.OS !== 'web';

// Web 环境降级方案：使用 localStorage
const webStorage = {
  getItemAsync: async (key: string): Promise<string | null> => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('localStorage 读取失败:', error);
      return null;
    }
  },
  setItemAsync: async (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('localStorage 写入失败:', error);
      throw error;
    }
  },
  deleteItemAsync: async (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('localStorage 删除失败:', error);
      throw error;
    }
  }
};

const storage = isSecureStoreAvailable ? SecureStore : webStorage;

// 加密数据
function encrypt(data: string, password: string): string {
  const key = CryptoJS.SHA256(password + ENCRYPTION_KEY).toString();
  const encrypted = CryptoJS.AES.encrypt(data, key).toString();
  return encrypted;
}

// 解密数据
function decrypt(encryptedData: string, password: string): string | null {
  try {
    const key = CryptoJS.SHA256(password + ENCRYPTION_KEY).toString();
    const bytes = CryptoJS.AES.decrypt(encryptedData, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted;
  } catch (error) {
    console.error('解密失败:', error);
    return null;
  }
}

// 生成钱包ID
function generateWalletId(): string {
  return 'wallet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 钱包数据接口
export interface Wallet {
  id: string;
  name: string;
  networkUrl: string;
  encryptedMnemonic: string;
  encryptedSeed: string;
  encryptedPassword: string;
  balance: number;
  addresses: string[];
  createdAt: number;
  updatedAt: number;
}

// 多钱包安全存储工具
export const multiWalletStorage = {
  // 获取所有钱包列表
  async getWallets(): Promise<Wallet[]> {
    try {
      const data = await storage.getItemAsync(WALLETS_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('获取钱包列表失败:', error);
      return [];
    }
  },

  // 保存单个钱包（使用密码加密敏感信息）
  async saveWallet(walletData: Partial<Wallet>, password: string): Promise<Wallet | null> {
    try {
      const wallets = await this.getWallets();
      
      // 加密敏感信息
      const encryptedMnemonic = encrypt(walletData.mnemonic || '', password);
      const encryptedSeed = encrypt(walletData.seed || '', password);
      const encryptedPassword = encrypt(password, password);
      
      const wallet: Wallet = {
        id: walletData.id || generateWalletId(),
        name: walletData.name || `钱包 ${wallets.length + 1}`,
        networkUrl: walletData.networkUrl || '',
        encryptedMnemonic,
        encryptedSeed,
        encryptedPassword,
        balance: 0,
        addresses: [],
        createdAt: walletData.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      // 检查是否已存在相同ID的钱包
      const existingIndex = wallets.findIndex(w => w.id === wallet.id);
      if (existingIndex >= 0) {
        wallets[existingIndex] = wallet;
      } else {
        wallets.push(wallet);
      }

      await storage.setItemAsync(WALLETS_STORAGE_KEY, JSON.stringify(wallets));
      return wallet;
    } catch (error) {
      console.error('保存钱包失败:', error);
      return null;
    }
  },

  // 更新钱包
  async updateWallet(walletId: string, updateData: Partial<Wallet>, password?: string): Promise<Wallet | null> {
    try {
      const wallets = await this.getWallets();
      const index = wallets.findIndex(w => w.id === walletId);
      
      if (index >= 0) {
        const updatedWallet = {
          ...wallets[index],
          ...updateData,
          updatedAt: Date.now()
        };
        
        // 如果需要更新敏感信息且提供了密码
        if (password && (updateData.mnemonic || updateData.seed)) {
          if (updateData.mnemonic) {
            updatedWallet.encryptedMnemonic = encrypt(updateData.mnemonic, password);
          }
          if (updateData.seed) {
            updatedWallet.encryptedSeed = encrypt(updateData.seed, password);
          }
        }
        
        wallets[index] = updatedWallet;
        await storage.setItemAsync(WALLETS_STORAGE_KEY, JSON.stringify(wallets));
        return updatedWallet;
      }
      return null;
    } catch (error) {
      console.error('更新钱包失败:', error);
      return null;
    }
  },

  // 根据ID获取钱包
  async getWalletById(walletId: string): Promise<Wallet | null> {
    try {
      const wallets = await this.getWallets();
      return wallets.find(w => w.id === walletId) || null;
    } catch (error) {
      console.error('获取钱包失败:', error);
      return null;
    }
  },

  // 获取激活的钱包ID
  async getActiveWalletId(): Promise<string | null> {
    try {
      return await storage.getItemAsync(ACTIVE_WALLET_KEY);
    } catch (error) {
      console.error('获取激活钱包ID失败:', error);
      return null;
    }
  },

  // 设置激活的钱包
  async setActiveWalletId(walletId: string): Promise<boolean> {
    try {
      await storage.setItemAsync(ACTIVE_WALLET_KEY, walletId);
      return true;
    } catch (error) {
      console.error('设置激活钱包失败:', error);
      return false;
    }
  },

  // 获取激活的钱包对象
  async getActiveWallet(): Promise<Wallet | null> {
    const walletId = await this.getActiveWalletId();
    if (walletId) {
      return this.getWalletById(walletId);
    }
    return null;
  },

  // 清除激活钱包
  async clearActiveWallet(): Promise<boolean> {
    try {
      await storage.deleteItemAsync(ACTIVE_WALLET_KEY);
      return true;
    } catch (error) {
      console.error('清除激活钱包失败:', error);
      return false;
    }
  },

  // 删除钱包
  async deleteWallet(walletId: string): Promise<boolean> {
    try {
      const wallets = await this.getWallets();
      const newWallets = wallets.filter(w => w.id !== walletId);
      await storage.setItemAsync(WALLETS_STORAGE_KEY, JSON.stringify(newWallets));

      // 如果删除的是当前激活的钱包,清除激活状态
      const activeId = await this.getActiveWalletId();
      if (activeId === walletId) {
        await this.clearActiveWallet();
      }
      return true;
    } catch (error) {
      console.error('删除钱包失败:', error);
      return false;
    }
  },

  // 解密钱包的助记词
  decryptMnemonic(encryptedMnemonic: string, password: string): string | null {
    return decrypt(encryptedMnemonic, password);
  },

  // 解密钱包的种子
  decryptSeed(encryptedSeed: string, password: string): string | null {
    return decrypt(encryptedSeed, password);
  },

  // 验证钱包密码
  async verifyWalletPassword(walletId: string, password: string): Promise<boolean> {
    try {
      const wallet = await this.getWalletById(walletId);
      if (!wallet) return false;
      
      const decrypted = decrypt(wallet.encryptedPassword, password);
      return decrypted === password;
    } catch (error) {
      console.error('验证钱包密码失败:', error);
      return false;
    }
  }
};
