
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

// 必须在其他任何导入之前设置
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

// 全局 Buffer polyfill
global.Buffer = Buffer;
if (typeof global.Buffer.isBuffer === 'undefined') {
    global.Buffer.isBuffer = (arg: any): arg is Buffer => arg instanceof Buffer;
}

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
    anchor: '(tabs)',
};

export default function RootLayout() {
    const colorScheme = useColorScheme();

    return (
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen name="wallet-management" options={{ title: '钱包管理' }} />
                <Stack.Screen name="create-wallet" options={{ title: '创建钱包' }} />
                <Stack.Screen name="create-address" options={{ title: '创建地址' }} />
                <Stack.Screen name="address-list" options={{ title: '地址管理' }} />
                <Stack.Screen name="tx-detail" options={{ title: '交易详情' }} />
                <Stack.Screen name="transactions" options={{ title: '交易历史' }} />
            </Stack>
            <StatusBar style="auto" />
        </ThemeProvider>
    );
}