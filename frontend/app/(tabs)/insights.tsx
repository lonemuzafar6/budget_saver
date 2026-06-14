import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
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

const MONTH_OPTIONS = [3, 4, 6];

function ymShortLabel(ym: string) {
  const [, m] = ym.split('-').map(Number);
  const date = new Date(2000, (m || 1) - 1, 1);
  return date.toLocaleString('en-US', { month: 'short' });
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const W = 80;
  const H = 28;
  const step = values.length > 1 ? W / (values.length - 1) : W;

  return (
    <View style={{ width: W, height: H, justifyContent: 'flex-end' }}>
      {values.map((v, i) => {
        const h = max > 0 ? Math.max(2, (v / max) * H) : 2;
        const left = i * step;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left,
              bottom: 0,
              width: Math.max(step - 3, 4),
              height: h,
              backgroundColor: v > 0 ? color : COLORS.surfaceTertiary,
              borderRadius: 2,
              opacity: i === values.length - 1 ? 1 : 0.55,
            }}
          />
        );
      })}
    </View>
  );
}

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(4);
  const [data, setData] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [t, d] = await Promise.all([api.trends(months), api.dashboard()]);
      setData(t);
      setDashboard(d);
    } catch (e) {
      console.warn('insights', e);
    } finally {
      setLoading(false);
    }
  }, [months]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const lineData = useMemo(
    () =>
      (data?.series_total || []).map((p: any) => ({
        value: p.amount,
        label: ymShortLabel(p.month),
        dataPointText: '',
      })),
    [data]
  );

  const maxMonthly = useMemo(
    () => Math.max(...(data?.series_total || []).map((p: any) => p.amount), 1),
    [data]
  );

  const lastTotal = lineData.length ? lineData[lineData.length - 1].value : 0;
  const prevTotal = lineData.length > 1 ? lineData[lineData.length - 2].value : 0;
  const delta = lastTotal - prevTotal;
  const deltaPct = prevTotal > 0 ? (delta / prevTotal) * 100 : 0;

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
              <Text style={styles.statLabel}>This month</Text>
              <Text style={styles.statValue} testID="insight-total">
                {formatCurrency(dashboard?.total || 0)}
              </Text>
              {prevTotal > 0 && (
                <Text
                  style={[
                    styles.statDelta,
                    { color: delta >= 0 ? COLORS.error : COLORS.success },
                  ]}
                >
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(deltaPct))}% vs last
                </Text>
              )}
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Transactions</Text>
              <Text style={styles.statValue}>{dashboard?.count || 0}</Text>
            </View>
          </View>

          {/* Monthly trend line chart */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Monthly spend trend</Text>
                <Text style={styles.cardSub}>Last {months} months</Text>
              </View>
              <View style={styles.rangeChips}>
                {MONTH_OPTIONS.map((m) => {
                  const active = months === m;
                  return (
                    <Pressable
                      key={m}
                      testID={`range-${m}`}
                      style={[styles.rangeChip, active && styles.rangeChipActive]}
                      onPress={() => setMonths(m)}
                    >
                      <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
                        {m}M
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {lineData.length === 0 || data?.grand_total === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="analytics-outline" size={36} color={COLORS.muted} />
                <Text style={styles.emptyText}>No data yet.</Text>
              </View>
            ) : (
              <View style={{ marginTop: SPACING.md, marginLeft: -8 }}>
                <LineChart
                  data={lineData}
                  height={150}
                  initialSpacing={20}
                  endSpacing={20}
                  curved
                  color={COLORS.brandPrimary}
                  thickness={2.5}
                  yAxisColor="transparent"
                  xAxisColor={COLORS.border}
                  yAxisTextStyle={{ color: COLORS.muted, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: COLORS.muted, fontSize: 10 }}
                  hideRules
                  dataPointsColor={COLORS.brandPrimary}
                  dataPointsRadius={4}
                  startFillColor={COLORS.brandSecondary}
                  startOpacity={0.4}
                  endFillColor={COLORS.surfaceSecondary}
                  endOpacity={0}
                  areaChart
                  noOfSections={4}
                  maxValue={maxMonthly * 1.2}
                  spacing={(280 - 40) / Math.max(lineData.length - 1, 1)}
                />
              </View>
            )}
          </View>

          {/* Per-category trends */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Category trends</Text>
            <Text style={styles.cardSub}>Sparklines show last {months} months</Text>
            {(data?.by_category || []).length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: SPACING.md }]}>
                Add expenses to see category trends.
              </Text>
            ) : (
              (data?.by_category || []).slice(0, 8).map((c: any) => {
                const meta = CATEGORY_META[c.category as CategoryName] || CATEGORY_META.Other;
                const last = c.values[c.values.length - 1] || 0;
                const prev = c.values[c.values.length - 2] || 0;
                const dlt = last - prev;
                const dltPct = prev > 0 ? Math.round((dlt / prev) * 100) : 0;
                return (
                  <View key={c.category} style={styles.catRow} testID={`trend-${c.category}`}>
                    <View style={[styles.iconBox, { backgroundColor: meta.tint }]}>
                      <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.catName}>{c.category}</Text>
                      <Text style={styles.catMeta}>
                        Avg {formatCurrency(c.avg)}/mo
                        {prev > 0 ? (
                          <Text style={{ color: dlt >= 0 ? COLORS.error : COLORS.success }}>
                            {'  •  '}
                            {dlt >= 0 ? '▲' : '▼'} {Math.abs(dltPct)}%
                          </Text>
                        ) : null}
                      </Text>
                    </View>
                    <Sparkline values={c.values} color={meta.color} />
                    <Text style={styles.catAmt}>{formatCurrency(last)}</Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Top categories this month */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top categories this month</Text>
            {(dashboard?.by_category || []).slice(0, 5).map((c: any) => {
              const meta = CATEGORY_META[c.category as CategoryName] || CATEGORY_META.Other;
              const pct = dashboard?.total ? Math.round((c.amount / dashboard.total) * 100) : 0;
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
            {(dashboard?.by_category || []).length === 0 && (
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
  statDelta: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  card: {
    backgroundColor: COLORS.surfaceSecondary,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  cardSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  rangeChips: { flexDirection: 'row', gap: 6 },
  rangeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceTertiary,
  },
  rangeChipActive: { backgroundColor: COLORS.brandPrimary },
  rangeChipText: { color: COLORS.onSurfaceTertiary, fontSize: 11, fontWeight: '700' },
  rangeChipTextActive: { color: COLORS.onBrandPrimary },
  empty: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyText: { color: COLORS.muted, marginTop: 8 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: { color: COLORS.onSurface, fontWeight: '700', fontSize: 13 },
  catMeta: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  catAmt: { color: COLORS.onSurface, fontWeight: '800', fontSize: 13, minWidth: 60, textAlign: 'right' },
  topRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md, gap: SPACING.md },
  topCat: { color: COLORS.onSurface, fontWeight: '700', fontSize: 14 },
  topPct: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  topAmt: { color: COLORS.onSurface, fontWeight: '800', fontSize: 14 },
});
