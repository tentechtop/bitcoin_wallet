import { useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import type { RelativePathString } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { statusBarHeight } from '@/constants/theme';
import { multiWalletStorage } from '@/utils/secureStorage';
import { getWalletBalance } from '@/utils/blockchainApi';

interface MenuItem {
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    route?: RelativePathString;
    action?: () => void;
    showArrow?: boolean;
}

export default function MyScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [walletName, setWalletName] = useState('');
    const [totalBalance, setTotalBalance] = useState(0);
    const [addressCount, setAddressCount] = useState(0);

    useFocusEffect(
        useCallback(() => {
            loadWalletInfo(false);
        }, [])
    );

    const loadWalletInfo = async (isRefresh = false) => {
        try {
            if (!isRefresh) {
                setLoading(true);
            } else {
                setRefreshing(true);
            }

            // 获取当前激活的钱包
            const walletId = await multiWalletStorage.getActiveWalletId();
            if (!walletId) {
                setWalletName('未选择钱包');
                setTotalBalance(0);
                setAddressCount(0);
                return;
            }

            const wallet = await multiWalletStorage.getWalletById(walletId);

            if (wallet) {
                setWalletName(wallet.name || '未命名钱包');
                setAddressCount(wallet.addresses?.length || 0);

                // 查询余额
                if (wallet.addresses && wallet.addresses.length > 0) {
                    const balanceInfo = await getWalletBalance(wallet.addresses, 2);
                    setTotalBalance(balanceInfo.totalBalanceBTC);
                } else {
                    setTotalBalance(0);
                }
            }
        } catch (error) {
            console.error('加载钱包信息失败:', error);
        } finally {
            if (!isRefresh) {
                setLoading(false);
            } else {
                setRefreshing(false);
            }
        }
    };

    const handleWalletManagement = () => {
        router.push('/wallet-management');
    };

    const handleCreateWallet = () => {
        router.push('/create-wallet');
    };

    const handleAddressManagement = async () => {
        try {
            const walletId = await multiWalletStorage.getActiveWalletId();
            if (walletId) {
                router.push(`/address-list?walletId=${walletId}`);
            } else {
                router.push('/address-list');
            }
        } catch (error) {
            console.error('跳转到地址管理失败:', error);
            router.push('/address-list');
        }
    };

    const handleBackupMnemonic = () => {
        Alert.alert(
            '提示',
            '请务必妥善保管助记词，丢失将无法恢复钱包！',
            [
                { text: '取消', style: 'cancel' },
                { text: '我知道了', style: 'default' }
            ]
        );
    };

    const handleSecuritySettings = () => {
        Alert.alert('安全设置', '密码设置、生物识别等功能开发中...');
    };

    const handleNetworkSettings = () => {
        Alert.alert('网络设置', '节点设置、网络切换等功能开发中...');
    };

    const handleAbout = () => {
        Alert.alert(
            '关于',
            'Bitcoin Wallet v1.0.0\n\n基于 React Native + Expo 开发的比特币钱包',
            [{ text: '确定' }]
        );
    };

    const handleClearCache = () => {
        Alert.alert(
            '清除缓存',
            '确定要清除缓存数据吗？',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '确定',
                    onPress: () => {
                        Alert.alert('提示', '缓存已清除');
                    }
                }
            ]
        );
    };

    // 菜单项配置
    const menuGroups: MenuItem[][] = [
        [
            {
                id: 'wallet',
                icon: 'wallet-outline',
                title: '钱包管理',
                subtitle: `当前钱包: ${walletName}`,
                action: handleWalletManagement,
                showArrow: true,
            },
            {
                id: 'create-wallet',
                icon: 'add-circle-outline',
                title: '创建新钱包',
                action: handleCreateWallet,
                showArrow: true,
            },
            {
                id: 'addresses',
                icon: 'key-outline',
                title: '地址管理',
                subtitle: `${addressCount} 个地址`,
                action: handleAddressManagement,
                showArrow: true,
            },
        ],
        [
            {
                id: 'backup',
                icon: 'document-text-outline',
                title: '备份助记词',
                action: handleBackupMnemonic,
                showArrow: true,
            },
            {
                id: 'security',
                icon: 'shield-checkmark-outline',
                title: '安全设置',
                action: handleSecuritySettings,
                showArrow: true,
            },
            {
                id: 'network',
                icon: 'globe-outline',
                title: '网络设置',
                action: handleNetworkSettings,
                showArrow: true,
            },
        ],
        [
            {
                id: 'transactions',
                icon: 'receipt-outline',
                title: '交易记录',
                route: '/transactions',
                showArrow: true,
            },
            {
                id: 'cache',
                icon: 'trash-outline',
                title: '清除缓存',
                action: handleClearCache,
                showArrow: true,
            },
        ],
        [
            {
                id: 'about',
                icon: 'information-circle-outline',
                title: '关于',
                action: handleAbout,
                showArrow: true,
            },
        ],
    ];

    const handleMenuPress = (item: MenuItem) => {
        if (item.route) {
            router.push(item.route);
        } else if (item.action) {
            item.action();
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView 
                style={styles.scrollContainer}
                contentContainerStyle={{ 
                    paddingBottom: 20 + insets.bottom, 
                    paddingTop: insets.top + 20,
                    minHeight: '100%'
                }}
                bounces={true}
                alwaysBounceVertical={true}
            >
                {/* 资产概览卡片 */}
                <ThemedView style={styles.balanceCard}>
                    <ThemedText style={styles.balanceLabel}>总资产</ThemedText>
                    {loading ? (
                        <ActivityIndicator size="small" color="#000000" />
                    ) : (
                        <ThemedText style={styles.balanceValue}>
                            {totalBalance.toFixed(8)} BTC
                        </ThemedText>
                    )}
                    <View style={styles.balanceActions}>
                        <TouchableOpacity 
                            style={styles.actionBtn} 
                            onPress={() => loadWalletInfo(true)}
                            disabled={refreshing}
                        >
                            <Ionicons 
                                name={refreshing ? "refresh" : "refresh"} 
                                size={16} 
                                color={refreshing ? "#cccccc" : "#666666"}
                            />
                            <ThemedText style={[styles.actionText, refreshing && styles.actionTextDisabled]}>
                                {refreshing ? '刷新中...' : '刷新'}
                            </ThemedText>
                        </TouchableOpacity>
                    </View>
                </ThemedView>

                {/* 菜单列表 */}
                {menuGroups.map((group, groupIndex) => (
                    <ThemedView key={groupIndex} style={styles.menuGroup}>
                        {group.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.menuItem}
                                onPress={() => handleMenuPress(item)}
                            >
                                <View style={styles.menuItemLeft}>
                                    <View style={styles.menuIcon}>
                                        <Ionicons name={item.icon} size={24} color="#000000" />
                                    </View>
                                    <View style={styles.menuItemContent}>
                                        <ThemedText style={styles.menuTitle}>{item.title}</ThemedText>
                                        {item.subtitle && (
                                            <ThemedText style={styles.menuSubtitle}>{item.subtitle}</ThemedText>
                                        )}
                                    </View>
                                </View>
                                {item.showArrow && (
                                    <Ionicons name="chevron-forward" size={20} color="#999999" />
                                )}
                            </TouchableOpacity>
                        ))}
                    </ThemedView>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    scrollContainer: {
        flex: 1,
    },
    topSpacing: {
        height: 20,
    },
    balanceCard: {
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        padding: 20,
        marginHorizontal: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    balanceLabel: {
        fontSize: 14,
        color: '#666666',
        marginBottom: 12,
    },
    balanceValue: {
        fontSize: 32,
        fontWeight: '700',
        color: '#000000',
        marginBottom: 16,
        lineHeight: 40,
    },
    balanceActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    actionText: {
        fontSize: 14,
        color: '#666666',
    },
    actionTextDisabled: {
        color: '#cccccc',
    },
    menuContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    menuGroup: {
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        marginHorizontal: 16,
        marginBottom: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    menuIcon: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    menuItemContent: {
        flex: 1,
    },
    menuTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#000000',
        marginBottom: 2,
    },
    menuSubtitle: {
        fontSize: 13,
        color: '#999999',
    },
});
