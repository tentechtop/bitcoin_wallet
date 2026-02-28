import { StyleSheet, View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { statusBarHeight } from '@/constants/theme';
import { multiWalletStorage, WalletAddress } from '@/utils/secureStorage';
import { Transaction, getTxListByAddress, calculateScriptPubKey } from '@/utils/blockchainApi';

export default function TransactionsScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'receive' | 'send' | 'pending'>('all');
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [])
  );

  useEffect(() => {
    applyFilters();
  }, [transactions, searchKeyword, activeFilter]);

  const loadTransactions = async () => {
    try {
      setLoading(true);

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

      // 并发查询所有地址的交易历史
      const allTransactions: Transaction[] = [];

      for (const address of addresses) {
        try {
          const txList = await getTxListByAddress(address, 100, '');
          const myScriptPubKey = calculateScriptPubKey(address);

          // 格式化交易数据
          if (txList && txList.length > 0) {
            const formattedTxs = txList.map((tx: any, index: number) => {
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

              return {
                id: tx.txId || `tx_${Date.now()}_${index}`,
                txId: tx.txId || '',
                title: isReceive ? '接收BTC' : '发送BTC',
                time: tx.time ? new Date(tx.time).toLocaleString() : new Date().toLocaleString(),
                amount: `${isReceive ? '+' : '-'} ${(amount / 100000000).toFixed(8)} BTC`,
                type,
                icon,
                status: 'completed',
                statusText: '已完成',
                rawData: tx,
              };
            });

            allTransactions.push(...formattedTxs);
          }
        } catch (error) {
          console.error(`查询地址 ${address} 的交易失败:`, error);
        }
      }

      // 按时间倒序排列
      allTransactions.sort((a, b) => {
        return new Date(b.time).getTime() - new Date(a.time).getTime();
      });

      setTransactions(allTransactions);
    } catch (error) {
      console.error('加载交易历史失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchKeyword(text);
  };

  const clearSearch = () => {
    setSearchKeyword('');
  };

  const setFilter = (filter: 'all' | 'receive' | 'send' | 'pending') => {
    setActiveFilter(filter);
  };

  const applyFilters = () => {
    let result = [...transactions];

    // 应用搜索过滤
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(tx => {
        return (
          tx.txId.toLowerCase().includes(keyword) ||
          tx.title.toLowerCase().includes(keyword) ||
          tx.amount.toLowerCase().includes(keyword)
        );
      });
    }

    // 应用类型过滤
    if (activeFilter !== 'all') {
      if (activeFilter === 'pending') {
        result = result.filter(tx => tx.status === 'pending');
      } else {
        result = result.filter(tx => tx.type === activeFilter);
      }
    }

    setFilteredTransactions(result);
  };

  const goToTxDetail = (tx: Transaction) => {
    const txDataEncoded = encodeURIComponent(JSON.stringify(tx));
    router.push(`/tx-detail?txData=${txDataEncoded}`);
  };

  const getAmountStyle = () => {
    return 'negative';
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
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>交易历史</Text>
          <TouchableOpacity onPress={loadTransactions} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={20} color="#000000" />
          </TouchableOpacity>
        </View>
      </View>

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

      {/* 筛选标签 */}
      <View style={styles.filterSection}>
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, activeFilter === 'all' && styles.filterTabActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterTabText, activeFilter === 'all' && styles.filterTabTextActive]}>全部</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, activeFilter === 'receive' && styles.filterTabActive]}
            onPress={() => setFilter('receive')}
          >
            <Text style={[styles.filterTabText, activeFilter === 'receive' && styles.filterTabTextActive]}>接收</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, activeFilter === 'send' && styles.filterTabActive]}
            onPress={() => setFilter('send')}
          >
            <Text style={[styles.filterTabText, activeFilter === 'send' && styles.filterTabTextActive]}>发送</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, activeFilter === 'pending' && styles.filterTabActive]}
            onPress={() => setFilter('pending')}
          >
            <Text style={[styles.filterTabText, activeFilter === 'pending' && styles.filterTabTextActive]}>进行中</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 交易列表 */}
      <ScrollView style={styles.mainContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#000000" />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : filteredTransactions.length > 0 ? (
          <View style={styles.transactionList}>
            {filteredTransactions.map((tx) => (
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
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={60} color="#cccccc" />
            <Text style={styles.emptyText}>暂无交易记录</Text>
            <Text style={styles.emptyHint}>开始发送或接收比特币吧</Text>
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
  filterSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    alignItems: 'center',
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 20,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterTabActive: {
    backgroundColor: '#000000',
  },
  filterTabText: {
    fontSize: 14,
    color: '#666666',
  },
  filterTabTextActive: {
    color: '#ffffff',
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
    padding: 16,
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
});