import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';
import * as ecc from '@noble/secp256k1';
import bs58 from 'bs58';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type BitcoinNetwork = 'mainnet' | 'testnet';

const DEFAULT_DERIVATION_PATH = "m/44'/0'/0'/0/0";

function normalizeMnemonic(mnemonic: string): string {
  if (typeof mnemonic !== 'string') throw new TypeError('助记词必须是字符串');
  const normalized = mnemonic.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('助记词不能为空');
  return normalized;
}

function assertDerivationPath(path: string): void {
  if (typeof path !== 'string' || !/^m(?:\/(?:\d+)(?:')?)+$/.test(path)) {
    throw new Error('无效的 BIP32 派生路径');
  }
}

/** Generates a cryptographically random BIP39 mnemonic. */
export function generateMnemonic(strength: 128 | 160 | 192 | 224 | 256 = 128): string {
  return bip39.generateMnemonic(strength);
}

/** Validates a normalized English BIP39 mnemonic. */
export function validateMnemonic(mnemonic: string): boolean {
  try { return bip39.validateMnemonic(normalizeMnemonic(mnemonic)); } catch { return false; }
}

/** Converts a BIP39 mnemonic into the 512-bit BIP39 seed. */
export function mnemonicToSeed(mnemonic: string, password = ''): Uint8Array {
  const normalized = normalizeMnemonic(mnemonic);
  if (typeof password !== 'string') throw new TypeError('助记词密码必须是字符串');
  if (!validateMnemonic(normalized)) throw new Error('助记词无效');
  return bip39.mnemonicToSeedSync(normalized, password);
}

/** Creates a BIP32 root key from a validated mnemonic. */
export function getHDWallet(mnemonic: string, password = ''): HDKey {
  return HDKey.fromMasterSeed(mnemonicToSeed(mnemonic, password));
}

/** Derives a secp256k1 private key for a BIP32 path. */
export function derivePrivateKey(hdWallet: HDKey, derivationPath: string): Uint8Array {
  if (!hdWallet || typeof hdWallet.derive !== 'function') throw new TypeError('无效的 HD 钱包');
  assertDerivationPath(derivationPath);
  const privateKey = hdWallet.derive(derivationPath).privateKey;
  if (!privateKey || privateKey.length !== 32) throw new Error('派生私钥失败');
  return new Uint8Array(privateKey);
}

/** Returns a compressed or uncompressed public key for a private key. */
export function privateKeyToPublicKey(privateKey: Buffer | Uint8Array, compressed = true): Buffer {
  const bytes = new Uint8Array(privateKey);
  if (bytes.length !== 32 || !ecc.utils.isValidSecretKey(bytes)) throw new Error('无效的 secp256k1 私钥');
  return Buffer.from(ecc.getPublicKey(bytes, compressed));
}

/** Creates a Base58Check P2PKH address from a secp256k1 public key. */
export function generateP2PKHAddress(
  publicKey: Buffer | Uint8Array,
  network: BitcoinNetwork = 'mainnet'
): string {
  const key = new Uint8Array(publicKey);
  if (key.length !== 33 && key.length !== 65) throw new Error('无效的 secp256k1 公钥');
  if (!ecc.utils.isValidPublicKey(key)) throw new Error('无效的 secp256k1 公钥');
  const publicKeyHash = ripemd160(sha256(key));
  const version = network === 'mainnet' ? 0x00 : network === 'testnet' ? 0x6f : undefined;
  if (version === undefined) throw new Error('不支持的 Bitcoin 网络');
  const payload = new Uint8Array(21);
  payload[0] = version;
  payload.set(publicKeyHash, 1);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const addressBytes = new Uint8Array(25);
  addressBytes.set(payload);
  addressBytes.set(checksum, 21);
  return bs58.encode(addressBytes);
}

/** Derives a Bitcoin P2PKH address from a mnemonic and BIP32 path. */
export function generateBitcoinAddress(
  mnemonic: string,
  derivationPath = DEFAULT_DERIVATION_PATH,
  password = '',
  network: BitcoinNetwork = 'mainnet'
): string {
  const privateKey = derivePrivateKey(getHDWallet(mnemonic, password), derivationPath);
  return generateP2PKHAddress(privateKeyToPublicKey(privateKey), network);
}
