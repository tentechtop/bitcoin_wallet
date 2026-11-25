import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';

import { Palette, statusBarHeight } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { multiWalletStorage } from '@/utils/secureStorage';

export default function BackupWalletScreen() {
  const { walletId } = useLocalSearchParams<{ walletId: string }>();
  const [password, setPassword] = useState('');
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);

  const unlockBackup = async () => {
    if (!walletId || !password) {
      Alert.alert('提示', '请输入钱包密码');
      return;
    }

    setLoading(true);
    try {
      const valid = await multiWalletStorage.verifyWalletPassword(walletId, password);
      if (!valid) {
        Alert.alert('无法解锁', '钱包密码不正确');
        return;
      }

      const wallet = await multiWalletStorage.getWalletById(walletId);
      const decrypted = wallet ? multiWalletStorage.decryptMnemonic(wallet.encryptedMnemonic, password) : null;
      if (!decrypted) {
        Alert.alert('无法解锁', '助记词解密失败');
        return;
      }
      setMnemonic(decrypted);
      setRevealed(false);
    } catch (error) {
      console.error('解锁备份失败:', error);
      Alert.alert('无法解锁', error instanceof Error ? error.message : '读取钱包数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const copyMnemonic = async () => {
    if (!mnemonic) return;
    await Clipboard.setStringAsync(mnemonic);
    Alert.alert('已复制', '助记词已复制，请在使用后清理剪贴板');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={Palette.ink} />
          <ThemedText style={styles.backText}>返回</ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.overline}>BACKUP</ThemedText>
        <ThemedText style={styles.title}>备份助记词</ThemedText>
        <ThemedText style={styles.subtitle}>助记词是恢复钱包的唯一凭证，请只在可信设备上查看。</ThemedText>

        <View style={styles.warningCard}>
          <View style={styles.warningIcon}><Ionicons name="warning-outline" size={22} color={Palette.accentDark} /></View>
          <View style={styles.warningCopy}>
            <ThemedText style={styles.warningTitle}>请勿截图或分享</ThemedText>
            <ThemedText style={styles.warningText}>任何获得助记词的人都可以控制钱包资产。</ThemedText>
          </View>
        </View>

        {!mnemonic ? (
          <View style={styles.card}>
            <ThemedText style={styles.label}>钱包密码</ThemedText>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="输入密码以解锁备份"
              placeholderTextColor={Palette.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={unlockBackup} disabled={loading}>
              {loading ? <ActivityIndicator color={Palette.ink} /> : <ThemedText style={styles.primaryButtonText}>验证并查看</ThemedText>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText style={styles.cardTitle}>恢复短语</ThemedText>
              <TouchableOpacity onPress={() => setRevealed(value => !value)} accessibilityRole="button">
                <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={21} color={Palette.accentDark} />
              </TouchableOpacity>
            </View>
            <View style={styles.wordsGrid}>
              {mnemonic.trim().split(/\s+/).map((word, index) => (
                <View key={index} style={styles.wordItem}>
                  <ThemedText style={styles.wordIndex}>{String(index + 1).padStart(2, '0')}</ThemedText>
                  <ThemedText style={styles.wordText}>{revealed ? word : '••••••'}</ThemedText>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.copyButton} onPress={copyMnemonic}>
              <Ionicons name="copy-outline" size={18} color={Palette.ink} />
              <ThemedText style={styles.copyText}>复制助记词</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setMnemonic(null); setPassword(''); }}>
              <ThemedText style={styles.secondaryButtonText}>重新验证</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.canvas },
  content: { paddingHorizontal: 20, paddingTop: statusBarHeight + 14, paddingBottom: 36 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 28 },
  backText: { color: Palette.ink, fontSize: 14, fontWeight: '700' },
  overline: { color: Palette.slate, fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  title: { color: Palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', marginTop: 4 },
  subtitle: { color: Palette.slate, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 20 },
  warningCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 17, backgroundColor: Palette.accentSoft, marginBottom: 16 },
  warningIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  warningCopy: { flex: 1, marginLeft: 12 },
  warningTitle: { color: Palette.ink, fontSize: 13, fontWeight: '800' },
  warningText: { color: Palette.slate, fontSize: 11, marginTop: 3 },
  card: { backgroundColor: Palette.surface, borderRadius: 20, borderWidth: 1, borderColor: Palette.line, padding: 18 },
  label: { color: Palette.slate, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: { height: 48, borderRadius: 13, borderWidth: 1, borderColor: Palette.line, backgroundColor: Palette.canvas, paddingHorizontal: 14, color: Palette.ink, fontSize: 14 },
  primaryButton: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.accent, marginTop: 14 },
  primaryButtonText: { color: Palette.ink, fontSize: 14, fontWeight: '800' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { color: Palette.ink, fontSize: 16, fontWeight: '800' },
  wordsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordItem: { width: '31%', minHeight: 42, flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, backgroundColor: Palette.canvas },
  wordIndex: { color: Palette.muted, fontSize: 10, width: 19 },
  wordText: { color: Palette.ink, fontSize: 12, fontWeight: '700' },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: 13, backgroundColor: Palette.accentSoft, marginTop: 16 },
  copyText: { color: Palette.ink, fontSize: 14, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 8 },
  secondaryButtonText: { color: Palette.slate, fontSize: 13, fontWeight: '700' },
});
