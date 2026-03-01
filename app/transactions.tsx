import { StyleSheet, View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { statusBarHeight } from '@/constants/theme';
import { multiWalletStorage, WalletAddress } from '@/utils/secureStorage';
import { Transaction, getTxListByAddress, calculateScriptPubKey, getTxListByAddressInTxPool, formatTransactionList } from '@/utils/blockchainApi';
import axios from 'axios';

export default function TransactionsScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<Transaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);
  const [hasMore, setHasMore] = useState(false);
  const [lastKeys, setLastKeys] = useState<Record<string, string>>({}); // 存储每个地址的lastKey

  useFocusEffect(
    useCallback(() => {
      setCurrentPage(1);
      setLastKeys({});
      loadTransactions();
    }, [])
  );

  // 当页码变化时重新加载
  useEffect(() => {
    loadTransactions();
  }, [currentPage]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setSearchResult(null);

      // 获取当前钱包
      const wallet = await multiWalletStorage.getActiveWallet();
      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        console.log('钱包没有地址,无法查询交易');
        setTransactions([]);
        return;
      }

      // 提取所有地址
      const addresses = wallet.addresses.map((addr: string | WalletAddress) =>
        typeof addr === 'string' ? addr : addr.address
      );

      // 存储所有交易
      const allTransactions: Transaction[] = [];
      const pendingTxIds = new Set<string>(); // 用于去重，避免交易池和交易历史中重复
      const newLastKeys: Record<string, string> = { ...lastKeys };
      let allLastPage = true;

      // 第一步：查询所有地址的交易池（进行中的交易）
      console.log('===== 开始查询交易池（进行中的交易）=====');
      for (const address of addresses) {
        try {
          if (!address || typeof address !== 'string') {
            console.warn('跳过无效地址:', address);
            continue;
          }

          const myScriptPubKey = calculateScriptPubKey(address);
          console.log(`查询地址 ${address} 的交易池...`);

          const txPoolData = await getTxListByAddressInTxPool(address);
          console.log(`地址 ${address} 的交易池查询结果:`, txPoolData);

          if (txPoolData && txPoolData.length > 0) {
            // 使用 formatTransactionList 格式化交易池数据
            const formattedTxs = formatTransactionList(txPoolData, myScriptPubKey);
            formattedTxs.forEach(tx => {
              // 记录待确认交易ID，避免重复
              if (tx.txId) {
                pendingTxIds.add(tx.txId);
              }
            });
            allTransactions.push(...formattedTxs);
            console.log(`地址 ${address} 添加了 ${formattedTxs.length} 条待确认交易`);
          }
        } catch (error: any) {
          console.error(`查询地址 ${address} 的交易池失败:`, error?.message || error);
        }
      }

      // 第二步：查询所有地址的交易历史（已完成的交易）- 真正的服务端分页
      console.log('===== 开始查询交易历史（已完成的交易）=====');
      console.log(`当前页: ${currentPage}, 每页数量: ${pageSize}`);

      for (const address of addresses) {
        try {
          if (!address || typeof address !== 'string') {
            console.warn('跳过无效地址:', address);
            continue;
          }

          const myScriptPubKey = calculateScriptPubKey(address);
          console.log(`查询地址 ${address} 的交易历史...`);

          // 使用对应地址的 lastKey
          const currentLastKey = lastKeys[address] || '';
          console.log(`使用 lastKey: ${currentLastKey || '(空)'}`);

          const result = await getTxListByAddress(address, pageSize, currentLastKey);
          console.log(`地址 ${address} 的交易历史查询结果:`, result);

          // 更新 lastKey（如果不是最后一页）
          if (!result.lastPage && result.lastKey) {
            newLastKeys[address] = result.lastKey;
          }

          // 检查是否所有地址都是最后一页
          if (!result.lastPage) {
            allLastPage = false;
          }

          // 格式化交易数据
          if (result.data && result.data.length > 0) {
            const formattedTxs = result.data.map((tx: any, index: number) => {
              try {
                // 跳过已经在交易池中的交易（避免重复）
                if (tx.txId && pendingTxIds.has(tx.txId)) {
                  console.log(`跳过已存在于交易池的交易: ${tx.txId}`);
                  return null;
                }

                // 简化处理，根据交易数据判断类型
                const isReceive = tx.outputs?.some((output: any) =>
                  output.scriptPubKey === myScriptPubKey
                );

                const type = isReceive ? 'receive' : 'send';
                const icon = isReceive ? 'arrow-down' : 'arrow-up';

                // 计算金额
                let amount = 0;
                if (isReceive) {
                  // 计算接收金额
                  amount = tx.outputs
                    ?.filter((output: any) => output.scriptPubKey === myScriptPubKey)
                    ?.reduce((sum: number, output: any) => sum + output.value, 0) || 0;
                } else {
                  // 计算发送金额（总输入 - 找零）
                  const totalInput = tx.inputs?.reduce((sum: number, input: any) =>
                    sum + (input.output?.value || 0), 0) || 0;
                  const changeAmount = tx.outputs
                    ?.filter((output: any) => output.scriptPubKey === myScriptPubKey)
                    ?.reduce((sum: number, output: any) => sum + output.value, 0) || 0;
                  amount = totalInput - changeAmount;
                }

                // 处理交易时间 - API 返回的数据中没有 time 字段，使用当前时间
                const txTime = tx.time ? new Date(tx.time).toLocaleString() : new Date().toLocaleString();

                return {
                  id: tx.txId || `tx_${Date.now()}_${index}`,
                  txId: tx.txId || '',
                  title: isReceive ? '接收BTC' : '发送BTC',
                  time: txTime,
                  amount: `${isReceive ? '+' : '-'} ${(amount / 100000000).toFixed(8)} BTC`,
                  type,
                  icon,
                  status: 'completed',
                  statusText: '已完成',
                  rawData: tx,
                } as Transaction;
              } catch (formatError) {
                console.error('格式化交易失败:', formatError);
                return null;
              }
            }).filter((tx): tx is Transaction => tx !== null);

            allTransactions.push(...formattedTxs);
            console.log(`地址 ${address} 添加了 ${formattedTxs.length} 条历史交易`);
          }
        } catch (error: any) {
          console.error(`查询地址 ${address} 的交易历史失败:`, error?.message || error);
        }
      }

      // 更新 lastKeys 状态
      setLastKeys(newLastKeys);

      // 按时间倒序排列（进行中的交易排在前面）
      allTransactions.sort((a, b) => {
        // 先按状态排序：pending 排前面，completed 排后面
        if (a.status === 'pending' && b.status === 'completed') {
          return -1;
        } else if (a.status === 'completed' && b.status === 'pending') {
          return 1;
        }
        // 相同状态按时间排序
        return new Date(b.time).getTime() - new Date(a.time).getTime();
      });

      console.log(`===== 加载完成，共 ${allTransactions.length} 条交易 =====`);
      setTransactions(allTransactions);
      setHasMore(!allLastPage);
    } catch (error: any) {
      console.error('加载交易历史失败:', error?.message || error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  // 通过交易ID搜索交易
  const searchByTxId = async (txId: string) => {
    if (!txId || txId.trim() === '') {
      setSearchResult(null);
      return;
    }

    try {
      setLoading(true);
      const url = `http://101.35.87.31:3000/transaction/${txId.trim()}`;
      console.log('搜索交易:', url);

      const response = await axios.get(url, {
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      console.log('搜索结果:', response.data);

      if (response.data && response.data.success === true && response.data.result) {
        const txData = response.data.result;

        // 获取当前钱包地址用于判断交易类型
        const wallet = await multiWalletStorage.getActiveWallet();
        const myAddresses = wallet?.addresses?.map((addr: string | WalletAddress) =>
          typeof addr === 'string' ? addr : addr.address
        ) || [];

        // 计算交易类型
        let isReceive = false;
        let myScriptPubKey = '';
        let matchedAddress = '';

        for (const address of myAddresses) {
          if (typeof address === 'string') {
            myScriptPubKey = calculateScriptPubKey(address);
            if (txData.outputs?.some((output: any) => output.scriptPubKey === myScriptPubKey)) {
              isReceive = true;
              matchedAddress = address;
              break;
            }
          }
        }

        const type = isReceive ? 'receive' : 'send';
        const icon = isReceive ? 'arrow-down' : 'arrow-up';

        // 计算金额
        let amount = 0;
        if (isReceive) {
          amount = txData.outputs
            ?.filter((output: any) => output.scriptPubKey === myScriptPubKey)
            ?.reduce((sum: number, output: any) => sum + output.value, 0) || 0;
        } else {
          const totalInput = txData.inputs?.reduce((sum: number, input: any) =>
            sum + (input.output?.value || 0), 0) || 0;
          const changeAmount = txData.outputs
            ?.filter((output: any) => output.scriptPubKey === myScriptPubKey)
            ?.reduce((sum: number, output: any) => sum + output.value, 0) || 0;
          amount = totalInput - changeAmount;
        }

        const txTime = txData.time ? new Date(txData.time).toLocaleString() : new Date().toLocaleString();

        const transaction: Transaction = {
          id: txData.txId || `search_${Date.now()}`,
          txId: txData.txId || '',
          title: isReceive ? '接收BTC' : '发送BTC',
          time: txTime,
          amount: `${isReceive ? '+' : '-'} ${(amount / 100000000).toFixed(8)} BTC`,
          type,
          icon,
          status: 'completed',
          statusText: '已完成',
          rawData: txData,
        };

        setSearchResult(transaction);
      } else {
        console.log('未找到交易');
        setSearchResult(null);
        alert('未找到该交易ID');
      }
    } catch (error: any) {
      console.error('搜索交易失败:', error?.message || error);
      setSearchResult(null);
      alert('搜索失败: ' + (error?.response?.data?.message || error?.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchKeyword(text);
    if (text.trim() !== '') {
      searchByTxId(text);
    } else {
      setSearchResult(null);
    }
  };

  const clearSearch = () => {
    setSearchKeyword('');
    setSearchResult(null);
  };

  // 分页计算
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const displayedTransactions = transactions.slice(startIndex, endIndex);
  const totalPages = Math.ceil(transactions.length / pageSize);

  const goToTxDetail = (tx: Transaction) => {
    const txDataEncoded = encodeURIComponent(JSON.stringify(tx));
    router.push(`/tx-detail?txData=${txDataEncoded}`);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'completed':
        return styles.statusCompleted;
      case 'pending':
        return styles.statusPending;
      case 'failed':
        return styles.statusFailed;
      default:
        return {};
    }
  };

  return (
    <View style={styles.container}>
      {/* 头部导航 */}


      {/* 搜索框 */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#999999" />
          <TextInput
            style={styles.searchInput}
            value={searchKeyword}
            onChangeText={handleSearch}
            placeholder="搜索交易ID或地址"
            placeholderTextColor="#999999"
          />
          {searchKeyword ? (
            <TouchableOpacity style={styles.clearBtn} onPress={clearSearch}>
              <Ionicons name="close-circle" size={14} color="#999999" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* 交易列表 */}
      <ScrollView style={styles.mainContent} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#000000" />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : searchResult ? (
          // 显示搜索结果
          <View style={styles.transactionList}>
            <TouchableOpacity
              key={searchResult.id}
              style={styles.transactionItem}
              onPress={() => goToTxDetail(searchResult)}
            >
              <View style={styles.transactionLeft}>
                <View style={[
                  styles.transactionIcon,
                  searchResult.type === 'receive' ? styles.transactionIconReceive :
                  searchResult.type === 'send' ? styles.transactionIconSend : {}
                ]}>
                  <Ionicons
                    name={searchResult.icon === 'arrow-up' ? 'arrow-up' : 'arrow-down'}
                    size={16}
                    color="#ffffff"
                  />
                </View>
                <View style={styles.transactionDetails}>
                  <Text style={styles.transactionTitle}>{searchResult.title}</Text>
                  <Text style={styles.transactionTime}>{searchResult.time}</Text>
                </View>
              </View>
              <View style={styles.transactionRight}>
                <Text style={[
                  styles.amount,
                  searchResult.type === 'receive' ? styles.amountPositive : styles.amountNegative
                ]}>
                  {searchResult.amount}
                </Text>
                <View style={[styles.status, getStatusStyle(searchResult.status)]}>
                  <Text style={styles.statusText}>{searchResult.statusText}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        ) : transactions.length > 0 ? (
          // 显示全部交易（分页）
          <>
            <View style={styles.transactionList}>
              {displayedTransactions.map((tx) => (
              <TouchableOpacity
                key={tx.id}
                style={styles.transactionItem}
                onPress={() => goToTxDetail(tx)}
              >
                <View style={styles.transactionLeft}>
                  <View style={[
                    styles.transactionIcon,
                    tx.type === 'receive' ? styles.transactionIconReceive :
                    tx.type === 'send' ? styles.transactionIconSend : {}
                  ]}>
                    <Ionicons
                      name={tx.icon === 'arrow-up' ? 'arrow-up' : 'arrow-down'}
                      size={16}
                      color="#ffffff"
                    />
                  </View>
                  <View style={styles.transactionDetails}>
                    <Text style={styles.transactionTitle}>{tx.title}</Text>
                    <Text style={styles.transactionTime}>{tx.time}</Text>
                  </View>
                </View>
                <View style={styles.transactionRight}>
                  <Text style={[
                    styles.amount,
                    tx.type === 'receive' ? styles.amountPositive : styles.amountNegative
                  ]}>
                    {tx.amount}
                  </Text>
                  <View style={[styles.status, getStatusStyle(tx.status)]}>
                    <Text style={styles.statusText}>{tx.statusText}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            </View>

            {/* 分页控件 */}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                  onPress={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <Text style={[styles.pageButtonText, currentPage === 1 && styles.pageButtonTextDisabled]}>首页</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                  onPress={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <Ionicons name="chevron-back" size={18} color={currentPage === 1 ? '#cccccc' : '#000000'} />
                </TouchableOpacity>

                <Text style={styles.pageInfo}>
                  {currentPage} / {totalPages}
                </Text>

                <TouchableOpacity
                  style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                  onPress={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <Ionicons name="chevron-forward" size={18} color={currentPage === totalPages ? '#cccccc' : '#000000'} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                  onPress={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <Text style={[styles.pageButtonText, currentPage === totalPages && styles.pageButtonTextDisabled]}>末页</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={60} color="#cccccc" />
            <Text style={styles.emptyText}>{searchKeyword ? '未找到该交易' : '暂无交易记录'}</Text>
            <Text style={styles.emptyHint}>{searchKeyword ? '请检查交易ID是否正确' : '开始发送或接收比特币吧'}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    paddingTop: statusBarHeight,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    position: 'relative',
  },
  backBtn: {
    position: 'absolute',
    left: 6,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  refreshBtn: {
    position: 'absolute',
    right: 6,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
  },
  searchSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    height: 40,
    marginHorizontal: 8,
    fontSize: 14,
    color: '#000000',
  },
  clearBtn: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  transactionList: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#000000',
  },
  transactionIconReceive: {
    backgroundColor: '#00C853',
  },
  transactionIconSend: {
    backgroundColor: '#FF5252',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionTitle: {
    fontWeight: '500',
    fontSize: 14,
    marginBottom: 4,
    color: '#000000',
  },
  transactionTime: {
    color: '#999999',
    fontSize: 12,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  amount: {
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 4,
  },
  amountPositive: {
    color: '#00C853',
  },
  amountNegative: {
    color: '#FF5252',
  },
  status: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusCompleted: {
    backgroundColor: '#E8F5E9',
  },
  statusPending: {
    backgroundColor: '#FFF3E0',
  },
  statusFailed: {
    backgroundColor: '#FFEBEE',
  },
  statusText: {
    fontSize: 11,
    color: '#666666',
  },
  emptyState: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
    marginTop: 20,
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 13,
    color: '#999999',
    marginTop: 8,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    gap: 8,
  },
  pageButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    minWidth: 40,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '500',
  },
  pageButtonTextDisabled: {
    color: '#999999',
  },
  pageInfo: {
    fontSize: 14,
    color: '#666666',
    marginHorizontal: 8,
    minWidth: 60,
    textAlign: 'center',
  },
});