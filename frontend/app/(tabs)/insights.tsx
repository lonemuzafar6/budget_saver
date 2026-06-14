import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { BarChart } from 'react-native-gifted-charts';
import { Ionicons } from '@expo/vector-icons';

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

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.dashboard();
      setData(res);
    } catch (e) {
      console.warn('insights', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const barData =
    data?.by_category?.map((c: any) => ({
      value: c.amount,
      label: c.category.slice(0, 4),
      frontColor: CATEGORY_META[c.category as CategoryName]?.color || COLORS.brandPrimary,
      topLabelComponent: () => (
        <Text style={{ fontSize: 9, color: COLORS.muted }}>{Math.round(c.amount)}</Text>
      ),
    })) || [];

  const max = data?.total ? Math.max(...(data?.by_category || []).map((c: any) => c.amount)) : 0;

  return (
    <SafeAreaView edges={['top']} style={styles.container} testID="insights-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.subtitle}>{monthLabel(currentMonth())}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: SPACING.lg,
            paddingBottom: 120 + insets.bottom,
          }}
        >
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total spent</Text>
              <Text style={styles.statValue} testID="insight-total">
                {formatCurrency(data?.total || 0)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Transactions</Text>
              <Text style={styles.statValue}>{data?.count || 0}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Spending by category</Text>
            {barData.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="bar-chart-outline" size={36} color={COLORS.muted} />
                <Text style={styles.emptyText}>No data this month.</Text>
              </View>
            ) : (
              <View style={{ marginTop: SPACING.lg }}>
                <BarChart
                  data={barData}
                  barWidth={26}
                  barBorderRadius={6}
                  spacing={14}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  noOfSections={4}
                  maxValue={max * 1.2}
                  yAxisTextStyle={{ color: COLORS.muted, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: COLORS.muted, fontSize: 10 }}
                  hideRules
                />
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top categories</Text>
            {(data?.by_category || []).slice(0, 5).map((c: any, i: number) => {
              const meta = CATEGORY_META[c.category as CategoryName] || CATEGORY_META.Other;
              const pct = data?.total ? Math.round((c.amount / data.total) * 100) : 0;
              return (
                <View key={c.category} style={styles.topRow}>
                  <View style={[styles.iconBox, { backgroundColor: meta.tint }]}>
                    <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topCat}>{c.category}</Text>
                    <Text style={styles.topPct}>{pct}% of total</Text>
                  </View>
                  <Text style={styles.topAmt}>{formatCurrency(c.amount)}</Text>
                </View>
              );
            })}
            {(data?.by_category || []).length === 0 && (
              <Text style={styles.emptyText}>Add expenses to see insights.</Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceSecondary,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  statLabel: { color: COLORS.muted, fontSize: 12 },
  statValue: { color: COLORS.onSurface, fontSize: 20, fontWeight: '800', marginTop: 4 },
  card: {
    backgroundColor: COLORS.surfaceSecondary,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  empty: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyText: { color: COLORS.muted, marginTop: 8 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  topCat: { color: COLORS.onSurface, fontWeight: '700', fontSize: 14 },
  topPct: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  topAmt: { color: COLORS.onSurface, fontWeight: '800', fontSize: 14 },
});
