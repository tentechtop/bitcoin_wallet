import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { statusBarHeight } from '@/constants/theme';
import { multiWalletStorage } from '@/utils/secureStorage';
import { router, useLocalSearchParams } from 'expo-router';
import { HDKey } from '@scure/bip32';
import * as Clipboard from 'expo-clipboard';
import bs58 from 'bs58';
import * as nacl from 'tweetnacl';
import QRCode from 'react-native-qrcode-svg';


interface WalletAddress {
    path: string;
    address: string;
    publicKey: string;
    privateKey: string;
}

export default function CreateAddressScreen() {
    const { walletId } = useLocalSearchParams<{ walletId: string }>();
    const [walletName, setWalletName] = useState('');
    const [accountIndex, setAccountIndex] = useState('0');
    const [addressIndex, setAddressIndex] = useState('0');
    const [derivedPath, setDerivedPath] = useState('');
    const [derivedAddress, setDerivedAddress] = useState('');
    const [derivedPublicKey, setDerivedPublicKey] = useState('');
    const [derivedPrivateKey, setDerivedPrivateKey] = useState('');
    const [walletPassword, setWalletPassword] = useState('');
    const [existingAddresses, setExistingAddresses] = useState<WalletAddress[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadWalletInfo();
    }, [walletId]);

    const loadWalletInfo = async () => {
        if (!walletId) {
            Alert.alert('错误', '未指定钱包ID');
            return;
        }

        try {
            const wallet = await multiWalletStorage.getWalletById(walletId);
            if (wallet) {
                setWalletName(wallet.name);
                // 获取现有地址数，计算下一个地址索引
                const nextAddressIndex = wallet.addresses.length > 0 ? wallet.addresses.length : 0;
                setAddressIndex(nextAddressIndex.toString());
                
                // 加载现有地址列表
                if (wallet.addresses && wallet.addresses.length > 0) {
                    try {
                        const parsedAddresses = wallet.addresses.map(addr => 
                            typeof addr === 'string' ? { address: addr, path: '', publicKey: '', privateKey: '' } as WalletAddress : addr
                        );
                        setExistingAddresses(parsedAddresses);
                    } catch (e) {
                        console.warn('解析现有地址失败:', e);
                    }
                }
                
                // 自动生成地址
                generateAddress();
            } else {
                Alert.alert('错误', '钱包不存在');
            }
        } catch (error) {
            console.error('加载钱包信息失败:', error);
            Alert.alert('错误', '加载钱包信息失败');
        }
    };

    const generateAddress = async () => {
        try {
            if (!walletId) return;

            const wallet = await multiWalletStorage.getWalletById(walletId);
            if (!wallet) {
                Alert.alert('错误', '钱包不存在');
                return;
            }

            // 解密种子
            const decryptedSeed = multiWalletStorage.decryptSeed(
                wallet.encryptedSeed,
                walletPassword
            );

            if (!decryptedSeed) {
                if (!walletPassword) {
                    Alert.alert('提示', '请输入钱包密码以解密种子');
                }
                setDerivedPath('');
                setDerivedAddress('');
                setDerivedPublicKey('');
                setDerivedPrivateKey('');
                return;
            }

            // 验证种子长度（十六进制格式，应该是64个字符，32字节）
            // 如果不是64字符，尝试解析
            console.log('解密后的种子长度:', decryptedSeed.length);
            
            // 将hex字符串转换为Uint8Array
            let seedBuffer: Uint8Array;
            try {
                seedBuffer = new Uint8Array(
                    decryptedSeed.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
                );
                console.log('转换后的种子字节数:', seedBuffer.length);
            } catch (e) {
                console.error('种子格式转换失败:', e);
                Alert.alert('错误', '种子格式无效，请检查钱包密码');
                return;
            }

            // 账户索引和地址索引
            const accountIdx = parseInt(accountIndex) || 0;
            const addressIdx = parseInt(addressIndex) || 0;

            // 构建派生路径: m/44'/0'/account'/0/address
            const path = `m/44'/0'/${accountIdx}'/0/${addressIdx}`;
            setDerivedPath(path);

            // 派生密钥
            const hdkey = HDKey.fromMasterSeed(seedBuffer);
            const derivedKey = hdkey.derive(path);
            const privateKeyBytes = derivedKey.privateKey;

            if (!privateKeyBytes || privateKeyBytes.length !== 32) {
                Alert.alert('错误', '派生私钥失败');
                return;
            }

            // 使用tweetnacl生成密钥对
            const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
            const publicKeyBytes = keyPair.publicKey;
            
            // Base58编码地址
            const addressBase58 = bs58.encode(publicKeyBytes);
            
            // 转换为hex字符串
            const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');
            const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');

            setDerivedAddress(addressBase58);
            setDerivedPublicKey(publicKeyHex);
            setDerivedPrivateKey(privateKeyHex);

        } catch (error) {
            console.error('生成地址失败:', error);
            Alert.alert('错误', '生成地址失败: ' + (error as Error).message);
        }
    };

    const handleCopyAddress = async () => {
        if (derivedAddress) {
            await Clipboard.setStringAsync(derivedAddress);
            Alert.alert('成功', '地址已复制');
        }
    };

    const handleCopyPublicKey = async () => {
        if (derivedPublicKey) {
            await Clipboard.setStringAsync(derivedPublicKey);
            Alert.alert('成功', '公钥已复制');
        }
    };

    const handleCopyPrivateKey = async () => {
        if (derivedPrivateKey) {
            await Clipboard.setStringAsync(derivedPrivateKey);
            Alert.alert('警告', '私钥已复制，请妥善保管！');
        }
    };

    const handleSaveAddress = async () => {
        if (!walletId) {
            Alert.alert('错误', '未指定钱包ID');
            return;
        }

        if (!derivedAddress) {
            Alert.alert('错误', '请先生成地址');
            return;
        }

        try {
            setLoading(true);

            const wallet = await multiWalletStorage.getWalletById(walletId);
            if (!wallet) {
                Alert.alert('错误', '钱包不存在');
                return;
            }

            // 检查地址是否已存在
            const addressExists = wallet.addresses.some(addr => {
                if (typeof addr === 'string') {
                    return addr === derivedAddress;
                }
                return addr.address === derivedAddress;
            });

            if (addressExists) {
                Alert.alert('错误', '该地址已存在于钱包中');
                return;
            }

            // 检查账户索引和地址索引组合是否已存在
            const accountIdx = parseInt(accountIndex) || 0;
            const addressIdx = parseInt(addressIndex) || 0;

            const indexExists = wallet.addresses.some(addr => {
                if (typeof addr === 'string') {
                    return false; // 旧格式数据无法检查索引
                }
                const existingAccountIdx = parseInt(addr.path.split('/')[3].replace("'", ''));
                const existingAddressIdx = parseInt(addr.path.split('/')[4]);
                return existingAccountIdx === accountIdx && existingAddressIdx === addressIdx;
            });

            if (indexExists) {
                Alert.alert(
                    '错误',
                    `账户索引 ${accountIdx} 和地址索引 ${addressIdx} 的组合已存在，\n请使用不同的索引组合以防止重复`
                );
                return;
            }

            // 构建新地址对象
            const newAddress: WalletAddress = {
                path: derivedPath,
                address: derivedAddress,
                publicKey: derivedPublicKey,
                privateKey: derivedPrivateKey
            };

            // 更新钱包的地址列表
            const updatedAddresses = [...wallet.addresses, newAddress];

            await multiWalletStorage.updateWallet(
                walletId,
                { addresses: updatedAddresses }
            );

            Alert.alert(
                '成功',
                '地址已保存到钱包',
                [
                    {
                        text: '确定',
                        onPress: () => router.back()
                    }
                ]
            );
        } catch (error) {
            console.error('保存地址失败:', error);
            Alert.alert('错误', '保存地址失败: ' + (error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* 钱包信息 */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>钱包信息</Text>
                    <View style={styles.formItem}>
                        <Text style={styles.formLabel}>钱包名称</Text>
                        <Text style={styles.walletName}>{walletName}</Text>
                    </View>
                    <View style={styles.formItem}>
                        <Text style={styles.formLabel}>现有地址数量</Text>
                        <Text style={styles.addressCount}>{existingAddresses.length}</Text>
                    </View>
                </View>

                {/* 派生路径设置 */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>派生路径设置</Text>
                    
                    <View style={styles.formItem}>
                        <Text style={styles.formLabel}>钱包密码</Text>
                        <TextInput
                            style={styles.formInput}
                            value={walletPassword}
                            onChangeText={setWalletPassword}
                            placeholder="请输入钱包密码以解密种子"
                            placeholderTextColor="#999"
                            secureTextEntry
                        />
                    </View>

                    <View style={styles.formItem}>
                        <Text style={styles.formLabel}>账户索引 (Account Index)</Text>
                        <TextInput
                            style={styles.formInput}
                            value={accountIndex}
                            onChangeText={setAccountIndex}
                            placeholder="默认为0"
                            placeholderTextColor="#999"
                            keyboardType="number-pad"
                            onBlur={generateAddress}
                        />
                    </View>

                    <View style={styles.formItem}>
                        <Text style={styles.formLabel}>地址索引 (Address Index)</Text>
                        <TextInput
                            style={styles.formInput}
                            value={addressIndex}
                            onChangeText={setAddressIndex}
                            placeholder="默认递增"
                            placeholderTextColor="#999"
                            keyboardType="number-pad"
                            onBlur={generateAddress}
                        />
                    </View>

                    <View style={styles.formItem}>
                        <Text style={styles.formLabel}>派生路径</Text>
                        <Text style={styles.derivedPathText}>{derivedPath || 'm/44\'/0\'/0\'/0/0'}</Text>
                    </View>

                    <TouchableOpacity
                        style={styles.generateButton}
                        onPress={generateAddress}
                    >
                        <Text style={styles.generateButtonText}>生成地址</Text>
                    </TouchableOpacity>
                </View>

                {/* 生成的地址信息 */}
                {derivedAddress && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>生成的地址信息</Text>
                        
                        <View style={styles.formItem}>
                            <View style={styles.labelRow}>
                                <Text style={styles.formLabel}>地址 (Base58)</Text>
                                <TouchableOpacity onPress={handleCopyAddress}>
                                    <Text style={styles.copyText}>复制</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.addressText}>{derivedAddress}</Text>
                        </View>


                        {/* 地址二维码 */}
                        <View style={styles.qrcodeContainer}>
                            <Text style={styles.resultLabel}>地址二维码:</Text>
                            {/* 关键修改：将固定字符串替换为derivedAddress变量 */}
                            <QRCode
                                value={derivedAddress}
                            />
                        </View>

                        <View style={styles.formItem}>
                            <View style={styles.labelRow}>
                                <Text style={styles.formLabel}>公钥 (Hex)</Text>
                                <TouchableOpacity onPress={handleCopyPublicKey}>
                                    <Text style={styles.copyText}>复制</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.keyText}>{derivedPublicKey}</Text>
                        </View>

                        <View style={styles.formItem}>
                            <View style={styles.labelRow}>
                                <Text style={[styles.formLabel, styles.dangerLabel]}>私钥 (Hex)</Text>
                                <TouchableOpacity onPress={handleCopyPrivateKey}>
                                    <Text style={styles.copyText}>复制</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={[styles.keyText, styles.dangerText]}>{derivedPrivateKey}</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={handleSaveAddress}
                            disabled={loading}
                        >
                            <Text style={styles.saveButtonText}>
                                {loading ? '保存中...' : '保存地址到钱包'}
                            </Text>
                        </TouchableOpacity>
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
    scrollView: {
        flex: 1,
        padding: 16,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 16,
    },
    formItem: {
        marginBottom: 16,
    },
    formLabel: {
        fontSize: 14,
        color: '#666666',
        marginBottom: 8,
    },
    formInput: {
        width: '100%',
        height: 44,
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: '#e8e8e8',
        borderRadius: 8,
        paddingHorizontal: 12,
        fontSize: 14,
        color: '#000000',
    },
    walletName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000000',
    },
    addressCount: {
        fontSize: 16,
        color: '#007AFF',
    },
    derivedPathText: {
        fontSize: 13,
        fontFamily: 'monospace',
        color: '#007AFF',
        backgroundColor: '#f0f8ff',
        padding: 10,
        borderRadius: 6,
    },
    generateButton: {
        width: '100%',
        height: 44,
        backgroundColor: '#007AFF',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    generateButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    copyText: {
        fontSize: 12,
        color: '#007AFF',
    },
    addressText: {
        fontSize: 13,
        fontFamily: 'monospace',
        color: '#000000',
        backgroundColor: '#f8f9fa',
        padding: 12,
        borderRadius: 8,
        lineHeight: 18,
    },
    keyText: {
        fontSize: 12,
        fontFamily: 'monospace',
        color: '#000000',
        backgroundColor: '#f8f9fa',
        padding: 12,
        borderRadius: 8,
        lineHeight: 16,
    },
    dangerLabel: {
        color: '#FF3B30',
    },
    dangerText: {
        color: '#FF3B30',
        backgroundColor: '#fff5f5',
    },
    saveButton: {
        width: '100%',
        height: 48,
        backgroundColor: '#000000',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    qrcodeContainer: {
        alignItems: 'center',
        marginBottom: 16,
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
    },
    resultLabel: {
        fontSize: 14,
        color: '#666666',
        marginBottom: 12,
    },
});
