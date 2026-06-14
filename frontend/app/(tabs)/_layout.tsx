import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

import { COLORS, RADIUS } from '@/src/theme';

export default function TabsLayout() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: COLORS.brandPrimary,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarStyle: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 78,
            paddingBottom: 18,
            paddingTop: 10,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: COLORS.border,
            backgroundColor:
              Platform.OS === 'ios' ? 'rgba(255,255,255,0.85)' : '#FFFFFF',
          },
          tabBarBackground:
            Platform.OS === 'ios'
              ? () => (
                  <BlurView
                    tint="light"
                    intensity={70}
                    style={StyleSheet.absoluteFill}
                  />
                )
              : undefined,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: 'Transactions',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="add-tab"
          options={{
            title: '',
            tabBarIcon: () => (
              <View style={styles.fab} testID="add-fab-tab-icon">
                <Ionicons name="add" size={28} color={COLORS.onBrandPrimary} />
              </View>
            ),
            tabBarButton: (props) => (
              <Pressable
                testID="add-fab-button"
                onPress={() => router.push('/add')}
                style={[props.style as any, { alignItems: 'center', justifyContent: 'center' }]}
              >
                {props.children}
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen
          name="budgets"
          options={{
            title: 'Budgets',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="wallet" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            title: 'Insights',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="stats-chart" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
});
