import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';

export default function HomeScreen() {
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
        <ThemedText type="title" style={styles.totalBalance}>0.0000 BTC</ThemedText>
      </ThemedView>

      {/* 快速操作 */}
      <ThemedView style={styles.quickActions}>
        <TouchableOpacity style={styles.actionBtn}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="arrow-up" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>转账</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
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
          <Link href="/transactions" asChild>
            <ThemedText style={styles.seeAll}>查看全部</ThemedText>
          </Link>
        </ThemedView>

        <ThemedView style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color="#888888" />
          <ThemedText style={styles.emptyText}>暂无交易记录</ThemedText>
          <ThemedText style={styles.emptySubtext}>开始使用钱包，记录您的第一笔交易</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* 常用功能 */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>常用功能</ThemedText>
        <ThemedView style={styles.featuresGrid}>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="wallet-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>钱包管理</ThemedText>
          </TouchableOpacity>
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
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="receipt-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>交易历史</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="settings-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>系统设置</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
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
    fontSize: 16,
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
});
