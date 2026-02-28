import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { statusBarHeight } from '@/constants/theme';
import { Transaction } from '@/utils/blockchainApi';

export default function TxDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [transaction, setTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (params.txId) {
      loadTransactionDetail(params.txId as string);
    } else if (params.txData) {
      try {
        const txData = JSON.parse(decodeURIComponent(params.txData as string));
        setTransaction(txData);
      } catch (error) {
        console.error('解析交易数据失败:', error);
        Alert.alert('错误', '交易数据格式错误');
        router.back();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.txId, params.txData]);

  const loadTransactionDetail = (txId: string) => {
    // TODO: 从存储中加载交易详情
    // 目前简化处理，直接返回
    Alert.alert('提示', '未找到交易记录');
    setTimeout(() => {
      router.back();
    }, 1500);
  };

  const getStatusColor = () => {
    if (!transaction) return '#000000';
    if (transaction.type === 'receive' || transaction.type === 'coinbase') {
      return '#00de5e';
    } else if (transaction.type === 'send') {
      return '#ff3d3d';
    }
    return '#000000';
  };

  const getTxTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      'receive': '接收',
      'send': '发送',
      'coinbase': '挖矿',
    };
    return typeMap[type] || '其他';
  };

  const getStatusText = () => {
    if (!transaction) return '';
    if (transaction.type === 'receive') {
      return '接收成功';
    } else if (transaction.type === 'send') {
      return '发送成功';
    }
    return '交易完成';
  };

  const copyTxId = async () => {
    if (transaction?.txId) {
      try {
        await Clipboard.setStringAsync(transaction.txId);
        Alert.alert('成功', '交易ID已复制');
      } catch (error) {
        Alert.alert('错误', '复制失败');
      }
    }
  };

  const copyAddress = async (address: string, label: string) => {
    try {
      await Clipboard.setStringAsync(address);
      Alert.alert('成功', `${label}已复制`);
    } catch (error) {
      Alert.alert('错误', '复制失败');
    }
  };

  const viewOnBlockchain = () => {
    Alert.alert('提示', '即将打开区块链浏览器');
    // 实际应用中可以打开区块链浏览器链接
  };

  const shareTx = () => {
    Alert.alert('提示', '分享功能开发中');
  };

  if (!transaction) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>交易详情</Text>
            <View style={styles.headerRight} />
          </View>
        </View>

        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 主要内容 */}
      <ScrollView style={styles.mainContent}>
        {/* 交易状态卡片 */}
        <View style={[
          styles.statusCard,
          transaction.type === 'receive' ? styles.statusCardReceive :
          transaction.type === 'send' ? styles.statusCardSend : null
        ]}>
          <View style={styles.statusIcon}>
            <Ionicons
              name={transaction.icon === 'arrow-up' ? 'arrow-up' : 'arrow-down'}
              size={48}
              color={getStatusColor()}
            />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>{getStatusText()}</Text>
            <Text style={[
              styles.amountDisplay,
              transaction.type === 'receive' ? styles.amountDisplayReceive :
              transaction.type === 'send' ? styles.amountDisplaySend : null
            ]}>
              {transaction.amount}
            </Text>
          </View>
        </View>

        {/* 交易详情列表 */}
        <View style={styles.detailSection}>
          <Text style={styles.sectionTitle}>交易信息</Text>
          <View style={styles.detailList}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>交易ID</Text>
              <View style={styles.detailValueWithCopy}>
                <Text style={styles.detailValue}>{transaction.txId}</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={copyTxId}>
                  <Ionicons name="copy" size={14} color="#000000" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>交易时间</Text>
              <Text style={styles.detailValue}>{transaction.time}</Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>交易类型</Text>
              <Text style={styles.detailValue}>{getTxTypeText(transaction.type)}</Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>交易状态</Text>
              <View style={[
                styles.statusBadge,
                transaction.status === 'pending' ? styles.statusBadgePending :
                transaction.status === 'completed' ? styles.statusBadgeCompleted :
                transaction.status === 'failed' ? styles.statusBadgeFailed : null
              ]}>
                <Text>{transaction.statusText}</Text>
              </View>
            </View>

            {transaction.isCoinbase && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>交易说明</Text>
                <Text style={styles.detailValue}>挖矿奖励交易 (Coinbase)</Text>
              </View>
            )}
          </View>
        </View>

        {/* 操作按钮 */}
        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.actionBtn} onPress={viewOnBlockchain}>
            <Text style={styles.actionBtnText}>在区块链上查看</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={shareTx}>
            <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>分享交易</Text>
          </TouchableOpacity>
        </View>
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
  headerRight: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666666',
  },
  mainContent: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statusCardReceive: {
    backgroundColor: 'linear-gradient(135deg, #00C853 0%, #009624 100%)',
  },
  statusCardSend: {
    backgroundColor: 'linear-gradient(135deg, #FF5252 0%, #D32F2F 100%)',
  },
  statusIcon: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 32,
  },
  statusInfo: {
    flex: 1,
    marginLeft: 16,
  },
  statusTitle: {
    fontSize: 16,
    opacity: 0.9,
    marginBottom: 8,
    color: '#ffffff',
  },
  amountDisplay: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  amountDisplayReceive: {
    color: '#ffffff',
  },
  amountDisplaySend: {
    color: '#ffffff',
  },
  detailSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#000000',
  },
  detailList: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  detailValueWithCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  copyBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadgePending: {
    backgroundColor: '#FFF3E0',
    color: '#E65100',
  },
  statusBadgeCompleted: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
  },
  statusBadgeFailed: {
    backgroundColor: '#FFEBEE',
    color: '#C62828',
  },
  actionSection: {
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  actionBtnSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionBtnTextSecondary: {
    color: '#000000',
  },
});