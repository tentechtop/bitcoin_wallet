import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, Modal, ScrollView } from 'react-native';
import { statusBarHeight } from '@/constants/theme';
import { multiWalletStorage } from '@/utils/secureStorage';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

interface WalletAddress {
    path: string;
    address: string;
    publicKey: string;
    privateKey: string;
}

export default function AddressListScreen() {
    const { walletId } = useLocalSearchParams<{ walletId: string }>();
    const [wallet, setWallet] = useState<any>(null);
    const [addresses, setAddresses] = useState<WalletAddress[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [selectedAddressIndex, setSelectedAddressIndex] = useState<number | null>(null);
    const [deletePassword, setDeletePassword] = useState('');

    useEffect(() => {
        if (walletId) {
            loadWallet();
        }
    }, [walletId]);

    const loadWallet = async () => {
        if (!walletId) {
            setLoading(false);
            return;
        }

        try {
            const walletData = await multiWalletStorage.getWalletById(walletId);
            if (walletData) {
                setWallet(walletData);
                loadAddresses(walletData);
            } else {
                Alert.alert('错误', '钱包不存在');
                router.back();
            }
        } catch (error) {
            console.error('加载钱包失败:', error);
            Alert.alert('错误', '加载钱包失败');
        } finally {
            setLoading(false);
        }
    };

    const loadAddresses = (walletData: any) => {
        if (walletData && walletData.addresses) {
            const parsedAddresses = walletData.addresses.map((addr: any) => 
                typeof addr === 'string' ? { address: addr, path: '', publicKey: '', privateKey: '' } as WalletAddress : addr
            );
            setAddresses(parsedAddresses);
        } else {
            setAddresses([]);
        }
    };

    const handleCopyAddress = async (address: string) => {
        await Clipboard.setStringAsync(address);
        Alert.alert('成功', '地址已复制');
    };

    const handleDeleteAddress = (index: number) => {
        setSelectedAddressIndex(index);
        setDeletePassword('');
        setDeleteModalVisible(true);
    };

    const confirmDeleteAddress = async () => {
        if (!walletId || selectedAddressIndex === null) {
            return;
        }

        try {
            // 验证钱包密码
            const isPasswordValid = await multiWalletStorage.verifyWalletPassword(walletId, deletePassword);
            if (!isPasswordValid) {
                Alert.alert('错误', '密码错误，请重新输入');
                setDeletePassword('');
                return;
            }

            // 删除地址
            const walletData = await multiWalletStorage.getWalletById(walletId);
            if (walletData) {
                const updatedAddresses = walletData.addresses.filter((_: any, i: number) => i !== selectedAddressIndex);
                await multiWalletStorage.updateWallet(walletId, { addresses: updatedAddresses });

                // 重新加载地址列表
                loadAddresses(walletData);

                Alert.alert('成功', '地址已删除');
                setDeleteModalVisible(false);
                setSelectedAddressIndex(null);
                setDeletePassword('');
            }
        } catch (error) {
            console.error('删除地址失败:', error);
            Alert.alert('错误', '删除地址失败');
        }
    };

    const formatPath = (path: string) => {
        if (!path) return '未知';
        const parts = path.split('/');
        return parts.length > 0 ? parts[parts.length - 1] : path;
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>加载中...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* 钱包信息 */}
            {wallet && (
                <View style={styles.walletInfo}>
                    <Text style={styles.walletName}>{wallet.name}</Text>
                    <Text style={styles.addressCount}>共 {addresses.length} 个地址</Text>
                </View>
            )}

            {/* 地址列表 */}
            {addresses.length > 0 ? (
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                    {addresses.map((addr, index) => (
                        <View key={index} style={styles.addressCard}>
                            <View style={styles.addressHeader}>
                                <Text style={styles.addressIndex}>地址 #{index + 1}</Text>
                                {addr.path && (
                                    <Text style={styles.pathText}>路径: {formatPath(addr.path)}</Text>
                                )}
                            </View>

                            <TouchableOpacity
                                style={styles.addressContainer}
                                onLongPress={() => handleCopyAddress(addr.address)}
                            >
                                <Text style={styles.addressText} numberOfLines={2}>
                                    {addr.address}
                                </Text>
                                <TouchableOpacity
                                    style={styles.copyButton}
                                    onPress={() => handleCopyAddress(addr.address)}
                                >
                                    <Text style={styles.copyButtonText}>复制</Text>
                                </TouchableOpacity>
                            </TouchableOpacity>

                            {/* 地址二维码 */}
                            <View style={styles.qrcodeContainer}>
                                <QRCode value={addr.address} size={100} />
                            </View>

                            {addr.publicKey && (
                                <View style={styles.keyContainer}>
                                    <Text style={styles.keyLabel}>公钥:</Text>
                                    <Text style={styles.keyText} numberOfLines={1}>
                                        {addr.publicKey}
                                    </Text>
                                </View>
                            )}

                            {addr.privateKey && (
                                <View style={styles.keyContainer}>
                                    <Text style={[styles.keyLabel, styles.privateKeyLabel]}>私钥:</Text>
                                    <Text style={[styles.keyText, styles.privateKeyText]} numberOfLines={1}>
                                        {addr.privateKey}
                                    </Text>
                                </View>
                            )}

                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeleteAddress(index)}
                            >
                                <Text style={styles.deleteButtonText}>删除地址</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>该钱包暂无地址</Text>
                </View>
            )}

            {/* 删除确认弹窗 */}
            <Modal
                visible={deleteModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setDeleteModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>确认删除</Text>
                        <Text style={styles.modalMessage}>
                            删除地址需要验证钱包密码
                        </Text>
                        <TextInput
                            style={styles.passwordInput}
                            placeholder="请输入钱包密码"
                            placeholderTextColor="#999"
                            secureTextEntry
                            value={deletePassword}
                            onChangeText={setDeletePassword}
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setDeleteModalVisible(false)}
                            >
                                <Text style={styles.cancelButtonText}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.confirmButton]}
                                onPress={confirmDeleteAddress}
                            >
                                <Text style={styles.confirmButtonText}>确认删除</Text>
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
        backgroundColor: '#f8f9fa',
    },
    loadingText: {
        textAlign: 'center',
        marginTop: 100,
        fontSize: 16,
        color: '#666',
    },
    walletInfo: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: '#e8e8e8',
    },
    walletName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#000000',
        marginBottom: 4,
    },
    addressCount: {
        fontSize: 14,
        color: '#666',
    },
    scrollView: {
        flex: 1,
        padding: 16,
    },
    addressCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    addressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    addressIndex: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000000',
    },
    pathText: {
        fontSize: 12,
        color: '#999',
        fontFamily: 'monospace',
    },
    addressContainer: {
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    addressText: {
        fontSize: 13,
        fontFamily: 'monospace',
        color: '#000000',
        marginBottom: 8,
    },
    copyButton: {
        alignSelf: 'flex-start',
    },
    copyButtonText: {
        fontSize: 12,
        color: '#007AFF',
    },
    qrcodeContainer: {
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        marginBottom: 12,
    },
    keyContainer: {
        marginBottom: 8,
    },
    keyLabel: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    privateKeyLabel: {
        color: '#FF3B30',
    },
    keyText: {
        fontSize: 11,
        fontFamily: 'monospace',
        color: '#666',
        backgroundColor: '#f8f9fa',
        padding: 8,
        borderRadius: 6,
    },
    privateKeyText: {
        color: '#FF3B30',
        backgroundColor: '#fff5f5',
    },
    deleteButton: {
        width: '100%',
        height: 44,
        backgroundColor: '#FF3B30',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    deleteButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 24,
        width: '80%',
        maxWidth: 320,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        textAlign: 'center',
    },
    modalMessage: {
        fontSize: 14,
        color: '#666',
        marginBottom: 20,
        textAlign: 'center',
    },
    passwordInput: {
        width: '100%',
        height: 44,
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: '#e8e8e8',
        borderRadius: 8,
        paddingHorizontal: 12,
        fontSize: 14,
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        height: 44,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#f8f9fa',
    },
    cancelButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    confirmButton: {
        backgroundColor: '#FF3B30',
    },
    confirmButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
});
