import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import type { RelativePathString } from 'expo-router';

import { Palette, statusBarHeight } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { multiWalletStorage, Wallet } from '@/utils/secureStorage';
import { formatBTCBalance, getWalletBalance } from '@/utils/blockchainApi';

export default function MyScreen() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState(0);
  const [addressCount, setAddressCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadWalletInfo = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const activeId = await multiWalletStorage.getActiveWalletId();
      const activeWallet = activeId ? await multiWalletStorage.getWalletById(activeId) : null;
      setWallet(activeWallet);
      setAddressCount(activeWallet?.addresses.length || 0);

      if (activeWallet && activeWallet.addresses.length > 0) {
        const result = await getWalletBalance(activeWallet.addresses, 2);
        setBalance(result.totalBalanceBTC);
        await multiWalletStorage.updateWalletBalance(activeWallet.id, result.totalBalanceBTC);
      } else {
        setBalance(activeWallet?.balance || 0);
      }
    } catch (error) {
      console.error('加载钱包信息失败:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadWalletInfo();
  }, [loadWalletInfo]));

  const openAddressList = () => {
    if (wallet) router.push({ pathname: '/address-list', params: { walletId: wallet.id } });
    else Alert.alert('提示', '请先创建或选择钱包');
  };

  const openBackup = () => {
    if (wallet) router.push({ pathname: '/backup-wallet' as RelativePathString, params: { walletId: wallet.id } });
    else Alert.alert('提示', '请先创建或选择钱包');
  };

  const handleSecurity = () => {
    if (wallet) router.push({ pathname: '/security-settings' as RelativePathString, params: { walletId: wallet.id } });
    else Alert.alert('提示', '请先创建或选择钱包');
  };

  const handleNetwork = () => {
    router.push('/network-settings' as RelativePathString);
  };

  const handleAbout = () => {
    Alert.alert('关于 Bitcoin Wallet', '本地非托管钱包\n助记词和签名密钥保存在设备本地。');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.overline}>ACCOUNT</ThemedText>
            <ThemedText style={styles.title}>我的钱包</ThemedText>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => loadWalletInfo(true)}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="刷新钱包信息"
          >
            {refreshing ? <ActivityIndicator size="small" color={Palette.accentDark} /> : <Ionicons name="refresh-outline" size={20} color={Palette.ink} />}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingCard}><ActivityIndicator color={Palette.accent} /></View>
        ) : wallet ? (
          <View style={styles.walletCard}>
            <View style={styles.walletCardTop}>
              <View style={styles.walletMark}><Ionicons name="logo-bitcoin" size={24} color="#FFFFFF" /></View>
              <View style={styles.walletIdentity}>
                <ThemedText style={styles.walletName}>{wallet.name}</ThemedText>
                <ThemedText style={styles.walletId}>本地非托管钱包 · {addressCount} 个地址</ThemedText>
              </View>
              <View style={styles.activeBadge}><ThemedText style={styles.activeBadgeText}>已激活</ThemedText></View>
            </View>
            <ThemedText style={styles.walletBalance}>{formatBTCBalance(balance)} BTC</ThemedText>
            <ThemedText style={styles.walletCaption}>当前钱包总余额</ThemedText>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Ionicons name="wallet-outline" size={28} color={Palette.accentDark} /></View>
            <ThemedText style={styles.emptyTitle}>还没有钱包</ThemedText>
            <ThemedText style={styles.emptyText}>创建或导入钱包后开始管理 BTC</ThemedText>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/create-wallet')}>
              <ThemedText style={styles.primaryButtonText}>创建钱包</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/wallet-management')}>
            <View style={styles.actionIcon}><Ionicons name="wallet-outline" size={20} color={Palette.accentDark} /></View>
            <ThemedText style={styles.actionTitle}>钱包管理</ThemedText>
            <ThemedText style={styles.actionHint}>切换或删除钱包</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={openAddressList}>
            <View style={[styles.actionIcon, styles.actionIconGreen]}><Ionicons name="qr-code-outline" size={20} color={Palette.success} /></View>
            <ThemedText style={styles.actionTitle}>地址管理</ThemedText>
            <ThemedText style={styles.actionHint}>{addressCount} 个收款地址</ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.sectionTitle}>安全与备份</ThemedText>
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={openBackup}>
            <View style={[styles.menuIcon, styles.menuIconOrange]}><Ionicons name="key-outline" size={19} color={Palette.accentDark} /></View>
            <View style={styles.menuCopy}><ThemedText style={styles.menuTitle}>备份助记词</ThemedText><ThemedText style={styles.menuSubtitle}>验证密码后查看和复制</ThemedText></View>
            <Ionicons name="chevron-forward" size={18} color={Palette.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuRow} onPress={handleSecurity}>
            <View style={[styles.menuIcon, styles.menuIconGreen]}><Ionicons name="shield-checkmark-outline" size={19} color={Palette.success} /></View>
            <View style={styles.menuCopy}><ThemedText style={styles.menuTitle}>安全设置</ThemedText><ThemedText style={styles.menuSubtitle}>本地加密与签名保护</ThemedText></View>
            <Ionicons name="chevron-forward" size={18} color={Palette.muted} />
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.sectionTitle}>应用</ThemedText>
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/transactions')}>
            <View style={styles.menuIcon}><Ionicons name="receipt-outline" size={19} color={Palette.ink} /></View>
            <View style={styles.menuCopy}><ThemedText style={styles.menuTitle}>交易记录</ThemedText><ThemedText style={styles.menuSubtitle}>查看已完成和待确认交易</ThemedText></View>
            <Ionicons name="chevron-forward" size={18} color={Palette.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuRow} onPress={handleNetwork}>
            <View style={styles.menuIcon}><Ionicons name="globe-outline" size={19} color={Palette.ink} /></View>
            <View style={styles.menuCopy}><ThemedText style={styles.menuTitle}>网络状态</ThemedText><ThemedText style={styles.menuSubtitle}>查看当前链上节点配置</ThemedText></View>
            <Ionicons name="chevron-forward" size={18} color={Palette.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuRow, styles.menuRowLast]} onPress={handleAbout}>
            <View style={styles.menuIcon}><Ionicons name="information-circle-outline" size={19} color={Palette.ink} /></View>
            <View style={styles.menuCopy}><ThemedText style={styles.menuTitle}>关于</ThemedText><ThemedText style={styles.menuSubtitle}>Bitcoin Wallet</ThemedText></View>
            <Ionicons name="chevron-forward" size={18} color={Palette.muted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.canvas },
  content: { paddingHorizontal: 20, paddingTop: statusBarHeight + 14, paddingBottom: 34 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  overline: { color: Palette.slate, fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  title: { color: Palette.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', marginTop: 3 },
  refreshButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.line },
  loadingCard: { height: 172, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.darkSurface, marginBottom: 16 },
  walletCard: { backgroundColor: Palette.darkSurface, borderRadius: 22, padding: 20, marginBottom: 16 },
  walletCardTop: { flexDirection: 'row', alignItems: 'center' },
  walletMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
  walletIdentity: { flex: 1, marginLeft: 12 },
  walletName: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  walletId: { color: '#9AA8BF', fontSize: 12, marginTop: 4 },
  activeBadge: { backgroundColor: '#1F3A37', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  activeBadgeText: { color: '#74D9A5', fontSize: 11, fontWeight: '700' },
  walletBalance: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 28 },
  walletCaption: { color: '#9AA8BF', fontSize: 12, marginTop: 5 },
  emptyCard: { alignItems: 'center', backgroundColor: Palette.surface, borderRadius: 22, padding: 28, marginBottom: 16, borderWidth: 1, borderColor: Palette.line },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.accentSoft, marginBottom: 12 },
  emptyTitle: { color: Palette.ink, fontSize: 18, fontWeight: '800' },
  emptyText: { color: Palette.slate, fontSize: 13, marginTop: 6, textAlign: 'center' },
  primaryButton: { backgroundColor: Palette.accent, borderRadius: 13, paddingHorizontal: 24, paddingVertical: 13, marginTop: 18 },
  primaryButtonText: { color: Palette.ink, fontSize: 14, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 25 },
  actionCard: { flex: 1, padding: 15, minHeight: 122, backgroundColor: Palette.surface, borderRadius: 18, borderWidth: 1, borderColor: Palette.line },
  actionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  actionIconGreen: { backgroundColor: '#E9F9F1' },
  actionTitle: { color: Palette.ink, fontSize: 14, fontWeight: '800' },
  actionHint: { color: Palette.slate, fontSize: 11, marginTop: 4 },
  sectionTitle: { color: Palette.ink, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  menuCard: { backgroundColor: Palette.surface, borderRadius: 18, borderWidth: 1, borderColor: Palette.line, marginBottom: 24, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: Palette.line },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.canvas },
  menuIconOrange: { backgroundColor: Palette.accentSoft },
  menuIconGreen: { backgroundColor: '#E9F9F1' },
  menuCopy: { flex: 1, marginLeft: 12 },
  menuTitle: { color: Palette.ink, fontSize: 14, fontWeight: '700' },
  menuSubtitle: { color: Palette.slate, fontSize: 11, marginTop: 4 },
});
