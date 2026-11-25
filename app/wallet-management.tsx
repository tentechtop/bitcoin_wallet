import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, TextInput } from 'react-native';
import { multiWalletStorage, Wallet } from '@/utils/secureStorage';
import { router, useFocusEffect } from 'expo-router';
import { getWalletBalance } from '@/utils/blockchainApi';

export default function WalletManagementScreen() {
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshingWalletId, setRefreshingWalletId] = useState<string | null>(null);
    const [walletToDelete, setWalletToDelete] = useState<Wallet | null>(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deleting, setDeleting] = useState(false);

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
            const success = await multiWalletStorage.setActiveWalletId(walletId);
            if (!success) throw new Error('钱包不存在或保存失败');
            setActiveWalletId(walletId);
            Alert.alert('成功', '已切换激活钱包');
        } catch (error) {
            console.error('设置激活钱包失败:', error);
            Alert.alert('错误', error instanceof Error ? error.message : '设置激活钱包失败');
        }
    };

    const handleRefreshBalance = async (walletId: string) => {
        setRefreshingWalletId(walletId);
        try {
            const wallet = await multiWalletStorage.getWalletById(walletId);
            if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
                Alert.alert('提示', '该钱包没有地址，无法查询余额');
                return;
            }

            // 查询钱包余额
            const balanceInfo = await getWalletBalance(wallet.addresses);

            // 更新存储中的钱包余额
            await multiWalletStorage.updateWalletBalance(walletId, balanceInfo.totalBalanceBTC);

            // 只更新本地状态中的钱包，不重新加载整个列表
            setWallets(prevWallets =>
                prevWallets.map(w =>
                    w.id === walletId ? { ...w, balance: balanceInfo.totalBalanceBTC } : w
                )
            );
        } catch (error) {
            console.error('刷新余额失败:', error);
            Alert.alert('错误', '刷新余额失败');
        } finally {
            setRefreshingWalletId(null);
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
                    onPress: () => {
                        setWalletToDelete(wallet);
                        setDeletePassword('');
                        setDeleteModalVisible(true);
                    }
                }
            ]
        );
    };

    const confirmDeleteWallet = async () => {
        if (!walletToDelete || !deletePassword) {
            Alert.alert('提示', '请输入钱包密码');
            return;
        }

        setDeleting(true);
        try {
            const valid = await multiWalletStorage.verifyWalletPassword(walletToDelete.id, deletePassword);
            if (!valid) {
                Alert.alert('无法删除', '钱包密码不正确');
                setDeletePassword('');
                return;
            }

            const success = await multiWalletStorage.deleteWallet(walletToDelete.id);
            if (!success) throw new Error('删除钱包失败');
            setDeleteModalVisible(false);
            setWalletToDelete(null);
            setDeletePassword('');
            Alert.alert('成功', '钱包已删除');
            await loadWallets();
        } catch (error) {
            console.error('删除钱包失败:', error);
            Alert.alert('错误', error instanceof Error ? error.message : '删除钱包失败');
        } finally {
            setDeleting(false);
        }
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
                <ScrollView
                    style={styles.walletList}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.walletListContent}
                    maintainVisibleContentPosition={{
                        minIndexForVisible: 0,
                        autoscrollToTopThreshold: 10
                    }}
                >
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
                                    <TouchableOpacity
                                        onPress={() => handleRefreshBalance(wallet.id)}
                                        disabled={refreshingWalletId === wallet.id}
                                        style={styles.refreshButton}
                                    >
                                        {refreshingWalletId === wallet.id ? (
                                            <ActivityIndicator size="small" color="#007AFF" />
                                        ) : (
                                            <Text style={styles.refreshButtonText}>刷新</Text>
                                        )}
                                    </TouchableOpacity>
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
                                    onPress={() => router.push({
                                        pathname: '/address-list',
                                        params: { walletId: wallet.id }
                                    })}
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

            <Modal
                visible={deleteModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    if (!deleting) setDeleteModalVisible(false);
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>验证钱包密码</Text>
                        <Text style={styles.modalMessage}>删除钱包前请输入密码。删除后无法恢复本机数据。</Text>
                        <TextInput
                            style={styles.passwordInput}
                            value={deletePassword}
                            onChangeText={setDeletePassword}
                            placeholder="请输入钱包密码"
                            placeholderTextColor="#999"
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!deleting}
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setDeleteModalVisible(false)}
                                disabled={deleting}
                            >
                                <Text style={styles.cancelButtonText}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.confirmDeleteButton]}
                                onPress={confirmDeleteWallet}
                                disabled={deleting}
                            >
                                {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmDeleteButtonText}>确认删除</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    walletListContent: {
        paddingBottom: 20,
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
    refreshButton: {
        marginTop: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
        backgroundColor: '#E3F2FD',
        borderRadius: 4,
    },
    refreshButtonText: {
        fontSize: 12,
        color: '#007AFF',
        fontWeight: '600',
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    modalMessage: {
        color: '#666666',
        lineHeight: 20,
        marginBottom: 14,
    },
    passwordInput: {
        height: 48,
        borderWidth: 1,
        borderColor: '#D0D0D0',
        borderRadius: 8,
        paddingHorizontal: 12,
        color: '#111111',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 16,
    },
    modalButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#F0F0F0',
    },
    cancelButtonText: {
        color: '#333333',
        fontWeight: '600',
    },
    confirmDeleteButton: {
        backgroundColor: '#D92D20',
    },
    confirmDeleteButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
});
