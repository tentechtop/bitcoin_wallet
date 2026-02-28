import { useState } from 'react';
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { multiWalletStorage, Wallet } from '@/utils/secureStorage';
import { router, useFocusEffect } from 'expo-router';

export default function WalletManagementScreen() {
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // 使用 useFocusEffect 在页面聚焦时刷新
    useFocusEffect(
        React.useCallback(() => {
            loadWallets();
        }, [])
    );

    const loadWallets = async () => {
        setLoading(true);
        try {
            const [walletsList, activeId] = await Promise.all([
                multiWalletStorage.getWallets(),
                multiWalletStorage.getActiveWalletId()
            ]);
            setWallets(walletsList);
            setActiveWalletId(activeId);
        } catch (error) {
            console.error('加载钱包失败:', error);
            Alert.alert('错误', '加载钱包列表失败');
        } finally {
            setLoading(false);
        }
    };

    const handleSetActiveWallet = async (walletId: string) => {
        try {
            await multiWalletStorage.setActiveWalletId(walletId);
            setActiveWalletId(walletId);
            Alert.alert('成功', '已切换激活钱包');
        } catch (error) {
            console.error('设置激活钱包失败:', error);
            Alert.alert('错误', '设置激活钱包失败');
        }
    };

    const handleDeleteWallet = (wallet: Wallet) => {
        Alert.alert(
            '删除钱包',
            `确定要删除钱包 "${wallet.name}" 吗？此操作不可恢复。`,
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '删除',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const success = await multiWalletStorage.deleteWallet(wallet.id);
                            if (success) {
                                Alert.alert('成功', '钱包已删除');
                                loadWallets();
                            } else {
                                Alert.alert('错误', '删除钱包失败');
                            }
                        } catch (error) {
                            console.error('删除钱包失败:', error);
                            Alert.alert('错误', '删除钱包失败');
                        }
                    }
                }
            ]
        );
    };

    const formatBalance = (balance: number) => {
        return balance.toFixed(8);
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    };

    return (
        <View style={styles.container}>

            {wallets.length !== 0 ?
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => router.push('/create-wallet')}
                    >
                        <Text style={styles.addButtonText}>+ 新建钱包</Text>
                    </TouchableOpacity>
                </View>
                : null
            }


            {loading ? (
                <View style={styles.centerContainer}>
                    <Text>加载中...</Text>
                </View>
            ) : wallets.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>暂无钱包</Text>
                    <TouchableOpacity
                        style={styles.createButton}
                        onPress={() => router.push('/create-wallet')}
                    >
                        <Text style={styles.createButtonText}>创建第一个钱包</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView style={styles.walletList} showsVerticalScrollIndicator={false}>
                    {wallets.map((wallet) => (
                        <View
                            key={wallet.id}
                            style={[
                                styles.walletCard,
                                activeWalletId === wallet.id && styles.activeWalletCard
                            ]}
                        >
                            <View style={styles.walletHeader}>
                                <View style={styles.walletInfo}>
                                    <View style={styles.walletNameContainer}>
                                        <Text style={styles.walletName}>
                                            {wallet.name}
                                        </Text>
                                        {activeWalletId === wallet.id && (
                                            <View style={styles.activeBadge}>
                                                <Text style={styles.activeBadgeText}>当前</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.walletId}>ID: {wallet.id.slice(-8)}</Text>
                                </View>
                                <View style={styles.balanceContainer}>
                                    <Text style={styles.balance}>
                                        {formatBalance(wallet.balance)} BTC
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.walletDetails}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>创建时间:</Text>
                                    <Text style={styles.detailValue}>{formatDate(wallet.createdAt)}</Text>
                                </View>
                                {wallet.networkUrl && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>网络:</Text>
                                        <Text style={styles.detailValue} numberOfLines={1}>
                                            {wallet.networkUrl}
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>地址数:</Text>
                                    <Text style={styles.detailValue}>{wallet.addresses.length}</Text>
                                </View>
                            </View>

                            <View style={styles.actionButtons}>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.addressListButton]}
                                    onPress={() => router.push('/address-list')}
                                >
                                    <Text style={styles.actionButtonText}>地址列表</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.addressButton]}
                                    onPress={() => router.push({
                                        pathname: '/create-address',
                                        params: { walletId: wallet.id }
                                    })}
                                >
                                    <Text style={styles.actionButtonText}>添加地址</Text>
                                </TouchableOpacity>
                                {activeWalletId !== wallet.id && (
                                    <TouchableOpacity
                                        style={styles.actionButton}
                                        onPress={() => handleSetActiveWallet(wallet.id)}
                                    >
                                        <Text style={styles.actionButtonText}>激活</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.deleteButton]}
                                    onPress={() => handleDeleteWallet(wallet)}
                                >
                                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>删除</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    addButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    addButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        marginBottom: 20,
        opacity: 0.6,
        fontSize: 20,
        fontWeight: 'bold',
    },
    createButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    createButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    walletList: {
        flex: 1,
    },
    walletCard: {
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    activeWalletCard: {
        borderColor: '#007AFF',
        backgroundColor: '#E3F2FD',
    },
    walletHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    walletInfo: {
        flex: 1,
    },
    walletNameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    walletName: {
        fontSize: 16,
        fontWeight: '600',
        marginRight: 8,
    },
    activeBadge: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    activeBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '600',
    },
    walletId: {
        fontSize: 12,
        opacity: 0.6,
    },
    balanceContainer: {
        alignItems: 'flex-end',
    },
    balance: {
        fontSize: 18,
        fontWeight: '700',
        color: '#007AFF',
    },
    walletDetails: {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    detailLabel: {
        fontSize: 13,
        opacity: 0.7,
        width: 80,
    },
    detailValue: {
        fontSize: 13,
        flex: 1,
        textAlign: 'right',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: '#007AFF',
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    addressListButton: {
        backgroundColor: '#FF9500',
    },
    addressButton: {
        backgroundColor: '#34C759',
    },
    deleteButton: {
        backgroundColor: '#FF3B30',
    },
    deleteButtonText: {
        color: '#FFFFFF',
    },
});