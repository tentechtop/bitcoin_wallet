import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Palette, statusBarHeight } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { clearApiBaseUrl, getApiBaseUrl, setApiBaseUrl } from '@/utils/networkConfig';

export default function NetworkSettingsScreen() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then(setValue).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await setApiBaseUrl(value);
      setValue(saved);
      Alert.alert('已保存', '后续余额、交易记录和广播请求将使用此节点。');
    } catch (error) {
      Alert.alert('节点地址无效', error instanceof Error ? error.message : '请检查节点地址后重试');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    await clearApiBaseUrl();
    setValue('');
    Alert.alert('已清除', '链上请求已暂停，请配置可用节点后再刷新余额。');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="返回">
          <Ionicons name="chevron-back" size={24} color={Palette.ink} />
        </TouchableOpacity>
        <ThemedText style={styles.title}>网络状态</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.label}>链上节点地址</ThemedText>
        <ThemedText style={styles.hint}>请输入链上服务的基础 URL，例如 https://node.example.com/bitcoin/chain</ThemedText>
        {loading ? <ActivityIndicator color={Palette.accent} style={styles.loader} /> : (
          <TextInput
            value={value}
            onChangeText={setValue}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://..."
            placeholderTextColor={Palette.muted}
            style={styles.input}
            editable={!saving}
          />
        )}
        <ThemedText style={styles.securityHint}>远程节点必须使用 HTTPS，本机 localhost 可用于开发调试。</ThemedText>
        <TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving || loading}>
          {saving ? <ActivityIndicator color={Palette.ink} /> : <ThemedText style={styles.primaryButtonText}>保存节点</ThemedText>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={clear} disabled={saving}>
          <ThemedText style={styles.secondaryButtonText}>清除节点配置</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.canvas, paddingHorizontal: 20, paddingTop: statusBarHeight + 10 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.line },
  title: { flex: 1, color: Palette.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  headerSpacer: { width: 42 },
  card: { backgroundColor: Palette.surface, borderRadius: 20, borderWidth: 1, borderColor: Palette.line, padding: 18 },
  label: { color: Palette.ink, fontSize: 16, fontWeight: '800' },
  hint: { color: Palette.slate, fontSize: 12, lineHeight: 18, marginTop: 7 },
  loader: { marginVertical: 18 },
  input: { color: Palette.ink, backgroundColor: Palette.canvas, borderWidth: 1, borderColor: Palette.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginTop: 16, fontSize: 14 },
  securityHint: { color: Palette.muted, fontSize: 11, lineHeight: 16, marginTop: 9 },
  primaryButton: { backgroundColor: Palette.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 46, marginTop: 20 },
  primaryButtonText: { color: Palette.ink, fontSize: 14, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', paddingVertical: 14 },
  secondaryButtonText: { color: Palette.slate, fontSize: 13, fontWeight: '700' },
});
