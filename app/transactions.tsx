// app/settings.tsx
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet } from 'react-native';
import { statusBarHeight } from '@/constants/theme';

export default function SettingsScreen() {
    return (
        <ThemedView style={styles.container}>
            <ThemedText type="title">交易历史</ThemedText>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        paddingTop: 20 + statusBarHeight,
    },
});