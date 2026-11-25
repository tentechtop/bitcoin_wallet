import axios from 'axios';
import bs58 from 'bs58';
import CryptoJS from 'crypto-js';
import { getApiBaseUrl } from '@/utils/networkConfig';

const SATOSHIS_PER_BTC = 100000000;

type ApiEnvelope<T> = {
  success?: boolean;
  code?: number | string;
  message?: string;
  result?: T;
};

function parseJsonResponse<T>(value: unknown): T | null {
  if (typeof value !== 'string') {
    return (value as T) ?? null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isSuccessfulResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as ApiEnvelope<unknown>;
  return response.success === true || Number(response.code) === 200;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeUtxo(value: unknown): UTXO | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const txId = typeof source.txId === 'string' ? source.txId : '';
  const index = asFiniteNumber(source.index, -1);
  const amount = asFiniteNumber(source.value, -1);
  if (!txId || !Number.isInteger(index) || index < 0 || amount < 0) {
    return null;
  }

  return {
    txId,
    index,
    value: amount,
    script: typeof source.script === 'string'
      ? source.script
      : (typeof source.scriptPubKey === 'string' ? source.scriptPubKey : ''),
    scriptPubKeyString: typeof source.scriptPubKeyString === 'string'
      ? source.scriptPubKeyString
      : undefined,
    coinbase: source.coinbase === true,
    height: asFiniteNumber(source.height, 0),
    status: asFiniteNumber(source.status, 0),
    statusStr: typeof source.statusStr === 'string' ? source.statusStr : undefined,
    spendable: typeof source.spendable === 'boolean' ? source.spendable : undefined,
  };
}

function normalizeScript(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const script = value.trim().toLowerCase();
  // The chain API has returned both a HASH160 (40 chars) and a P2PKH
  // script (76a914{hash}88ac). Treat them as the same locking script.
  if (/^76a914[0-9a-f]{40}88ac$/.test(script)) {
    return script.slice(6, -4);
  }
  return script;
}

// 配置 axios 超时时间
const axiosInstance = axios.create({
  timeout: 60000, // 60秒超时(真机网络可能较慢,增加到60秒)
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

export async function buildApiUrl(path: string): Promise<string> {
  const baseUrl = await getApiBaseUrl();
  if (!baseUrl) throw new Error('尚未配置链上节点，请在“我的钱包 - 网络状态”中设置');
  return `${baseUrl}${path}`;
}

// UTXO 接口定义
export interface UTXO {
  txId: string;
  index: number;
  value: number; // 单位：satoshis
  script: string;
  scriptPubKeyString?: string;
  coinbase: boolean;
  height: number;
  status: number; // 1=未确认，2=已确认未花费
  statusStr?: string;
  spendable?: boolean;
}

// 余额信息接口
export interface BalanceInfo {
  totalBalance: number;
  totalBalanceBTC: number;
  availableBalance: number;
  unavailableBalance: number;
  maturingBalance: number;
  utxoCount: number;
  addresses: {
    address: string;
    balance: number;
    availableBalance: number;
    unavailableBalance: number;
    maturingBalance: number;
    utxoCount: number;
    utxos: UTXO[];
    availableUtxos: UTXO[];
  }[];
}

// 交易接口定义
export interface Transaction {
  txId: string;
  id: string;
  title: string;
  time: string;
  amount: string;
  type: 'send' | 'receive' | 'coinbase' | 'empty';
  icon: string;
  status: 'pending' | 'completed' | 'failed' | 'empty';
  statusText: string;
  isCoinbase?: boolean;
  rawData?: any;
  timestamp?: number;
  timeString?: string;
}

export interface TxInput {
  txId: string;
  index: number;
  output?: {
    scriptPubKey: string;
    value: number;
  };
  sequence?: number;
}

export interface TxOutput {
  scriptPubKey: string;
  value: number;
}

export interface TxPoolTransaction {
  txId: string;
  inputs: TxInput[];
  outputs: TxOutput[];
  status?: number;
  statusStr?: string;
  time?: number;
  timeString?: string;
  timeStr?: string;
}

/**
 * 查询单个地址的所有 UTXO
 * @param address 比特币地址
 * @param status 状态码 (2 = 已确认)
 */
export async function getAddressUTXO(address: string, status: number = 2): Promise<UTXO[]> {
  try {
    if (!address || typeof address !== 'string' || !Number.isInteger(status) || status < 0) {
      return [];
    }

    const url = await buildApiUrl(`/getAddressAllUTXO?address=${encodeURIComponent(address)}&status=${status}`);
    const response = await axiosInstance.get(url);

    const data = parseJsonResponse<ApiEnvelope<unknown[]>>(response.data);
    if (!data || !isSuccessfulResponse(data) || data.result === undefined) {
      console.error('查询 UTXO 失败:', data?.message || '未知错误');
      return [];
    }

    const rawUtxos = Array.isArray(data.result) ? data.result : [];
    return rawUtxos
      .map(normalizeUtxo)
      .filter((utxo): utxo is UTXO => utxo !== null);
  } catch (error: any) {
    console.error(`查询地址 ${address} 的 UTXO 失败:`, error.message);
    return [];
  }
}

/**
 * 使用新接口查询单个地址的详细余额信息（包含可用/不可用余额 + UTXO列表）
 * 接口: /getUTXOsByAddressAndCountAndUTXO
 * 接口直接返回余额数据对象，没有 success/result 包装
 * 返回中 availableBalanceUTXOList 是可花费的UTXO，maturingBalanceUTXOList 是成熟中的UTXO
 * @param address 比特币地址
 */
export async function getAddressBalanceWithUTXO(address: string): Promise<{
  balance: number;
  balanceBTC: number;
  availableBalance: number;
  unavailableBalance: number;
  maturingBalance: number;
  utxoCount: number;
  availableUtxos: UTXO[];
  maturingUtxos: UTXO[];
  utxos: UTXO[];
} | null> {
  try {
    if (!address || typeof address !== 'string') {
      return null;
    }

    const url = await buildApiUrl(`/getUTXOsByAddressAndCountAndUTXO?address=${encodeURIComponent(address)}`);
    const response = await axiosInstance.get(url);

    const parsed = parseJsonResponse<Record<string, unknown> | ApiEnvelope<Record<string, unknown>>>(response.data);
    const data: Record<string, unknown> | null = parsed && isSuccessfulResponse(parsed) &&
      typeof (parsed as ApiEnvelope<unknown>).result === 'object' && (parsed as ApiEnvelope<unknown>).result !== null
      ? (parsed as ApiEnvelope<Record<string, unknown>>).result || null
      : parsed as Record<string, unknown> | null;
    if (data && typeof data === 'object' && Number.isFinite(Number(data.totalBalance))) {
      const totalBalance = asFiniteNumber(data.totalBalance) / SATOSHIS_PER_BTC;
      const availableBalance = asFiniteNumber(data.availableBalance) / SATOSHIS_PER_BTC;
      const unavailableBalance = asFiniteNumber(data.unavailableBalance) / SATOSHIS_PER_BTC;
      const maturingBalance = asFiniteNumber(data.maturingBalance) / SATOSHIS_PER_BTC;

      // 从接口返回中直接获取UTXO列表
      const availableUtxos: UTXO[] = (Array.isArray(data.availableBalanceUTXOList) ? data.availableBalanceUTXOList : [])
        .map(normalizeUtxo)
        .filter((utxo): utxo is UTXO => utxo !== null);

      const maturingUtxos: UTXO[] = (Array.isArray(data.maturingBalanceUTXOList) ? data.maturingBalanceUTXOList : [])
        .map(normalizeUtxo)
        .filter((utxo): utxo is UTXO => utxo !== null);

      const utxoCount = availableUtxos.length + maturingUtxos.length;

      return {
        balance: totalBalance,
        balanceBTC: totalBalance,
        availableBalance,
        unavailableBalance,
        maturingBalance,
        utxoCount,
        availableUtxos,
        maturingUtxos,
        utxos: [...availableUtxos, ...maturingUtxos]
      };
    }

    return null;
  } catch (error: any) {
    console.error(`查询地址 ${address} 的余额和UTXO失败:`, error.message);
    return null;
  }
}

/**
 * 使用新接口查询单个地址的详细余额信息（包含可用/不可用余额）
 * 接口直接返回余额数据对象，没有 success/result 包装
 * @param address 比特币地址
 */
export async function getAddressBalanceWithDetails(address: string): Promise<{
  balance: number;
  balanceBTC: number;
  availableBalance: number;
  unavailableBalance: number;
  maturingBalance: number;
  utxoCount: number;
  utxos: UTXO[];
  availableUtxos: UTXO[];
} | null> {
  try {
    if (!address || typeof address !== 'string') {
      return null;
    }

    const url = await buildApiUrl(`/getUTXOsByAddressAndCount?address=${encodeURIComponent(address)}`);
    const response = await axiosInstance.get(url);

    const parsed = parseJsonResponse<Record<string, unknown> | ApiEnvelope<Record<string, unknown>>>(response.data);
    const data: Record<string, unknown> | null = parsed && isSuccessfulResponse(parsed) &&
      typeof (parsed as ApiEnvelope<unknown>).result === 'object' && (parsed as ApiEnvelope<unknown>).result !== null
      ? (parsed as ApiEnvelope<Record<string, unknown>>).result || null
      : parsed as Record<string, unknown> | null;
    if (data && typeof data === 'object' && Number.isFinite(Number(data.totalBalance))) {
      const totalBalance = asFiniteNumber(data.totalBalance) / SATOSHIS_PER_BTC;
      const availableBalance = asFiniteNumber(data.availableBalance) / SATOSHIS_PER_BTC;
      const unavailableBalance = asFiniteNumber(data.unavailableBalance) / SATOSHIS_PER_BTC;
      const maturingBalance = asFiniteNumber(data.maturingBalance) / SATOSHIS_PER_BTC;

      const utxos = await getAddressUTXO(address, 2);

      return {
        balance: totalBalance,
        balanceBTC: totalBalance,
        availableBalance,
        unavailableBalance,
        maturingBalance,
        utxoCount: utxos.filter(utxo => utxo.status === 2).length,
        utxos: utxos,
        availableUtxos: []
      };
    }

    return null;
  } catch (error: any) {
    console.error(`查询地址 ${address} 的余额详情失败:`, error.message);
    return null;
  }
}

/**
 * 统计单个地址的余额（兼容旧版本）
 * @param address 比特币地址
 * @param status 状态码 (2 = 已确认)
 */
export async function getAddressBalance(address: string, status: number = 2): Promise<{
  balance: number; // BTC
  balanceBTC: number; // BTC
  utxoCount: number;
  utxos: UTXO[];
  confirmedBalance: number; // 已确认余额
  unconfirmedBalance: number; // 未确认余额
  immatureBalance: number; // 未成熟余额
}> {
  // status=0 查询所有状态，其他状态值由链上服务过滤。
  const allUtxos = await getAddressUTXO(address, status);

  let totalBalance = 0; // 总余额（聪）
  let confirmedBalance = 0; // 已确认余额
  let unconfirmedBalance = 0; // 未确认余额
  let immatureBalance = 0; // 未成熟余额

  // 统计余额
  allUtxos.forEach(utxo => {
    // 只计算 status=1（未确认输出）和 status=2（已确认未花费）的 UTXO
    if (utxo.status === 1 || utxo.status === 2) {
      // value 字段单位为 satoshis，转换为 BTC（1 BTC = 100,000,000 satoshis）
      const balanceInBTC = utxo.value / SATOSHIS_PER_BTC;
      totalBalance += balanceInBTC;

      // 根据状态分类统计
      if (utxo.status === 2) {
        confirmedBalance += balanceInBTC;
      } else if (utxo.status === 1) {
        unconfirmedBalance += balanceInBTC;
      }
    }

    // 根据状态分类统计其他信息
    if (utxo.coinbase && utxo.status !== 2) {
      // 已确认的 coinbase 输出已成熟。未确认或其他状态仍归入成熟中资产。
      immatureBalance += utxo.value / SATOSHIS_PER_BTC;
    }
  });

  // 转换为 BTC
  const balanceBTC = totalBalance;

  return {
    balance: totalBalance, // 保持 BTC 单位
    balanceBTC,
    utxoCount: allUtxos.filter(utxo => utxo.status === 1 || utxo.status === 2).length,
    utxos: allUtxos,
    confirmedBalance,
    unconfirmedBalance,
    immatureBalance
  };
}

/**
 * 统计钱包的总余额（遍历所有地址，使用新接口）
 * @param addresses 钱包中的地址列表（可以是字符串或对象）
 * @param status 状态码 (2 = 已确认)
 * @param onProgress 进度回调 (current, total)
 */
export async function getWalletBalance(
  addresses: (string | { address: string })[],
  status: number = 2,
  onProgress?: (current: number, total: number) => void
): Promise<BalanceInfo> {
  const addressBalances = [];
  let totalBalance = 0; // BTC
  let totalAvailableBalance = 0; // 可用余额
  let totalUnavailableBalance = 0; // 不可用余额
  let totalMaturingBalance = 0; // 成熟中资产
  let totalUTXOCount = 0;

  // 提取有效的地址字符串
  const validAddresses = addresses
    .map(addr => typeof addr === 'string' ? addr : (addr as any).address)
    .filter(addr => addr && typeof addr === 'string');

  // 并发查询所有地址的详细余额（使用带UTXO列表的接口）
  const promises = validAddresses.map(async (address, index) => {
    const result = await getAddressBalanceWithUTXO(address);

    // 通知进度
    if (onProgress) {
      onProgress(index + 1, validAddresses.length);
    }

    if (result) {
      return {
        address,
        ...result
      };
    }

    // 如果新接口失败，回退到旧接口
    const fallbackResult = await getAddressBalance(address, 0);
    return {
      address,
      balance: fallbackResult.balanceBTC,
      balanceBTC: fallbackResult.balanceBTC,
      availableBalance: fallbackResult.confirmedBalance,
      unavailableBalance: fallbackResult.unconfirmedBalance + fallbackResult.immatureBalance,
      maturingBalance: fallbackResult.immatureBalance,
      utxoCount: fallbackResult.utxoCount,
      utxos: fallbackResult.utxos,
      availableUtxos: []
    };
  });

  try {
    addressBalances.push(...await Promise.all(promises));

    // 统计总余额（已经是 BTC 单位）
    totalBalance = addressBalances.reduce((sum, addr) => sum + addr.balanceBTC, 0);
    totalAvailableBalance = addressBalances.reduce((sum, addr) => sum + (addr.availableBalance || 0), 0);
    totalUnavailableBalance = addressBalances.reduce((sum, addr) => sum + (addr.unavailableBalance || 0), 0);
    totalMaturingBalance = addressBalances.reduce((sum, addr) => sum + (addr.maturingBalance || 0), 0);
    totalUTXOCount = addressBalances.reduce((sum, addr) => sum + addr.utxoCount, 0);

    return {
      totalBalance,
      totalBalanceBTC: totalBalance,
      availableBalance: totalAvailableBalance,
      unavailableBalance: totalUnavailableBalance,
      maturingBalance: totalMaturingBalance,
      utxoCount: totalUTXOCount,
      addresses: addressBalances.map(item => ({
        address: item.address,
        balance: item.balanceBTC,
        availableBalance: item.availableBalance || 0,
        unavailableBalance: item.unavailableBalance || 0,
        maturingBalance: item.maturingBalance || 0,
        utxoCount: item.utxoCount,
        utxos: item.utxos,
        availableUtxos: item.availableUtxos || []
      }))
    };
  } catch (error) {
    console.error('统计钱包余额失败:', error);
    return {
      totalBalance: 0,
      totalBalanceBTC: 0,
      availableBalance: 0,
      unavailableBalance: 0,
      maturingBalance: 0,
      utxoCount: 0,
      addresses: []
    };
  }
}

/**
 * 更新钱包的余额信息
 * @param walletId 钱包 ID
 * @param addresses 地址列表
 * @param updateBalanceCallback 更新余额的回调函数
 */
export async function updateWalletBalance(
  walletId: string,
  addresses: string[],
  updateBalanceCallback: (walletId: string, balance: number) => Promise<void>
): Promise<BalanceInfo | null> {
  try {
    // 查询钱包余额
    const balanceInfo = await getWalletBalance(addresses);

    // 更新钱包的余额字段
    await updateBalanceCallback(walletId, balanceInfo.totalBalanceBTC);

    return balanceInfo;
  } catch (error) {
    console.error('更新钱包余额失败:', error);
    return null;
  }
}

/**
 * 格式化余额显示
 * @param satoshis 余额（聪）
 * @param decimals 小数位数
 */
export function formatBalance(satoshis: number, decimals: number = 8): string {
  const btc = satoshis / SATOSHIS_PER_BTC;
  return btc.toFixed(decimals);
}

/**
 * 格式化 BTC 余额
 * @param btc BTC 数量
 * @param decimals 小数位数
 */
export function formatBTCBalance(btc: number, decimals: number = 8): string {
  return btc.toFixed(decimals);
}

/**
 * 查询地址在交易池中的交易列表
 * @param address 比特币地址
 */
export async function getTxListByAddressInTxPool(address: string): Promise<TxPoolTransaction[]> {
  try {
    if (!address || typeof address !== 'string') {
      return [];
    }

    const url = await buildApiUrl(`/getTxListByAddresInTxPool?address=${encodeURIComponent(address)}`);
    const response = await axiosInstance.get(url);

    const data = parseJsonResponse<ApiEnvelope<unknown>>(response.data);
    if (!data || !isSuccessfulResponse(data)) {
      console.error('查询交易池失败:', data?.message || '未知错误');
      return [];
    }

    const rawTransactions = Array.isArray(data.result)
      ? data.result
      : (data.result && typeof data.result === 'object' && Array.isArray((data.result as Record<string, unknown>).data)
        ? (data.result as Record<string, unknown>).data
        : []);
    return rawTransactions as TxPoolTransaction[];
  } catch (error: any) {
    console.error(`查询地址 ${address} 的交易池失败:`, error.message);
    return [];
  }
}

/**
 * 查询地址的交易历史
 * @param address 比特币地址
 * @param pageSize 每页数量
 * @param lastKey 上一页最后一条记录的key
 */
export async function getTxListByAddress(
  address: string,
  pageSize: number = 100,
  lastKey: string = ''
): Promise<{ data: any[]; lastKey: string; lastPage: boolean }> {
  try {
    if (!address || typeof address !== 'string') {
      console.error('无效的地址格式:', address);
      return { data: [], lastKey: '', lastPage: true };
    }

    const normalizedPageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 100;
    const normalizedLastKey = typeof lastKey === 'string' ? lastKey : '';

    console.log('查询交易历史 - 地址:', address, 'pageSize:', normalizedPageSize, 'lastKey:', normalizedLastKey);
    const url = await buildApiUrl(`/getTxListByAddres?address=${encodeURIComponent(address)}&pageSize=${normalizedPageSize}&lastKey=${encodeURIComponent(normalizedLastKey)}`);

    const response = await axiosInstance.get(url);
    const data = parseJsonResponse<ApiEnvelope<unknown>>(response.data);

    if (data && isSuccessfulResponse(data)) {
      // 处理 result 为 null 的情况（无交易）
      if (!data.result) {
        console.log('该地址暂无交易记录');
        return { data: [], lastKey: '', lastPage: true };
      }

      // 处理标准返回格式 { data: [], lastKey: '', lastPage: false }
      if (typeof data.result === 'object' && Array.isArray((data.result as Record<string, unknown>).data)) {
        const result = data.result as Record<string, unknown>;
        return {
          data: result.data as any[],
          lastKey: typeof result.lastKey === 'string' ? result.lastKey : '',
          lastPage: result.lastPage === true
        };
      }

      // 处理 result 直接是数组的情况（兼容性处理）
      if (Array.isArray(data.result)) {
        return {
          data: data.result,
          lastKey: '',
          lastPage: true
        };
      }
    }

    console.error('查询交易历史失败:', data?.message || '未知错误');
    return { data: [], lastKey: '', lastPage: true };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || error?.message || '未知错误';
    console.error(`查询地址 ${address} 的交易历史失败:`, errorMessage);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('请求已发送但没有收到响应:', error.message);
    } else {
      console.error('请求配置错误:', error.message);
    }
    return { data: [], lastKey: '', lastPage: true };
  }
}

/**
 * 计算地址的 scriptPubKey
 * @param base58Address Base58 编码的比特币地址
 */
export function calculateScriptPubKey(base58Address: string): string {
  try {
    if (!base58Address || typeof base58Address !== 'string') {
      console.error('无效的地址格式:', base58Address);
      return '';
    }

    // 1. Base58 解码
    const decoded = bs58.decode(base58Address);
    if (decoded.length !== 32) {
      console.error('地址公钥长度无效:', decoded.length);
      return '';
    }

    // 2. 转换为 WordArray
    const wordArray = CryptoJS.lib.WordArray.create(decoded);

    // 3. 计算 SHA256
    const sha256Hash = CryptoJS.SHA256(wordArray);

    // 4. 计算 RIPEMD160
    const ripemd160Hash = CryptoJS.RIPEMD160(sha256Hash);

    // 5. 返回十六进制字符串
    return ripemd160Hash.toString(CryptoJS.enc.Hex);
  } catch (error: any) {
    console.error('计算 scriptPubKey 失败:', error?.message || error);
    return '';
  }
}

/**
 * 格式化交易列表
 * @param transactions 交易池交易列表
 * @param myScriptPubKeys 钱包所有地址的scriptPubKey集合
 */
export function formatTransactionList(
  transactions: TxPoolTransaction[],
  myScriptPubKeys: Set<string>
): Transaction[] {
  const normalizedWalletScripts = new Set(Array.from(myScriptPubKeys).map(normalizeScript));
  const belongsToWallet = (script: unknown) => normalizedWalletScripts.has(normalizeScript(script));

  return (Array.isArray(transactions) ? transactions : []).map((tx, index) => {
    const inputs = Array.isArray(tx.inputs) ? tx.inputs : [];
    const outputs = Array.isArray(tx.outputs) ? tx.outputs : [];
    let type: 'send' | 'receive' | 'empty' = 'send';
    let icon = 'arrow-up';
    let amount = '';
    let statusText = '待确认';
    let status: 'pending' | 'completed' | 'failed' | 'empty' = 'pending';
    let isCoinbase = false;

    // 判断是否是 Coinbase 交易（挖矿奖励）
    if (inputs.length === 0 ||
        (inputs.length === 1 && /^0{64}$/.test(inputs[0].txId || ''))) {
      isCoinbase = true;
      type = 'receive';
      icon = 'arrow-down';
      // Coinbase 收入总额
      const totalReceived = outputs.reduce((sum, output) => sum + asFiniteNumber(output.value), 0);
      amount = `+ ${(totalReceived / SATOSHIS_PER_BTC).toFixed(8)} BTC`;
    } else {
      // 计算该交易对钱包的净影响（收入 - 支出）
      let totalReceived = 0;
      let totalSent = 0;

      // 计算总收入
      for (const output of outputs) {
        if (belongsToWallet(output.scriptPubKey)) {
          totalReceived += asFiniteNumber(output.value);
        }
      }

      // 计算总支出
      for (const input of inputs) {
        if (input.output && belongsToWallet(input.output.scriptPubKey)) {
          totalSent += asFiniteNumber(input.output.value);
        }
      }

      // 净金额 = 收入 - 支出
      const netAmount = totalReceived - totalSent;

      if (netAmount > 0) {
        // 净收入
        type = 'receive';
        icon = 'arrow-down';
        amount = `+ ${(netAmount / SATOSHIS_PER_BTC).toFixed(8)} BTC`;
      } else if (netAmount < 0) {
        // 净支出
        type = 'send';
        icon = 'arrow-up';
        amount = `- ${(Math.abs(netAmount) / SATOSHIS_PER_BTC).toFixed(8)} BTC`;
      } else {
        // 内部转账
        type = 'send';
        icon = 'arrow-up';
        amount = `- ${(totalSent / SATOSHIS_PER_BTC).toFixed(8)} BTC`;
      }
    }

    // 处理交易状态
    const statusCode = asFiniteNumber(tx.status);
    if (statusCode === 3) {
      status = 'failed';
      statusText = '失败';
    } else if (statusCode === 2) {
      status = 'completed';
      statusText = '已完成';
    } else if (tx.statusStr && tx.statusStr.includes('已验证')) {
      status = 'pending';
      statusText = '交易中';
    }

    // 直接使用API返回的时间字符串
    const txTime = tx.timeStr || tx.timeString || '';

    // 构建交易标题
    let title = '';
    if (isCoinbase) {
      title = '挖矿奖励 (Coinbase)';
    } else if (type === 'send') {
      const totalInput = inputs.reduce((s, i) => s + asFiniteNumber(i.output?.value), 0);
      const totalOutput = outputs.reduce((s, o) => s + asFiniteNumber(o.value), 0);
      const fee = (totalInput - totalOutput) / SATOSHIS_PER_BTC;
      title = `发送BTC (交易手续费: ${fee.toFixed(8)} BTC)`;
    } else {
      title = '接收BTC';
    }

    return {
      id: tx.txId || `tx_${index}_${Date.now()}`,
      txId: tx.txId || '',
      title,
      time: txTime,
      amount,
      type,
      icon,
      status,
      statusText,
      isCoinbase,
      rawData: tx,
      timestamp: tx.time || 0,
    };
  });
}

/** 查询单笔链上交易，供交易详情页和交易 ID 搜索使用。 */
export async function getTransactionByHash(txId: string): Promise<TxPoolTransaction | null> {
  const normalizedTxId = typeof txId === 'string' ? txId.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(normalizedTxId)) {
    return null;
  }

  try {
    const response = await axiosInstance.get(await buildApiUrl(`/getTxByHash?hash=${encodeURIComponent(normalizedTxId)}`));
    const parsed = parseJsonResponse<unknown>(response.data);
    const data = parsed && typeof parsed === 'object' && 'result' in parsed
      ? (parsed as { result?: unknown }).result
      : parsed;
    if (!data || typeof data !== 'object') {
      return null;
    }

    const normalized = data as Record<string, unknown>;
    return {
      txId: typeof normalized.txId === 'string' ? normalized.txId : normalizedTxId,
      inputs: (Array.isArray(normalized.inputs) ? normalized.inputs : []) as TxInput[],
      outputs: (Array.isArray(normalized.outputs) ? normalized.outputs : []) as TxOutput[],
      status: asFiniteNumber(normalized.status),
      statusStr: typeof normalized.statusStr === 'string' ? normalized.statusStr : undefined,
      time: asFiniteNumber(normalized.time),
      timeString: typeof normalized.timeString === 'string' ? normalized.timeString : undefined,
      timeStr: typeof normalized.timeStr === 'string' ? normalized.timeStr : undefined,
    };
  } catch (error: any) {
    console.error('查询交易详情失败:', error?.message || error);
    return null;
  }
}

/**
 * 提交交易到比特币网络
 * @param transferData 交易数据
 */
export async function submitTransaction(transferData: {
  version: number;
  lockTime: number;
  inputs: Array<{
    txId: string;
    index: number;
    sequence: number;
    scriptSig: string;
  }>;
  outputs: Array<{
    value: number;
    scriptPubKey: string;
  }>;
}): Promise<{ success: boolean; result?: string; message?: string }> {
  try {
    if (!transferData || !Number.isInteger(transferData.version) || !Number.isInteger(transferData.lockTime) ||
        !Array.isArray(transferData.inputs) || transferData.inputs.length === 0 ||
        !Array.isArray(transferData.outputs) || transferData.outputs.length === 0) {
      return { success: false, message: '交易结构无效' };
    }

    const hasInvalidInput = transferData.inputs.some(input =>
      !input || typeof input.txId !== 'string' || input.txId.length === 0 ||
      !Number.isInteger(input.index) || input.index < 0 ||
      !Number.isInteger(input.sequence) || typeof input.scriptSig !== 'string'
    );
    const hasInvalidOutput = transferData.outputs.some(output =>
      !output || !Number.isInteger(output.value) || output.value <= 0 ||
      typeof output.scriptPubKey !== 'string' || output.scriptPubKey.length === 0
    );
    if (hasInvalidInput || hasInvalidOutput) {
      return { success: false, message: '交易输入或输出无效' };
    }

    console.log('提交交易:', {
      version: transferData.version,
      lockTime: transferData.lockTime,
      inputCount: transferData.inputs.length,
      outputCount: transferData.outputs.length,
      inputTxIds: transferData.inputs.map(input => input.txId),
    });

    const response = await axiosInstance.post(await buildApiUrl('/transfer'), transferData);
    const data = parseJsonResponse<ApiEnvelope<string>>(response.data);

    if (data && isSuccessfulResponse(data)) {
      return {
        success: true,
        result: typeof data.result === 'string' ? data.result : undefined,
        message: data.message
      };
    } else {
      return {
        success: false,
        message: data?.message || '交易提交失败'
      };
    }
  } catch (error: any) {
    console.error('提交交易失败:', error);
    const errorMessage = error?.response?.data?.message || error?.message || '网络错误';
    return {
      success: false,
      message: errorMessage
    };
  }
}

/**
 * 查询地址的可花费UTXO列表（用于发送交易）
 * 优先使用 getUTXOsByAddressAndCountAndUTXO 接口获取 availableBalanceUTXOList
 * @param address 比特币地址
 */
export async function queryUTXOByAddress(address: string): Promise<UTXO[]> {
  try {
    const result = await getAddressBalanceWithUTXO(address);
    if (result && result.availableUtxos && result.availableUtxos.length > 0) {
      return result.availableUtxos.filter(utxo => utxo.spendable !== false && utxo.status !== 3);
    }
  } catch (error) {
    console.error('通过新接口查询可花费UTXO失败，回退到旧接口:', error);
  }
  const utxos = await getAddressUTXO(address, 2);
  return utxos.filter(utxo => utxo.spendable !== false && utxo.status !== 3);
}

/**
 * 选择一组足以支付金额和手续费的可花费 UTXO。
 * 优先选择单个足额输出，其次选择金额最大的输出，减少输入数量和交易体积。
 */
export function selectUTXOs(utxos: UTXO[], amount: number, fee: number): {
  selected: UTXO[];
  total: number;
  change: number;
} {
  const required = Math.ceil(amount + fee);
  if (!Number.isFinite(required) || required <= 0) {
    return { selected: [], total: 0, change: 0 };
  }

  const candidates = (Array.isArray(utxos) ? utxos : [])
    .filter(utxo => utxo && utxo.spendable !== false && utxo.status !== 3 && Number.isFinite(utxo.value) && utxo.value > 0)
    .slice()
    .sort((a, b) => b.value - a.value);

  const exactOrCovering = candidates.find(utxo => utxo.value >= required);
  if (exactOrCovering) {
    return {
      selected: [exactOrCovering],
      total: exactOrCovering.value,
      change: exactOrCovering.value - required
    };
  }

  const selected: UTXO[] = [];
  let total = 0;
  for (const utxo of candidates) {
    selected.push(utxo);
    total += utxo.value;
    if (total >= required) {
      break;
    }
  }

  return {
    selected: total >= required ? selected : [],
    total: total >= required ? total : 0,
    change: total >= required ? total - required : 0
  };
}


