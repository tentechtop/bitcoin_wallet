import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { Palette, statusBarHeight } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { multiWalletStorage, WalletAddress } from '@/utils/secureStorage';

export default function SecuritySettingsScreen() {
  const { walletId } = useLocalSearchParams<{ walletId: string }>();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    if (!walletId) {
      Alert.alert('提示', '未选择钱包');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('提示', '新密码至少需要 8 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('提示', '两次输入的新密码不一致');
      return;
    }

    setSaving(true);
    try {
      const valid = await multiWalletStorage.verifyWalletPassword(walletId, currentPassword);
      if (!valid) {
        Alert.alert('无法修改', '当前钱包密码不正确');
        return;
      }

      const wallet = await multiWalletStorage.getWalletById(walletId);
      if (!wallet) {
        Alert.alert('无法修改', '钱包不存在');
        return;
      }

      const mnemonic = multiWalletStorage.decryptMnemonic(wallet.encryptedMnemonic, currentPassword);
      const seed = multiWalletStorage.decryptSeed(wallet.encryptedSeed, currentPassword);
      if (mnemonic === null || seed === null) {
        Alert.alert('无法修改', '钱包数据解密失败');
        return;
      }

      const addresses = wallet.addresses.map(address => {
        if (typeof address === 'string' || !address.encryptedPrivateKey) return address;
        const privateKey = multiWalletStorage.decryptPrivateKey(address.encryptedPrivateKey, currentPassword);
        if (!privateKey) throw new Error('地址私钥解密失败，请先完成钱包数据迁移');
        return { ...address, privateKey } as WalletAddress;
      });

      const updated = await multiWalletStorage.updateWallet(
        walletId,
        { mnemonic, seed, password: newPassword, addresses },
        newPassword,
      );
      if (!updated) throw new Error('保存新密码失败');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('已更新', '钱包密码已修改，之后请使用新密码签名和备份。', [{ text: '完成', onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert('修改失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={Palette.ink} />
          <ThemedText style={styles.backText}>返回</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.overline}>SECURITY</ThemedText>
        <ThemedText style={styles.title}>安全设置</ThemedText>
        <ThemedText style={styles.subtitle}>修改密码会重新加密助记词、种子和已保存的地址密钥。</ThemedText>

        <View style={styles.warningCard}>
          <Ionicons name="shield-checkmark-outline" size={23} color={Palette.success} />
          <ThemedText style={styles.warningText}>新密码不会上传到节点，也无法通过应用恢复。</ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.label}>当前密码</ThemedText>
          <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="输入当前密码" placeholderTextColor={Palette.muted} />
          <ThemedText style={[styles.label, styles.spacedLabel]}>新密码</ThemedText>
          <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="至少 8 位" placeholderTextColor={Palette.muted} />
          <TextInput style={[styles.input, styles.confirmInput]} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="再次输入新密码" placeholderTextColor={Palette.muted} />
          <TouchableOpacity style={styles.primaryButton} onPress={changePassword} disabled={saving}>
            {saving ? <ActivityIndicator color={Palette.ink} /> : <ThemedText style={styles.primaryButtonText}>更新钱包密码</ThemedText>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.canvas },
  content: { paddingHorizontal: 20, paddingTop: statusBarHeight + 14, paddingBottom: 34 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 28 },
  backText: { color: Palette.ink, fontSize: 14, fontWeight: '700' },
  overline: { color: Palette.slate, fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  title: { color: Palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', marginTop: 4 },
  subtitle: { color: Palette.slate, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 20 },
  warningCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 16, backgroundColor: '#E9F9F1', marginBottom: 16 },
  warningText: { flex: 1, color: '#16794B', fontSize: 12, lineHeight: 18 },
  card: { backgroundColor: Palette.surface, borderRadius: 20, borderWidth: 1, borderColor: Palette.line, padding: 18 },
  label: { color: Palette.slate, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  spacedLabel: { marginTop: 18 },
  input: { height: 48, borderRadius: 13, borderWidth: 1, borderColor: Palette.line, backgroundColor: Palette.canvas, paddingHorizontal: 14, color: Palette.ink, fontSize: 14 },
  confirmInput: { marginTop: 10 },
  primaryButton: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.accent, marginTop: 18 },
  primaryButtonText: { color: Palette.ink, fontSize: 14, fontWeight: '800' },
});
