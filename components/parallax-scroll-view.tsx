import { StyleSheet, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

// 修改Props类型：只保留children，且设为可选（避免不传children时报错）
type Props = {
    children?: React.ReactNode; // 加?表示可选
};

export default function ParallaxScrollView({ children }: Props) {
    const backgroundColor = useThemeColor({}, 'background');

    return (
        <ScrollView
            style={{ backgroundColor, flex: 1 }}
            contentContainerStyle={styles.content}
        >
            <ThemedView style={styles.contentContainer}>{children}</ThemedView>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    contentContainer: {
        paddingBottom: 32,
    },
});