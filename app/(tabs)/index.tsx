import { StyleSheet, TouchableOpacity, View, Modal, TextInput, ScrollView, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';
import { statusBarHeight } from '@/constants/theme';
import { multiWalletStorage, WalletAddress } from '@/utils/secureStorage';
import {
  getWalletBalance,
  formatBTCBalance,
  getTxListByAddressInTxPool,
  calculateScriptPubKey,
  formatTransactionList,
  Transaction
} from '@/utils/blockchainApi';

export default function HomeScreen() {
  const router = useRouter();
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const sendSlideAnim = useRef(new Animated.Value(500)).current;
  const receiveSlideAnim = useRef(new Animated.Value(500)).current;
  const sendOverlayAnim = useRef(new Animated.Value(0)).current;
  const receiveOverlayAnim = useRef(new Animated.Value(0)).current;

  const [sendData, setSendData] = useState({
    coinIndex: 0,
    accountIndex: '0',
    addressIndex: '0',
    toAddress: '',
    amount: '',
    fee: '',
    amountUnitIndex: 0,
    feeUnitIndex: 0,
    senderAddress: '',
    senderBalance: '0.00 BTC',
  });

  const [receiveData, setReceiveData] = useState({
    coinIndex: 0,
    addressIndex: '0',
    derivedPath: '',
    derivedAddress: '',
    addressList: [] as (string | WalletAddress)[], // 地址列表
  });

  const coinList = [
    { id: 'btc', name: 'Bitcoin', unit: ['BTC', 'Satoshi'] },
    { id: 'eth', name: 'Ethereum', unit: ['ETH', 'Wei'] }
  ];

  const getCoinUnitList = (coinIndex: number) => {
    return coinList[coinIndex]?.unit || ['BTC', 'Satoshi'];
  };

  // 加载钱包余额
  const loadWalletBalance = async () => {
    try {
      setLoadingBalance(true);
      const walletId = await multiWalletStorage.getActiveWalletId();
      if (!walletId) {
        console.log('未找到激活的钱包');
        return;
      }
      const wallet = await multiWalletStorage.getWalletById(walletId);

      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        console.log('钱包没有地址');
        setTotalBalance(0);
        return;
      }

      // 查询钱包余额
      const balanceInfo = await getWalletBalance(wallet.addresses, 2);
      setTotalBalance(balanceInfo.totalBalanceBTC);

      // 更新钱包中的余额字段
      await multiWalletStorage.updateWalletBalance(walletId, balanceInfo.totalBalanceBTC);
    } catch (error) {
      console.error('加载钱包余额失败:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    loadWalletBalance();
    loadTransactions();
  }, []);

  // 加载交易记录
  const loadTransactions = async () => {
    try {
      setLoadingTransactions(true);

      // 获取第一个地址来查询交易
      const wallet = await multiWalletStorage.getActiveWallet();
      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        console.log('钱包没有地址,无法查询交易');
        setTransactions([]);
        return;
      }

      // 使用第一个地址
      const firstAddress = wallet.addresses[0];
      const addressStr = typeof firstAddress === 'string' ? firstAddress : firstAddress.address;

      // 计算 scriptPubKey
      const myScriptPubKey = await calculateScriptPubKey(addressStr);
      console.log('查询交易池 - 地址:', myScriptPubKey);

      // 查询交易池
      const txPoolData = await getTxListByAddressInTxPool(addressStr);
      console.log('交易池查询结果:', txPoolData);

      if (txPoolData && txPoolData.length > 0) {
        // 格式化交易数据
        const formattedTxs = formatTransactionList(txPoolData, myScriptPubKey);
        setTransactions(formattedTxs.slice(0, 10)); // 只显示最近10条
      } else {
        setTransactions([
          {
            id: 'empty',
            txId: '',
            title: '暂无交易记录',
            time: '',
            amount: '',
            type: 'empty',
            icon: 'document-text-outline',
            status: 'empty',
            statusText: ''
          }
        ]);
      }
    } catch (error) {
      console.error('加载交易记录失败:', error);
      setTransactions([
        {
          id: 'empty',
          txId: '',
          title: '暂无交易记录',
          time: '',
          amount: '',
          type: 'empty',
          icon: 'document-text-outline',
          status: 'empty',
          statusText: ''
        }
      ]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleSendPress = () => {
    setShowSendModal(true);
    Animated.parallel([
      Animated.timing(sendOverlayAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(sendSlideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleReceivePress = async () => {
    // 加载钱包地址
    try {
      const walletId = await multiWalletStorage.getActiveWalletId();
      if (!walletId) {
        Alert.alert('提示', '请先创建或选择钱包');
        return;
      }
      const wallet = await multiWalletStorage.getWalletById(walletId);

      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        Alert.alert('提示', '钱包中没有地址，请先生成地址');
        return;
      }

      // 设置默认接收地址（第一个地址）
      const firstAddress = wallet.addresses[0];
      const addressStr = typeof firstAddress === 'string' ? firstAddress : firstAddress.address;
      const pathStr = typeof firstAddress === 'string' ? '' : firstAddress.path;

      setReceiveData(prev => ({
        ...prev,
        addressList: wallet.addresses,
        addressIndex: '0',
        derivedPath: pathStr,
        derivedAddress: addressStr,
      }));

      setShowReceiveModal(true);
      Animated.parallel([
        Animated.timing(receiveOverlayAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(receiveSlideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (error) {
      console.error('加载钱包地址失败:', error);
      Alert.alert('错误', '加载钱包地址失败');
    }
  };

  const closeSendModal = () => {
    Animated.parallel([
      Animated.timing(sendOverlayAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(sendSlideAnim, {
        toValue: 500,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowSendModal(false);
    });
    setSendData({
      coinIndex: 0,
      accountIndex: '0',
      addressIndex: '0',
      toAddress: '',
      amount: '',
      fee: '',
      amountUnitIndex: 0,
      feeUnitIndex: 0,
      senderAddress: '',
      senderBalance: '0.00 BTC',
    });
  };

  const closeReceiveModal = () => {
    Animated.parallel([
      Animated.timing(receiveOverlayAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(receiveSlideAnim, {
        toValue: 500,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowReceiveModal(false);
    });
    setReceiveData({
      coinIndex: 0,
      addressIndex: '0',
      derivedPath: '',
      derivedAddress: '',
      addressList: [],
    });
  };

  const handleConfirmSend = () => {
    // TODO: 实现发送逻辑
    Alert.alert('发送功能', '发送功能开发中');
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await Clipboard.setStringAsync(address);
    } catch (error) {
      console.error('复制失败:', error);
      Alert.alert('错误', '复制失败');
    }
  };

  const handleTransactionPress = (tx: Transaction) => {
    if (tx.id === 'empty') {
      return;
    }
    // 将交易数据编码后传递
    const txDataEncoded = encodeURIComponent(JSON.stringify(tx));
    router.push(`/tx-detail?txData=${txDataEncoded}`);
  };

  return (
    <View style={styles.container}>
      {/* 头部导航栏 */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logo}>
            <Ionicons name="wallet" size={20} color="#000000" />
            <ThemedText style={styles.logoText}>Bitcoin WALLET</ThemedText>
          </View>
        </View>
      </View>

      <ParallaxScrollView>
      {/* 资产概览 */}
      <ThemedView style={styles.assetsOverview}>
        <ThemedText style={styles.sectionLabel}>总资产</ThemedText>
        <ThemedText type="title" style={styles.totalBalance}>
          {loadingBalance ? '加载中...' : `${formatBTCBalance(totalBalance)} BTC`}
        </ThemedText>
        {!loadingBalance && (
          <TouchableOpacity onPress={loadWalletBalance} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color="#666666" />
          </TouchableOpacity>
        )}
      </ThemedView>

      {/* 快速操作 */}
      <ThemedView style={styles.quickActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleSendPress}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="arrow-up" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>转账</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleReceivePress}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="arrow-down" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>收款</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="swap-horizontal" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>兑换</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="grid" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>更多</ThemedText>
        </TouchableOpacity>
      </ThemedView>


      {/* 最近交易 */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedView style={styles.sectionHeader}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>交易记录</ThemedText>
          <TouchableOpacity onPress={loadTransactions}>
            <Ionicons name="refresh" size={16} color="#666666" />
          </TouchableOpacity>
        </ThemedView>

        {loadingTransactions ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>加载中...</ThemedText>
          </ThemedView>
        ) : transactions.length === 0 || transactions[0].id === 'empty' ? (
          <ThemedView style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#888888" />
            <ThemedText style={styles.emptyText}>暂无交易记录</ThemedText>
            <ThemedText style={styles.emptySubtext}>开始使用钱包，记录您的第一笔交易</ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.transactionList}>
            {transactions.map((tx) => {
              const iconStyleKey = `transactionIcon${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}`;
              const statusStyleKey = `transaction${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}`;
              const iconStyle = (styles as any)[iconStyleKey];
              const statusStyle = (styles as any)[statusStyleKey];
              return (
                <TouchableOpacity
                  key={tx.id}
                  style={styles.transactionItem}
                  onPress={() => handleTransactionPress(tx)}
                  disabled={tx.id === 'empty'}
                >
                  <View style={styles.transactionLeft}>
                    <View style={[styles.transactionIcon, iconStyle]}>
                      <Ionicons
                        name={tx.icon === 'arrow-up' ? 'arrow-up' : 'arrow-down' as any}
                        size={16}
                        color="#ffffff"
                      />
                    </View>
                    <View style={styles.transactionDetails}>
                      <ThemedText style={styles.transactionTitle}>{tx.title}</ThemedText>
                      <ThemedText style={styles.transactionTime}>{tx.time}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.transactionRight}>
                    <ThemedText style={[styles.transactionAmount, statusStyle]}>
                      {tx.amount}
                    </ThemedText>
                    <ThemedText style={[styles.transactionStatus, statusStyle]}>
                      {tx.statusText}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ThemedView>

      {/* 常用功能 */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>常用功能</ThemedText>
        <ThemedView style={styles.featuresGrid}>
          <Link href="/wallet-management" asChild>
            <TouchableOpacity style={styles.featureItem}>
              <Ionicons name="wallet-outline" size={24} color="#333333" />
              <ThemedText style={styles.featureText}>钱包管理</ThemedText>
            </TouchableOpacity>
          </Link>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="scan-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>扫一扫</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>安全设置</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="help-circle-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>帮助中心</ThemedText>
          </TouchableOpacity>
          <Link href="/transactions" asChild>
            <TouchableOpacity style={styles.featureItem}>
              <Ionicons name="receipt-outline" size={24} color="#333333" />
              <ThemedText style={styles.featureText}>交易历史</ThemedText>
            </TouchableOpacity>
          </Link>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="settings-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>系统设置</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>

      {/* 发送弹窗 */}
      <Modal
        visible={showSendModal}
        animationType="none"
        transparent={true}
        onRequestClose={closeSendModal}
      >
        <Animated.View style={[
          styles.modalOverlay,
          { opacity: sendOverlayAnim }
        ]}>
          <Animated.View style={[
            styles.modalContainer,
            { transform: [{ translateY: sendSlideAnim }] }
          ]}>
            {/* 弹窗头部 */}
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>发送</ThemedText>
              <TouchableOpacity onPress={closeSendModal} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* 弹窗内容 */}
            <ScrollView style={styles.modalContent}>
              {/* 币种选择 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>币种</ThemedText>
                <View style={styles.formPicker}>
                  <ThemedText style={styles.pickerText}>{coinList[sendData.coinIndex].name}</ThemedText>
                  <Ionicons name="chevron-forward" size={14} color="#999999" />
                </View>
              </View>

              {/* 账户索引 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>账户索引</ThemedText>
                <TextInput
                  style={styles.formInput}
                  value={sendData.accountIndex}
                  onChangeText={(text) => setSendData({ ...sendData, accountIndex: text })}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </View>

              {/* 地址索引(仅比特币显示) */}
              {coinList[sendData.coinIndex].id === 'btc' && (
                <View style={styles.formItem}>
                  <ThemedText style={styles.formLabel}>地址索引</ThemedText>
                  <TextInput
                    style={styles.formInput}
                    value={sendData.addressIndex}
                    onChangeText={(text) => setSendData({ ...sendData, addressIndex: text })}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              )}

              {/* 发送方地址 */}
              {sendData.senderAddress ? (
                <View style={styles.formItem}>
                  <ThemedText style={styles.formLabel}>发送方地址</ThemedText>
                  <ThemedText style={styles.resultValueSmall}>{sendData.senderAddress}</ThemedText>
                </View>
              ) : null}

              {/* 接收地址 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>接收地址</ThemedText>
                <TextInput
                  style={styles.formInput}
                  value={sendData.toAddress}
                  onChangeText={(text) => setSendData({ ...sendData, toAddress: text })}
                  placeholder="请输入接收地址"
                />
              </View>

              {/* 发送金额 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>发送金额</ThemedText>
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={styles.formInputFlex}
                    value={sendData.amount}
                    onChangeText={(text) => setSendData({ ...sendData, amount: text })}
                    placeholder="请输入发送金额"
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.unitPicker}>
                    <ThemedText style={styles.unitText}>
                      {getCoinUnitList(sendData.coinIndex)[sendData.amountUnitIndex]}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={12} color="#999999" />
                  </View>
                </View>
                <ThemedText style={styles.formHint}>
                  可用余额: {sendData.senderBalance}
                </ThemedText>
              </View>

              {/* 手续费 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>手续费</ThemedText>
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={styles.formInputFlex}
                    value={sendData.fee}
                    onChangeText={(text) => setSendData({ ...sendData, fee: text })}
                    placeholder="留空使用默认手续费"
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.unitPicker}>
                    <ThemedText style={styles.unitText}>
                      {getCoinUnitList(sendData.coinIndex)[sendData.feeUnitIndex]}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={12} color="#999999" />
                  </View>
                </View>
                <ThemedText style={styles.formHint}>
                  留空使用默认: 0.0001 {getCoinUnitList(sendData.coinIndex)[0]}
                </ThemedText>
              </View>

              {/* 发送按钮 */}
              <View style={styles.btnGroup}>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleConfirmSend}>
                  <ThemedText style={styles.btnText}>确认发送</ThemedText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* 接收弹窗 */}
      <Modal
        visible={showReceiveModal}
        animationType="none"
        transparent={true}
        onRequestClose={closeReceiveModal}
      >
        <Animated.View style={[
          styles.modalOverlay,
          { opacity: receiveOverlayAnim }
        ]}>
          <Animated.View style={[
            styles.modalContainer,
            { transform: [{ translateY: receiveSlideAnim }] }
          ]}>
            {/* 弹窗头部 */}
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>接收地址</ThemedText>
              <TouchableOpacity onPress={closeReceiveModal} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* 弹窗内容 */}
            <ScrollView style={styles.modalContent}>
              {/* 币种选择 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>币种</ThemedText>
                <View style={styles.formPicker}>
                  <ThemedText style={styles.pickerText}>{coinList[receiveData.coinIndex].name}</ThemedText>
                  <Ionicons name="chevron-forward" size={14} color="#999999" />
                </View>
              </View>

              {/* 地址选择(仅比特币显示) */}
              {coinList[receiveData.coinIndex].id === 'btc' && receiveData.addressList.length > 0 && (
                <View style={styles.formItem}>
                  <ThemedText style={styles.formLabel}>接收地址</ThemedText>
                  <ScrollView style={styles.addressList} nestedScrollEnabled>
                    {receiveData.addressList.map((addr, index) => {
                      const addressStr = typeof addr === 'string' ? addr : addr.address;
                      const isSelected = index === parseInt(receiveData.addressIndex);
                      return (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.addressItem,
                            isSelected && styles.addressItemSelected
                          ]}
                          onPress={() => {
                            const pathStr = typeof addr === 'string' ? '' : addr.path;
                            setReceiveData({
                              ...receiveData,
                              addressIndex: index.toString(),
                              derivedPath: pathStr,
                              derivedAddress: addressStr,
                            });
                          }}
                        >
                          <View style={styles.addressItemContent}>
                            <ThemedText style={styles.addressIndex}>地址 {index + 1}</ThemedText>
                            <ThemedText style={styles.addressText}>{addressStr}</ThemedText>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color="#000000" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* 派生路径显示 */}
              {receiveData.derivedPath ? (
                <View style={styles.derivationPath}>
                  <ThemedText style={styles.pathLabel}>派生路径:</ThemedText>
                  <ThemedText style={styles.pathValue}>{receiveData.derivedPath}</ThemedText>
                </View>
              ) : null}

              {/* 生成结果 */}
              {receiveData.derivedAddress && (
                <View style={styles.resultSection}>
                  {/* 地址显示和复制 */}
                  <View style={styles.resultItem}>
                    <ThemedText style={styles.resultLabel}>接收地址</ThemedText>
                    <View style={styles.addressDisplayContainer}>
                      <ThemedText style={styles.resultValue} numberOfLines={2}>{receiveData.derivedAddress}</ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={() => handleCopyAddress(receiveData.derivedAddress)}
                    >
                      <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
                      <ThemedText style={styles.copyButtonText}>复制地址</ThemedText>
                    </TouchableOpacity>
                  </View>

                  {/* 二维码显示 */}
                  <View style={styles.qrCodeContainer}>
                    <QRCode
                      value={receiveData.derivedAddress}
                      size={200}
                    />
                  </View>
                </View>
              )}

              {/* 底部关闭按钮 */}
              <View style={styles.btnGroup}>
                <TouchableOpacity style={styles.btnSecondary} onPress={closeReceiveModal}>
                  <ThemedText style={styles.btnText}>关闭</ThemedText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>

    </ParallaxScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    zIndex: 100,
    paddingTop: statusBarHeight,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 6,
  },
  assetsOverview: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 30,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionLabel: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 8,
  },
  totalBalance: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  refreshBtn: {
    position: 'absolute',
    right: 10,
    top: 8,
    padding: 8,
  },
  fiatAmount: {
    fontSize: 16,
    color: '#555555',
  },
  balanceChange: {
    marginTop: 8,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  sectionContainer: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  seeAll: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  assetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  assetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetSymbol: {
    fontSize: 13,
    color: '#555555',
    marginTop: 2,
  },
  assetValue: {
    alignItems: 'flex-end',
    gap: 4,
  },
  fiatValue: {
    fontSize: 13,
    color: '#555555',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
    color: '#000000',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 6,
    color: '#555555',
  },
  transactionList: {
    gap: 12,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionIconSend: {
    backgroundColor: '#ff6b6b',
  },
  transactionIconReceive: {
    backgroundColor: '#51cf66',
  },
  transactionIconEmpty: {
    backgroundColor: '#868e96',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 2,
  },
  transactionTime: {
    fontSize: 12,
    color: '#888888',
  },
  transactionRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionPending: {
    color: '#f59f00',
  },
  transactionCompleted: {
    color: '#51cf66',
  },
  transactionFailed: {
    color: '#ff6b6b',
  },
  transactionEmpty: {
    color: '#868e96',
  },
  transactionStatus: {
    fontSize: 12,
    color: '#888888',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 20,
  },
  featureItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  featureText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
  },
  // 弹窗样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#111111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 4,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  formItem: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#F5F5F5',
  },
  formInputFlex: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#F5F5F5',
  },
  formPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F5F5F5',
  },
  pickerText: {
    fontSize: 14,
    color: '#000000',
  },
  formHint: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F5F5F5',
  },
  unitText: {
    fontSize: 14,
    color: '#000000',
  },
  derivationPath: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  pathLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  pathValue: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'monospace',
  },
  resultSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  resultItem: {
    marginBottom: 16,
    width: '100%',
  },
  qrCodeContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
    marginBottom: 8,
  },
  resultValue: {
    fontSize: 13,
    color: '#000000',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  addressDisplayContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resultValueSmall: {
    fontSize: 12,
    color: '#000000',
    fontFamily: 'monospace',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
  },
  resultValueWithCopy: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  copyBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
  },
  copyText: {
    fontSize: 12,
    color: '#000000',
  },
  addressList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  addressItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  addressItemSelected: {
    backgroundColor: '#E8E8E8',
  },
  addressItemContent: {
    flex: 1,
  },
  addressIndex: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 13,
    color: '#000000',
    fontFamily: 'monospace',
  },
  btnGroup: {
    marginTop: 20,
    gap: 12,
    marginBottom:40
  },
  btnPrimary: {
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
