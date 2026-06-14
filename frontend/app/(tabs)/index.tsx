import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-gifted-charts';
import { LinearGradient } from 'expo-linear-gradient';

import { api } from '@/src/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  CATEGORY_META,
  CategoryName,
  formatCurrency,
  monthLabel,
  currentMonth,
} from '@/src/theme';

const PIE_COLORS = [
  '#3B6352',
  '#FF6B35',
  '#D4A017',
  '#0A84B5',
  '#8E44AD',
  '#E91E63',
  '#E53935',
  '#6E6E73',
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.dashboard();
      setData(res);
    } catch (e) {
      console.warn('dashboard load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const pieData =
    data?.by_category?.map((c: any, i: number) => ({
      value: c.amount,
      color: CATEGORY_META[c.category as CategoryName]?.color || PIE_COLORS[i % PIE_COLORS.length],
      gradientCenterColor:
        CATEGORY_META[c.category as CategoryName]?.color || PIE_COLORS[i % PIE_COLORS.length],
    })) || [];

  return (
    <SafeAreaView edges={['top']} style={styles.container} testID="home-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSub}>{monthLabel(currentMonth())}</Text>
        </View>
        <Pressable
          testID="home-add-icon"
          style={styles.headerBtn}
          onPress={() => router.push('/add')}
        >
          <Ionicons name="add" size={22} color={COLORS.brand} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={COLORS.brand} />
          </View>
        ) : (
          <>
            <LinearGradient
              colors={[COLORS.brandTertiary, COLORS.surfaceSecondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={styles.heroLabel}>Total spent this month</Text>
              <Text style={styles.heroAmount} testID="dashboard-total">
                {formatCurrency(data?.total || 0)}
              </Text>
              <Text style={styles.heroMeta}>
                {data?.count || 0} {data?.count === 1 ? 'transaction' : 'transactions'}
              </Text>
            </LinearGradient>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Category breakdown</Text>
              {pieData.length === 0 ? (
                <View style={styles.emptyChart}>
                  <Ionicons name="pie-chart-outline" size={36} color={COLORS.muted} />
                  <Text style={styles.emptyText}>No spending yet this month</Text>
                  <Pressable
                    testID="empty-add-cta"
                    style={styles.primaryBtn}
                    onPress={() => router.push('/add')}
                  >
                    <Text style={styles.primaryBtnText}>Add expense</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.chartRow}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={80}
                    innerRadius={55}
                    innerCircleColor={COLORS.surfaceSecondary}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.donutCenterAmt}>
                          {formatCurrency(data?.total || 0)}
                        </Text>
                        <Text style={styles.donutCenterLabel}>Total</Text>
                      </View>
                    )}
                  />
                  <View style={{ flex: 1, marginLeft: SPACING.lg }}>
                    {data?.by_category?.slice(0, 5).map((c: any) => {
                      const meta = CATEGORY_META[c.category as CategoryName] || CATEGORY_META.Other;
                      return (
                        <View key={c.category} style={styles.legendRow}>
                          <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                          <Text style={styles.legendCat}>{c.category}</Text>
                          <Text style={styles.legendAmt}>{formatCurrency(c.amount)}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent transactions</Text>
              <Pressable testID="home-see-all" onPress={() => router.push('/transactions')}>
                <Text style={styles.linkText}>See all</Text>
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: SPACING.lg }}>
              {(data?.recent || []).length === 0 ? (
                <View style={styles.emptyList}>
                  <Text style={styles.emptyText}>Nothing here yet.</Text>
                </View>
              ) : (
                data.recent.map((e: any) => {
                  const meta =
                    CATEGORY_META[e.category as CategoryName] || CATEGORY_META.Other;
                  return (
                    <Pressable
                      key={e.id}
                      testID={`home-tx-${e.id}`}
                      style={styles.txRow}
                      onPress={() => router.push(`/expense/${e.id}`)}
                    >
                      <View style={[styles.txIcon, { backgroundColor: meta.tint }]}>
                        <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txMerchant} numberOfLines={1}>
                          {e.merchant}
                        </Text>
                        <Text style={styles.txMeta}>
                          {e.category} • {e.date}
                        </Text>
                      </View>
                      <Text style={styles.txAmt}>{formatCurrency(e.amount)}</Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: COLORS.onSurface },
  headerSub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: { paddingVertical: 80, alignItems: 'center' },
  hero: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.brandSecondary,
  },
  heroLabel: { color: COLORS.onBrandTertiary, fontSize: 13, fontWeight: '600' },
  heroAmount: {
    color: COLORS.brand,
    fontSize: 36,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: -0.5,
  },
  heroMeta: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  card: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.lg },
  donutCenterAmt: { color: COLORS.brand, fontSize: 15, fontWeight: '800' },
  donutCenterLabel: { color: COLORS.muted, fontSize: 11 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  legendCat: { flex: 1, color: COLORS.onSurface, fontSize: 13, fontWeight: '600' },
  legendAmt: { color: COLORS.onSurface, fontSize: 13, fontWeight: '700' },
  emptyChart: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyText: { color: COLORS.muted, marginTop: 8 },
  primaryBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.onSurface },
  linkText: { color: COLORS.brandPrimary, fontSize: 13, fontWeight: '600' },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  txMerchant: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  txMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  txAmt: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  emptyList: { paddingVertical: SPACING.xl, alignItems: 'center' },
});
