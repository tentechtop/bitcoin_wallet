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
  const [pageKeys, setPageKeys] = useState<string[]>(['']); // 存储每一页的lastKey,索引0是第一页('')
  const [isLastPage, setIsLastPage] = useState(false);
  const [totalTransactions, setTotalTransactions] = useState(0);

  useFocusEffect(
    useCallback(() => {
      resetPagination();
      loadTransactions();
    }, [])
  );

  // 重置分页状态
  const resetPagination = () => {
    setCurrentPage(1);
    setPageKeys(['']);
    setIsLastPage(false);
    setTotalTransactions(0);
  };

  // 当页码变化时重新加载
  useEffect(() => {
    if (currentPage > 0) {
      loadTransactions();
    }
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
        setIsLastPage(true);
        return;
      }

      // 提取所有地址
      const addresses = wallet.addresses.map((addr: string | WalletAddress) =>
        typeof addr === 'string' ? addr : addr.address
      );

      // 存储所有交易
      const allTransactions: Transaction[] = [];
      const pendingTxIds = new Set<string>(); // 用于去重，避免交易池和交易历史中重复
      let currentIsLastPage = true;
      let nextLastKey = '';

      // 计算所有钱包地址的scriptPubKey集合
      const allScriptPubKeys = new Set<string>();
      for (const address of addresses) {
        if (typeof address === 'string') {
          allScriptPubKeys.add(calculateScriptPubKey(address));
        }
      }
      console.log('钱包地址的scriptPubKey集合:', allScriptPubKeys);

      // 第一步：查询所有地址的交易池（进行中的交易）
      console.log('===== 开始查询交易池（进行中的交易）=====');
      for (const address of addresses) {
        try {
          if (!address || typeof address !== 'string') {
            console.warn('跳过无效地址:', address);
            continue;
          }

          console.log(`查询地址 ${address} 的交易池...`);

          const txPoolData = await getTxListByAddressInTxPool(address);
          console.log(`地址 ${address} 的交易池查询结果:`, txPoolData);

          if (txPoolData && txPoolData.length > 0) {
            // 使用 formatTransactionList 格式化交易池数据（传入所有地址的scriptPubKey集合）
            const formattedTxs = formatTransactionList(txPoolData, allScriptPubKeys);
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

      // 第二步：查询所有地址的交易历史（已完成的交易）- 使用服务端分页
      console.log('===== 开始查询交易历史（已完成的交易）=====');
      console.log(`当前页: ${currentPage}, 每页数量: ${pageSize}`);

      // 获取当前页的lastKey
      const currentLastKey = pageKeys[currentPage - 1] || '';
      console.log(`使用 lastKey: ${currentLastKey || '(空-第一页)'}`);

      // 查询所有地址的交易历史（并发查询）
      const promises = addresses.map(async (address) => {
        try {
          if (!address || typeof address !== 'string') {
            console.warn('跳过无效地址:', address);
            return { address, transactions: [], lastKey: '', lastPage: true };
          }

          console.log(`查询地址 ${address} 的交易历史...`);

          const result = await getTxListByAddress(address, pageSize, currentLastKey);
          console.log(`地址 ${address} 的交易历史查询结果:`, result);

          // 保存下一页的lastKey（使用第一个地址的lastKey作为下一页的key）
          if (result.lastKey && !nextLastKey) {
            nextLastKey = result.lastKey;
          }

          // 检查是否是最后一页（只要有一个地址不是最后一页，就可以继续分页）
          if (!result.lastPage) {
            currentIsLastPage = false;
          }

          // 格式化交易数据
          let formattedTxs: Transaction[] = [];
          if (result.data && result.data.length > 0) {
            formattedTxs = result.data.map((tx: any, index: number) => {
              try {
                // 跳过已经在交易池中的交易（避免重复）
                if (tx.txId && pendingTxIds.has(tx.txId)) {
                  console.log(`跳过已存在于交易池的交易: ${tx.txId}`);
                  return null;
                }

                // 计算该交易对钱包的净影响（收入 - 支出）
                let totalReceived = 0; // 总收入（聪）
                let totalSent = 0; // 总支出（聪）

                // 计算总收入：输出中包含钱包地址的金额
                if (tx.outputs && Array.isArray(tx.outputs)) {
                  for (const output of tx.outputs) {
                    if (allScriptPubKeys.has(output.scriptPubKey)) {
                      totalReceived += output.value || 0;
                    }
                  }
                }

                // 计算总支出：输入中引用的UTXO属于钱包地址的金额
                if (tx.inputs && Array.isArray(tx.inputs)) {
                  for (const input of tx.inputs) {
                    if (input.output && input.output.scriptPubKey && allScriptPubKeys.has(input.output.scriptPubKey)) {
                      totalSent += input.output.value || 0;
                    }
                  }
                }

                // 净金额 = 收入 - 支出
                const netAmount = totalReceived - totalSent;

                // 判断交易类型
                let isReceive = false;
                let finalAmount = 0;
                let title = '';

                if (netAmount > 0) {
                  // 净收入
                  isReceive = true;
                  finalAmount = netAmount;
                  title = '接收BTC';
                } else if (netAmount < 0) {
                  // 净支出（取绝对值）
                  isReceive = false;
                  finalAmount = Math.abs(netAmount);
                  title = '发送BTC';
                } else {
                  // 内部转账（收入等于支出）
                  isReceive = false;
                  finalAmount = totalSent; // 显示总金额
                  title = '内部转账';
                }

                const type = isReceive ? 'receive' : 'send';
                const icon = isReceive ? 'arrow-down' : 'arrow-up';

                // 处理交易时间
                const txTime = tx.time ? new Date(tx.time).toLocaleString() : new Date().toLocaleString();

                console.log(`交易 ${tx.txId}: 收入=${totalReceived}, 支出=${totalSent}, 净额=${netAmount}, 类型=${type}`);

                return {
                  id: tx.txId || `tx_${Date.now()}_${index}`,
                  txId: tx.txId || '',
                  title,
                  time: txTime,
                  amount: `${isReceive ? '+' : '-'} ${(finalAmount / 100000000).toFixed(8)} BTC`,
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

            console.log(`地址 ${address} 添加了 ${formattedTxs.length} 条历史交易`);
          }

          return { address, transactions: formattedTxs };
        } catch (error: any) {
          console.error(`查询地址 ${address} 的交易历史失败:`, error?.message || error);
          return { address, transactions: [], lastKey: '', lastPage: true };
        }
      });

      // 等待所有查询完成
      const results = await Promise.all(promises);

      // 合并所有地址的交易
      for (const result of results) {
        allTransactions.push(...result.transactions);
      }

      // 更新分页状态
      setIsLastPage(currentIsLastPage);

      // 如果有下一页的lastKey，保存到pageKeys
      if (nextLastKey && !currentIsLastPage) {
        setPageKeys(prev => {
          const newKeys = [...prev];
          // 确保当前页的lastKey已存在
          if (newKeys[currentPage - 1] === undefined) {
            newKeys[currentPage - 1] = currentLastKey;
          }
          // 保存下一页的lastKey
          newKeys[currentPage] = nextLastKey;
          return newKeys;
        });
      }

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
      console.log(`当前是否最后一页: ${currentIsLastPage}`);
      console.log(`下一页lastKey: ${nextLastKey || '(无)'}`);
      setTransactions(allTransactions);
      setHasMore(!currentIsLastPage);
      setTotalTransactions(allTransactions.length);
    } catch (error: any) {
      console.error('加载交易历史失败:', error?.message || error);
      setTransactions([]);
      setIsLastPage(true);
      setHasMore(false);
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

        // 计算所有钱包地址的scriptPubKey集合
        const allScriptPubKeys = new Set<string>();
        for (const address of myAddresses) {
          if (typeof address === 'string') {
            allScriptPubKeys.add(calculateScriptPubKey(address));
          }
        }

        // 计算该交易对钱包的净影响（收入 - 支出）
        let totalReceived = 0;
        let totalSent = 0;

        // 计算总收入
        if (txData.outputs) {
          for (const output of txData.outputs) {
            if (allScriptPubKeys.has(output.scriptPubKey)) {
              totalReceived += output.value || 0;
            }
          }
        }

        // 计算总支出
        if (txData.inputs) {
          for (const input of txData.inputs) {
            if (input.output && input.output.scriptPubKey && allScriptPubKeys.has(input.output.scriptPubKey)) {
              totalSent += input.output.value || 0;
            }
          }
        }

        // 净金额 = 收入 - 支出
        const netAmount = totalReceived - totalSent;

        // 判断交易类型
        let isReceive = false;
        let finalAmount = 0;
        let title = '';

        if (netAmount > 0) {
          isReceive = true;
          finalAmount = netAmount;
          title = '接收BTC';
        } else if (netAmount < 0) {
          isReceive = false;
          finalAmount = Math.abs(netAmount);
          title = '发送BTC';
        } else {
          isReceive = false;
          finalAmount = totalSent;
          title = '内部转账';
        }

        const type = isReceive ? 'receive' : 'send';
        const icon = isReceive ? 'arrow-down' : 'arrow-up';

        const txTime = txData.time ? new Date(txData.time).toLocaleString() : new Date().toLocaleString();

        console.log(`搜索交易 ${txData.txId}: 收入=${totalReceived}, 支出=${totalSent}, 净额=${netAmount}, 类型=${type}`);

        const transaction: Transaction = {
          id: txData.txId || `search_${Date.now()}`,
          txId: txData.txId || '',
          title,
          time: txTime,
          amount: `${isReceive ? '+' : '-'} ${(finalAmount / 100000000).toFixed(8)} BTC`,
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

  // 下一页
  const goToNextPage = () => {
    if (!isLastPage) {
      setCurrentPage(prev => prev + 1);
    }
  };

  // 上一页
  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  // 首页
  const goToFirstPage = () => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  };

  // 末页（跳转到最后一页）
  const goToLastPage = () => {
    if (!isLastPage) {
      // 由于不知道总页数，这里先保持当前页
      // 用户可以点击"下一页"直到最后一页
      console.log('跳转到最后一页');
    }
  };

  // 显示的交易（服务端已分页，直接显示）
  const displayedTransactions = transactions;
  // 总页数（使用currentPage + 是否有下一页来估算）
  const totalPages = isLastPage ? currentPage : currentPage + 1;

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
            {(currentPage > 1 || !isLastPage) && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                  onPress={goToFirstPage}
                  disabled={currentPage === 1}
                >
                  <Text style={[styles.pageButtonText, currentPage === 1 && styles.pageButtonTextDisabled]}>首页</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                  onPress={goToPrevPage}
                  disabled={currentPage === 1}
                >
                  <Ionicons name="chevron-back" size={18} color={currentPage === 1 ? '#cccccc' : '#000000'} />
                </TouchableOpacity>

                <Text style={styles.pageInfo}>
                  {currentPage} {isLastPage ? `(共${currentPage}页)` : '+'}
                </Text>

                <TouchableOpacity
                  style={[styles.pageButton, isLastPage && styles.pageButtonDisabled]}
                  onPress={goToNextPage}
                  disabled={isLastPage}
                >
                  <Ionicons name="chevron-forward" size={18} color={isLastPage ? '#cccccc' : '#000000'} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pageButton, isLastPage && styles.pageButtonDisabled]}
                  onPress={goToLastPage}
                  disabled={isLastPage}
                >
                  <Text style={[styles.pageButtonText, isLastPage && styles.pageButtonTextDisabled]}>末页</Text>
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