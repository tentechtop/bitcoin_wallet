import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { statusBarHeight } from '@/constants/theme';
import { multiWalletStorage } from '@/utils/secureStorage';
import * as bip39 from 'bip39';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

export default function CreateWalletScreen() {
  const [walletName, setWalletName] = useState('新钱包');
  const [mnemonic, setMnemonic] = useState('');
  const [inputMnemonic, setInputMnemonic] = useState('');
  const [seed, setSeed] = useState('');
  const [mnemonicPassword, setMnemonicPassword] = useState('');
  const [languageList] = useState(['English', '简体中文', '繁體中文', '日本語', '한국어']);
  const [languageCodes] = useState(['english', 'chinese_simplified', 'chinese_traditional', 'japanese', 'korean']);
  const [selectedLanguageIndex, setSelectedLanguageIndex] = useState(0);
  const [wordCountOptions] = useState([12, 18, 24]);
  const [selectedWordCountIndex, setSelectedWordCountIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const hasMnemonic = mnemonic && mnemonic.length > 0;
  const hasSeed = seed && seed.length > 0;
  const hasInputMnemonic = inputMnemonic && inputMnemonic.trim().length > 0;

  const handleGenerateMnemonic = () => {
    try {
      setIsGenerating(true);
      const languageCode = languageCodes[selectedLanguageIndex];
      const wordlist = bip39.wordlists[languageCode];
      const wordCount = wordCountOptions[selectedWordCountIndex];
      const strength = Math.floor(wordCount * 32 / 3);
      
      const newMnemonic = bip39.generateMnemonic(strength, undefined, wordlist);
      setMnemonic(newMnemonic);
      
      // 自动生成种子
      const password = mnemonicPassword?.trim() || '';
      const seedBuffer = bip39.mnemonicToSeedSync(newMnemonic, password);
      setSeed(seedBuffer.toString('hex'));
      
      Alert.alert('成功', '助记词已生成，请妥善保管！');
    } catch (error) {
      console.error('生成助记词失败:', error);
      Alert.alert('错误', '生成助记词失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVerifyMnemonic = () => {
    try {
      if (!inputMnemonic || inputMnemonic.trim().length === 0) {
        Alert.alert('提示', '请输入助记词');
        return;
      }

      const normalizedMnemonic = inputMnemonic.trim().replace(/\s+/g, ' ');
      let isValid = false;
      let languageIdx = 0;

      // 尝试所有语言验证
      for (let i = 0; i < languageCodes.length; i++) {
        const wordlist = bip39.wordlists[languageCodes[i]];
        if (bip39.validateMnemonic(normalizedMnemonic, wordlist)) {
          isValid = true;
          languageIdx = i;
          break;
        }
      }

      if (!isValid) {
        Alert.alert('错误', '助记词无效');
        return;
      }

      setSelectedLanguageIndex(languageIdx);
      setMnemonic(normalizedMnemonic);
      
      // 生成种子
      const password = mnemonicPassword?.trim() || '';
      const seedBuffer = bip39.mnemonicToSeedSync(normalizedMnemonic, password);
      setSeed(seedBuffer.toString('hex'));
      setInputMnemonic('');
      
      Alert.alert('成功', '助记词验证成功！');
    } catch (error) {
      console.error('验证助记词失败:', error);
      Alert.alert('错误', '验证助记词失败');
    }
  };

  const handleClearMnemonic = () => {
    Alert.alert(
      '清除确认',
      '确定要清除助记词吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: () => {
            setMnemonic('');
            setInputMnemonic('');
            setSeed('');
          }
        }
      ]
    );
  };

    const handleCopyMnemonic = async () => {
        try {
            if (!mnemonic) {
                Alert.alert('提示', '暂无助记词可复制');
                return;
            }
            // 正确调用：直接使用Clipboard.setStringAsync，无default
            await Clipboard.setStringAsync(mnemonic);
            Alert.alert('成功', '助记词已复制到剪贴板');
        } catch (error) {
            console.error('复制助记词失败:', error);
            Alert.alert('错误', '复制助记词失败');
        }
    };


    const handleCopySeed = async () => {
        try {
            if (!seed) {
                Alert.alert('提示', '暂无种子可复制');
                return;
            }
            await Clipboard.setStringAsync(seed);
            Alert.alert('成功', '种子已复制到剪贴板');
        } catch (error) {
            console.error('复制种子失败:', error);
            Alert.alert('错误', '复制种子失败');
        }
    };

  const handleSaveWallet = async () => {
    if (!walletName || walletName.trim().length === 0) {
      Alert.alert('提示', '请输入钱包名称');
      return;
    }

    if (!mnemonic || !seed) {
      Alert.alert('提示', '请先生成或导入助记词');
      return;
    }

    if (!mnemonicPassword || mnemonicPassword.trim().length === 0) {
      Alert.alert(
        '提示',
        '请设置钱包密码以保护您的助记词',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '好的',
            onPress: () => {
              // 用户确认,继续保存
              // 但这里需要密码,所以还是返回
            }
          }
        ]
      );
      return;
    }

    try {
      setIsGenerating(true);
      
      const walletData = {
        name: walletName.trim(),
        mnemonic,
        seed,
        password: mnemonicPassword.trim(),
        networkUrl: ''
      };

      const result = await multiWalletStorage.saveWallet(walletData, mnemonicPassword.trim());
      
      if (result) {
        Alert.alert(
          '成功',
          '钱包创建成功！请务必妥善保管您的助记词和密码。',
          [
            {
              text: '确定',
              onPress: () => router.back()
            }
          ]
        );
      } else {
        Alert.alert('错误', '保存钱包失败');
      }
    } catch (error) {
      console.error('保存钱包失败:', error);
      Alert.alert('错误', '保存钱包失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const onLanguageChange = (index: number) => {
    setSelectedLanguageIndex(index);
    if (mnemonic) {
      setMnemonic('');
      setSeed('');
    }
  };

  const onWordCountChange = (index: number) => {
    setSelectedWordCountIndex(index);
    if (mnemonic) {
      setMnemonic('');
      setSeed('');
    }
  };

  return (
    <View style={styles.container}>
        <ScrollView style={styles.scrollView} >
            {/* 钱包信息卡片 */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>钱包信息</Text>
                <View style={styles.formItem}>
                    <Text style={styles.formLabel}>钱包名称</Text>
                    <TextInput
                        style={styles.formInput}
                        value={walletName}
                        onChangeText={setWalletName}
                        placeholder="请输入钱包名称"
                        placeholderTextColor="#999"
                    />
                </View>
            </View>
            {/* 助记词设置卡片 */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>助记词设置</Text>
                <View style={styles.formItem}>
                    <Text style={styles.formLabel}>语言</Text>
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerText}>{languageList[selectedLanguageIndex]}</Text>
                        <View style={styles.pickerButtons}>
                            {languageList.map((_, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.pickerButton,
                                        selectedLanguageIndex === index && styles.pickerButtonActive
                                    ]}
                                    onPress={() => onLanguageChange(index)}
                                >
                                    <Text style={[
                                        styles.pickerButtonText,
                                        selectedLanguageIndex === index && styles.pickerButtonTextActive
                                    ]}>
                                        {languageList[index]}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                <View style={styles.formItem}>
                    <Text style={styles.formLabel}>单词数量</Text>
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerText}>{wordCountOptions[selectedWordCountIndex]} 个单词</Text>
                        <View style={styles.pickerButtons}>
                            {wordCountOptions.map((count, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.pickerButton,
                                        selectedWordCountIndex === index && styles.pickerButtonActive
                                    ]}
                                    onPress={() => onWordCountChange(index)}
                                >
                                    <Text style={[
                                        styles.pickerButtonText,
                                        selectedWordCountIndex === index && styles.pickerButtonTextActive
                                    ]}>
                                        {count} 词
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                <View style={styles.formItem}>
                    <Text style={styles.formLabel}>钱包密码 *</Text>
                    <TextInput
                        style={styles.formInput}
                        value={mnemonicPassword}
                        onChangeText={setMnemonicPassword}
                        placeholder="请输入钱包密码"
                        placeholderTextColor="#999"
                        secureTextEntry
                    />
                </View>

                <View style={styles.formItem}>
                    <Text style={styles.formLabel}>助记词密码（可选）</Text>
                    <TextInput
                        style={styles.formInput}
                        value={mnemonicPassword}
                        onChangeText={setMnemonicPassword}
                        placeholder="留空或输入密码"
                        placeholderTextColor="#999"
                        secureTextEntry
                    />
                </View>

                {/* 导入助记词 */}
                <View style={styles.formItem}>
                    <Text style={styles.formLabel}>导入助记词（可选）</Text>
                    <TextInput
                        style={styles.formTextarea}
                        value={inputMnemonic}
                        onChangeText={setInputMnemonic}
                        placeholder="输入12/18/24个助记词（空格分隔）或点击下方按钮生成"
                        placeholderTextColor="#999"
                        multiline
                        textAlignVertical="top"
                        numberOfLines={4}
                        editable={!hasMnemonic}
                    />
                </View>

                {/* 助记词显示 */}
                <View style={[styles.mnemonicDisplay, !hasMnemonic && styles.hidden]}>
                    <View style={styles.mnemonicHeader}>
                        <Text style={styles.mnemonicLabel}>助记词</Text>
                        <TouchableOpacity style={styles.copyButton} onPress={handleCopyMnemonic}>
                            <Text style={styles.copyButtonText}>复制</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.mnemonicText}>{mnemonic}</Text>
                </View>

                {/* 种子显示 */}
                <View style={[styles.seedDisplay, !hasSeed && styles.hidden]}>
                    <View style={styles.seedHeader}>
                        <Text style={styles.seedLabel}>种子 (Seed)</Text>
                        <TouchableOpacity style={styles.copyButton} onPress={handleCopySeed}>
                            <Text style={styles.copyButtonText}>复制</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.seedValue}>{seed}</Text>
                </View>

                {/* 按钮组 */}
                <View style={styles.buttonGroup}>
                    <TouchableOpacity
                        style={[styles.button, styles.hidden, hasInputMnemonic && !hasMnemonic && styles.visible]}
                        onPress={handleVerifyMnemonic}
                        disabled={isGenerating}
                    >
                        <Text style={styles.buttonText}>验证并保存</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.hidden, !hasInputMnemonic && !hasMnemonic && styles.visible]}
                        onPress={handleGenerateMnemonic}
                        disabled={isGenerating}
                    >
                        <Text style={styles.buttonText}>
                            {isGenerating ? '生成中...' : '生成助记词'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.dangerButton, styles.hidden, hasMnemonic && styles.visible]}
                        onPress={handleClearMnemonic}
                    >
                        <Text style={styles.buttonText}>清除助记词</Text>
                    </TouchableOpacity>
                </View>
            </View>
            <View style={{ height: 100 }} />
        </ScrollView>


        {/* 底部保存按钮 */}
        <View style={[styles.bottomBar, !hasMnemonic && styles.hidden]}>
            <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveWallet}
                disabled={isGenerating}
            >
                <Text style={styles.saveButtonText}>
                    {isGenerating ? '保存中...' : '保存钱包'}
                </Text>
            </TouchableOpacity>
        </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 12 + statusBarHeight,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#000000',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
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
  formTextarea: {
    width: '100%',
    minHeight: 100,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#000000',
  },
  pickerContainer: {
    width: '100%',
  },
  pickerText: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 8,
  },
  pickerButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 6,
  },
  pickerButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  pickerButtonText: {
    fontSize: 13,
    color: '#000000',
  },
  pickerButtonTextActive: {
    color: '#ffffff',
  },
  mnemonicDisplay: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  mnemonicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mnemonicLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  mnemonicText: {
    fontSize: 13,
    color: '#333333',
    textAlign: 'center',
    lineHeight: 20,
  },
  seedDisplay: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  seedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seedLabel: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '600',
  },
  seedValue: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#000000',
    lineHeight: 16,
  },
  copyButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  copyButtonText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  buttonGroup: {
    marginTop: 8,
    gap: 8,
  },
  button: {
    width: '100%',
    height: 48,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
  },
  saveButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#000000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  hidden: {
    display: 'none',
  },
  visible: {
    display: 'flex',
  },
});
