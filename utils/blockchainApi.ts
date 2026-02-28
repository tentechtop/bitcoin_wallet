import axios from 'axios';
import bs58 from 'bs58';
import CryptoJS from 'crypto-js';

// API 基础配置
// 注意：在真机上需要使用公网IP，不能使用 localhost 或局域网IP
const API_BASE_URL = 'http://101.35.87.31:18333/bitcoin/chain';

// 配置 axios 超时时间
const axiosInstance = axios.create({
  timeout: 30000, // 30秒超时
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
  totalBalance: number; // 总余额（聪）
  totalBalanceBTC: number; // 总余额（BTC）
  utxoCount: number; // UTXO 数量
  addresses: {
    address: string;
    balance: number;
    utxoCount: number;
    utxos: UTXO[];
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
    // 验证地址格式
    if (!address || typeof address !== 'string') {
      console.error('无效的地址格式:', address);
      return [];
    }

    console.log('查询地址 UTXO:', address);
    const url = `${API_BASE_URL}/getAddressAllUTXO?address=${encodeURIComponent(address)}&status=${status}`;
    console.log('请求 URL:', url);

    const response = await axiosInstance.get(url);
    console.log('响应数据:', response.data);

    if (response.data && response.data.code === 200 && response.data.success === true) {
      return response.data.result || [];
    } else {
      console.error('查询 UTXO 失败:', response.data?.message || '未知错误');
      return [];
    }
  } catch (error: any) {
    console.error(`查询地址 ${address} 的 UTXO 失败:`, error);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('请求已发送但没有收到响应，可能是网络问题:', error.message);
    } else {
      console.error('请求配置错误:', error.message);
    }
    return [];
  }
}

/**
 * 统计单个地址的余额
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
 * 统计钱包的总余额（遍历所有地址）
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
  let totalUTXOCount = 0;
  let totalConfirmedBalance = 0;
  let totalUnconfirmedBalance = 0;
  let totalImmatureBalance = 0;

  // 提取有效的地址字符串
  const validAddresses = addresses
    .map(addr => typeof addr === 'string' ? addr : (addr as any).address)
    .filter(addr => addr && typeof addr === 'string');

  // 并发查询所有地址的 UTXO
  const promises = validAddresses.map(async (address, index) => {
    const result = await getAddressBalance(address, 0); // status=0 查询所有状态

    // 通知进度
    if (onProgress) {
      onProgress(index + 1, validAddresses.length);
    }

    return {
      address,
      ...result
    };
  });

  try {
    addressBalances.push(...await Promise.all(promises));

    // 统计总余额（已经是 BTC 单位）
    totalBalance = addressBalances.reduce((sum, addr) => sum + addr.balanceBTC, 0);
    totalUTXOCount = addressBalances.reduce((sum, addr) => sum + addr.utxoCount, 0);
    totalConfirmedBalance = addressBalances.reduce((sum, addr) => sum + (addr.confirmedBalance || 0), 0);
    totalUnconfirmedBalance = addressBalances.reduce((sum, addr) => sum + (addr.unconfirmedBalance || 0), 0);
    totalImmatureBalance = addressBalances.reduce((sum, addr) => sum + (addr.immatureBalance || 0), 0);

    return {
      totalBalance, // BTC
      totalBalanceBTC: totalBalance,
      utxoCount: totalUTXOCount,
      addresses: addressBalances.map(item => ({
        address: item.address,
        balance: item.balanceBTC, // BTC 单位
        utxoCount: item.utxoCount,
        utxos: item.utxos
      }))
    };
  } catch (error) {
    console.error('统计钱包余额失败:', error);
    return {
      totalBalance: 0,
      totalBalanceBTC: 0,
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
      console.error('无效的地址格式:', address);
      return [];
    }

    console.log('查询交易池 - 地址:', address);
    const url = `${API_BASE_URL}/getTxListByAddresInTxPool?address=${encodeURIComponent(address)}`;

    const response = await axiosInstance.get(url);
    console.log('交易池响应数据:', response.data);

    if (response.data && response.data.success === true && Array.isArray(response.data.result)) {
      return response.data.result;
    } else {
      console.error('查询交易池失败:', response.data?.message || '未知错误');
      return [];
    }
  } catch (error: any) {
    console.error(`查询地址 ${address} 的交易池失败:`, error);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('请求已发送但没有收到响应:', error.message);
    }
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
): Promise<any[]> {
  try {
    if (!address || typeof address !== 'string') {
      console.error('无效的地址格式:', address);
      return [];
    }

    console.log('查询交易历史 - 地址:', address, 'pageSize:', pageSize, 'lastKey:', lastKey);
    const url = `${API_BASE_URL}/getTxListByAddres?address=${encodeURIComponent(address)}&pageSize=${pageSize}&lastKey=${encodeURIComponent(lastKey)}`;

    const response = await axiosInstance.get(url);
    console.log('交易历史响应数据:', response.data);

    if (response.data && response.data.success === true && response.data.result) {
      // result 可能包含 data 字段，也可能是直接数组
      const resultData = response.data.result.data || response.data.result;
      if (Array.isArray(resultData)) {
        return resultData;
      }
    }
    console.error('查询交易历史失败:', response.data?.message || '未知错误');
    return [];
  } catch (error: any) {
    console.error(`查询地址 ${address} 的交易历史失败:`, error);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('请求已发送但没有收到响应:', error.message);
    }
    return [];
  }
}

/**
 * 计算地址的 scriptPubKey
 * @param base58Address Base58 编码的比特币地址
 */
export function calculateScriptPubKey(base58Address: string): string {
  try {
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
  } catch (error) {
    console.error('计算 scriptPubKey 失败:', error);
    return '';
  }
}

/**
 * 格式化交易列表
 * @param transactions 交易池交易列表
 * @param myScriptPubKey 我的 scriptPubKey
 */
export function formatTransactionList(
  transactions: TxPoolTransaction[],
  myScriptPubKey: string
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
      // 判断普通交易类型
      const isSpender = tx.inputs.some(input =>
        input.output && input.output.scriptPubKey === myScriptPubKey
      );

      const isRecipient = tx.outputs.some(output =>
        output.scriptPubKey === myScriptPubKey
      );

      if (isSpender) {
        // 支出交易
        const totalInput = tx.inputs.reduce((sum, input) => sum + (input.output?.value || 0), 0);
        const myOutput = tx.outputs.find(output => output.scriptPubKey === myScriptPubKey);
        const changeAmount = myOutput ? myOutput.value : 0;
        const actualSpent = totalInput - changeAmount;

        type = 'send';
        icon = 'arrow-up';
        amount = `- ${(actualSpent / 100000000).toFixed(8)} BTC`;
      } else if (isRecipient && !isSpender) {
        // 收入交易
        const receivedAmount = tx.outputs
          .filter(output => output.scriptPubKey === myScriptPubKey)
          .reduce((sum, output) => sum + output.value, 0);

        type = 'receive';
        icon = 'arrow-down';
        amount = `+ ${(receivedAmount / 100000000).toFixed(8)} BTC`;
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
