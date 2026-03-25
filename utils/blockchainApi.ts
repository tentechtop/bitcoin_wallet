import axios from 'axios';
import bs58 from 'bs58';
import CryptoJS from 'crypto-js';

// API 基础配置
// 注意：在真机上需要使用公网IP，不能使用 localhost 或局域网IP
const API_BASE_URL = 'http://101.35.87.31:18333/bitcoin/chain';

// 备用API地址(如果主地址不可用)
const FALLBACK_API_URLS = [
  'http://101.35.87.31:18333/bitcoin/chain',
];

// 配置 axios 超时时间
const axiosInstance = axios.create({
  timeout: 60000, // 60秒超时(真机网络可能较慢,增加到60秒)
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

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
  type: 'send' | 'receive' | 'empty';
  icon: string;
  status: 'pending' | 'completed' | 'failed' | 'empty';
  statusText: string;
  isCoinbase?: boolean;
  rawData?: any;
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
}

/**
 * 查询单个地址的所有 UTXO
 * @param address 比特币地址
 * @param status 状态码 (2 = 已确认)
 */
export async function getAddressUTXO(address: string, status: number = 2): Promise<UTXO[]> {
  try {
    if (!address || typeof address !== 'string') {
      return [];
    }

    const url = `${API_BASE_URL}/getAddressAllUTXO?address=${encodeURIComponent(address)}&status=${status}`;
    const response = await axiosInstance.get(url);

    // 处理字符串响应
    if (typeof response.data === 'string') {
      try {
        response.data = JSON.parse(response.data);
      } catch (e) {
        return [];
      }
    }

    const isSuccess = response.data &&
                     (response.data.success === true || response.data.code === 200) &&
                     response.data.result !== undefined;

    if (isSuccess) {
      return response.data.result || [];
    } else {
      console.error('查询 UTXO 失败:', response.data?.message || '未知错误');
      return [];
    }
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

    const url = `${API_BASE_URL}/getUTXOsByAddressAndCountAndUTXO?address=${encodeURIComponent(address)}`;
    const response = await axiosInstance.get(url);

    if (typeof response.data === 'string') {
      try {
        response.data = JSON.parse(response.data);
      } catch (e) {
        return null;
      }
    }

    const data = response.data;
    if (data && typeof data.totalBalance === 'number') {
      const totalBalance = data.totalBalance / 100000000;
      const availableBalance = (data.availableBalance || 0) / 100000000;
      const unavailableBalance = (data.unavailableBalance || 0) / 100000000;
      const maturingBalance = (data.maturingBalance || 0) / 100000000;

      // 从接口返回中直接获取UTXO列表
      const availableUtxos: UTXO[] = (data.availableBalanceUTXOList || []).map((u: any) => ({
        txId: u.txId,
        index: u.index,
        value: u.value,
        script: u.script,
        scriptPubKeyString: u.scriptPubKeyString,
        coinbase: u.coinbase || false,
        height: u.height,
        status: u.status,
        statusStr: u.statusStr,
        spendable: u.spendable,
      }));

      const maturingUtxos: UTXO[] = (data.maturingBalanceUTXOList || []).map((u: any) => ({
        txId: u.txId,
        index: u.index,
        value: u.value,
        script: u.script,
        scriptPubKeyString: u.scriptPubKeyString,
        coinbase: u.coinbase || false,
        height: u.height,
        status: u.status,
        statusStr: u.statusStr,
        spendable: u.spendable,
      }));

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

    const url = `${API_BASE_URL}/getUTXOsByAddressAndCount?address=${encodeURIComponent(address)}`;
    const response = await axiosInstance.get(url);

    if (typeof response.data === 'string') {
      try {
        response.data = JSON.parse(response.data);
      } catch (e) {
        return null;
      }
    }

    const data = response.data;
    if (data && typeof data.totalBalance === 'number') {
      const totalBalance = data.totalBalance / 100000000;
      const availableBalance = (data.availableBalance || 0) / 100000000;
      const unavailableBalance = (data.unavailableBalance || 0) / 100000000;
      const maturingBalance = (data.maturingBalance || 0) / 100000000;

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
  balance: number; // 聪
  balanceBTC: number; // BTC
  utxoCount: number;
  utxos: UTXO[];
  confirmedBalance: number; // 已确认余额
  unconfirmedBalance: number; // 未确认余额
  immatureBalance: number; // 未成熟余额
}> {
  // 查询所有 UTXO（包括未确认和已确认）
  const allUtxos = await getAddressUTXO(address, 0); // status=0 查询所有状态

  let totalBalance = 0; // 总余额（聪）
  let confirmedBalance = 0; // 已确认余额
  let unconfirmedBalance = 0; // 未确认余额
  let immatureBalance = 0; // 未成熟余额

  // 统计余额
  allUtxos.forEach(utxo => {
    // 只计算 status=1（未确认输出）和 status=2（已确认未花费）的 UTXO
    if (utxo.status === 1 || utxo.status === 2) {
      // value 字段单位为 satoshis，转换为 BTC（1 BTC = 100,000,000 satoshis）
      const balanceInBTC = utxo.value / 100000000;
      totalBalance += balanceInBTC;

      // 根据状态分类统计
      if (utxo.status === 2) {
        confirmedBalance += balanceInBTC;
      } else if (utxo.status === 1) {
        unconfirmedBalance += balanceInBTC;
      }
    }

    // 根据状态分类统计其他信息
    if (utxo.coinbase) {
      // Coinbase 交易通常有成熟期
      immatureBalance += utxo.value / 100000000;
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
  const btc = satoshis / 100000000;
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

    const url = `${API_BASE_URL}/getTxListByAddresInTxPool?address=${encodeURIComponent(address)}`;
    const response = await axiosInstance.get(url);

    if (typeof response.data === 'string') {
      try {
        response.data = JSON.parse(response.data);
      } catch (e) {
        return [];
      }
    }

    const isSuccess = response.data &&
                     (response.data.success === true || response.data.code === 200) &&
                     Array.isArray(response.data.result);

    if (isSuccess) {
      return response.data.result;
    } else {
      console.error('查询交易池失败:', response.data?.message || '未知错误');
      return [];
    }
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

    console.log('查询交易历史 - 地址:', address, 'pageSize:', pageSize, 'lastKey:', lastKey);
    const url = `${API_BASE_URL}/getTxListByAddres?address=${encodeURIComponent(address)}&pageSize=${pageSize}&lastKey=${encodeURIComponent(lastKey)}`;

    const response = await axiosInstance.get(url);
    console.log('交易历史响应数据:', response.data);

    if (response.data && response.data.success === true) {
      // 处理 result 为 null 的情况（无交易）
      if (!response.data.result) {
        console.log('该地址暂无交易记录');
        return { data: [], lastKey: '', lastPage: true };
      }

      // 处理标准返回格式 { data: [], lastKey: '', lastPage: false }
      if (response.data.result.data && Array.isArray(response.data.result.data)) {
        return {
          data: response.data.result.data,
          lastKey: response.data.result.lastKey || '',
          lastPage: response.data.result.lastPage || false
        };
      }

      // 处理 result 直接是数组的情况（兼容性处理）
      if (Array.isArray(response.data.result)) {
        return {
          data: response.data.result,
          lastKey: '',
          lastPage: true
        };
      }
    }

    console.error('查询交易历史失败:', response.data?.message || '未知错误');
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
  return transactions.map((tx, index) => {
    let type: 'send' | 'receive' | 'empty' = 'send';
    let icon = 'arrow-up';
    let amount = '';
    let statusText = '待确认';
    let status: 'pending' | 'completed' | 'failed' | 'empty' = 'pending';
    let isCoinbase = false;

    // 判断是否是 Coinbase 交易（挖矿奖励）
    if (!tx.inputs || tx.inputs.length === 0 ||
        (tx.inputs.length === 1 && tx.inputs[0].txId === '0000000000000000000000000000000000000000000000000000000000000')) {
      isCoinbase = true;
      type = 'receive';
      icon = 'arrow-down';
      // Coinbase 收入总额
      const totalReceived = tx.outputs.reduce((sum, output) => sum + output.value, 0);
      amount = `+ ${(totalReceived / 100000000).toFixed(8)} BTC`;
    } else {
      // 计算该交易对钱包的净影响（收入 - 支出）
      let totalReceived = 0;
      let totalSent = 0;

      // 计算总收入
      if (tx.outputs) {
        for (const output of tx.outputs) {
          if (myScriptPubKeys.has(output.scriptPubKey)) {
            totalReceived += output.value || 0;
          }
        }
      }

      // 计算总支出
      if (tx.inputs) {
        for (const input of tx.inputs) {
          if (input.output && input.output.scriptPubKey && myScriptPubKeys.has(input.output.scriptPubKey)) {
            totalSent += input.output.value || 0;
          }
        }
      }

      // 净金额 = 收入 - 支出
      const netAmount = totalReceived - totalSent;

      if (netAmount > 0) {
        // 净收入
        type = 'receive';
        icon = 'arrow-down';
        amount = `+ ${(netAmount / 100000000).toFixed(8)} BTC`;
      } else if (netAmount < 0) {
        // 净支出
        type = 'send';
        icon = 'arrow-up';
        amount = `- ${(Math.abs(netAmount) / 100000000).toFixed(8)} BTC`;
      } else {
        // 内部转账
        type = 'send';
        icon = 'arrow-up';
        amount = `- ${(totalSent / 100000000).toFixed(8)} BTC`;
      }
    }

    // 处理交易状态
    if (tx.statusStr && tx.statusStr.includes('已验证')) {
      status = 'pending';
      statusText = '交易中';
    } else if (tx.status === 2) {
      status = 'completed';
      statusText = '已完成';
    } else if (tx.status === 3) {
      status = 'failed';
      statusText = '失败';
    }

    // 格式化交易时间
    const txTime = new Date().toLocaleString();

    // 构建交易标题
    let title = '';
    if (isCoinbase) {
      title = '挖矿奖励 (Coinbase)';
    } else if (type === 'send') {
      const totalInput = tx.inputs.reduce((s, i) => s + (i.output?.value || 0), 0);
      const totalOutput = tx.outputs.reduce((s, o) => s + o.value, 0);
      const fee = (totalInput - totalOutput) / 100000000;
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
      rawData: tx
    };
  });
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
    console.log('提交交易数据:', JSON.stringify(transferData, null, 2));

    const response = await axiosInstance.post(`${API_BASE_URL}/transfer`, transferData);
    console.log('提交交易响应:', response.data);

    if (response.data && response.data.success === true) {
      return {
        success: true,
        result: response.data.result,
        message: response.data.message
      };
    } else {
      return {
        success: false,
        message: response.data?.message || '交易提交失败'
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
      return result.availableUtxos;
    }
  } catch (error) {
    console.error('通过新接口查询可花费UTXO失败，回退到旧接口:', error);
  }
  return getAddressUTXO(address, 2);
}


