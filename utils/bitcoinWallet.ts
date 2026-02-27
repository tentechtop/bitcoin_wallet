import * as bip39 from 'bip39';
import { BIP32Factory } from '@scure/bip32';
import * as ecc from '@noble/secp256k1';
import * as bs58 from 'bs58';
import { sha256 } from '@noble/hashes/sha256';

const bip32 = BIP32Factory(ecc);

// 生成助记词
export function generateMnemonic(): string {
  return bip39.generateMnemonic(128); // 12 words
}

// 验证助记词
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

// 从助记词生成种子
export function mnemonicToSeed(mnemonic: string, password?: string): Uint8Array {
  return bip39.mnemonicToSeedSync(mnemonic, password);
}

// 生成HD钱包根密钥
export function getHDWallet(mnemonic: string, password?: string) {
  const seed = mnemonicToSeed(mnemonic, password);
  return bip32.fromSeed(seed);
}

// 派生子私钥
export function derivePrivateKey(hdWallet: any, derivationPath: string) {
  const child = hdWallet.derivePath(derivationPath);
  return child.privateKey;
}

// 私钥转公钥
export function privateKeyToPublicKey(privateKey: Buffer | Uint8Array): Buffer {
  const keyPair = ecc.getPublicKey(privateKey, false);
  return Buffer.from(keyPair);
}

// 生成P2PKH地址
export function generateP2PKHAddress(publicKey: Buffer | Uint8Array): string {
  const pubKeyHash = sha256(publicKey);
  const hash = Buffer.from(pubKeyHash);
  
  // 添加版本字节（0x00 for mainnet）
  const versioned = Buffer.concat([Buffer.from([0x00]), hash.slice(0, 20)]);
  
  // 双重SHA256
  const checksum = sha256(sha256(versioned));
  
  // 拼接地址
  const addressBytes = Buffer.concat([versioned, checksum.slice(0, 4)]);
  
  // Base58编码
  return bs58.encode(addressBytes);
}

// 生成比特币地址
export function generateBitcoinAddress(mnemonic: string, derivationPath: string = "m/44'/0'/0'/0/0"): string {
  const hdWallet = getHDWallet(mnemonic);
  const privateKey = derivePrivateKey(hdWallet, derivationPath);
  const publicKey = privateKeyToPublicKey(privateKey);
  return generateP2PKHAddress(publicKey);
}
