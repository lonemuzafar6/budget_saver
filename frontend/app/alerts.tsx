import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
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

export default function AlertsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [a, an] = await Promise.all([api.listAlerts(), api.listAnomalies()]);
      setAlerts(a.alerts || []);
      setAnomalies(an.anomalies || []);
    } catch (e) {
      console.warn('alerts', e);
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

  return (
    <SafeAreaView edges={['top']} style={styles.container} testID="alerts-screen">
      <View style={styles.header}>
        <Pressable testID="alerts-back" style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: SPACING.md }}>
          <Text style={styles.title}>Alerts</Text>
          <Text style={styles.subtitle}>{monthLabel(currentMonth())}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        >
          {alerts.length === 0 && anomalies.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="checkmark-circle" size={42} color={COLORS.success} />
              </View>
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptyText}>
                You&apos;re within all your budgets this month.
              </Text>
              <Pressable
                testID="alerts-go-budgets"
                style={styles.primaryBtn}
                onPress={() => router.replace('/budgets')}
              >
                <Text style={styles.primaryBtnText}>Manage budgets</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {anomalies.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Unusual spending</Text>
                  {anomalies.map((a) => (
                    <View
                      key={`anomaly-${a.id}`}
                      testID={`anomaly-${a.id}`}
                      style={[styles.alertCard, { borderColor: COLORS.warning }]}
                    >
                      <View style={styles.alertHead}>
                        <View style={[styles.alertIcon, { backgroundColor: '#FFF1DA' }]}>
                          <Ionicons name="trending-up" size={20} color={COLORS.warning} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.alertTitle}>{a.merchant}</Text>
                          <Text style={styles.alertMessage}>{a.message}</Text>
                        </View>
                        <View style={[styles.severityPill, { backgroundColor: '#FFF1DA' }]}>
                          <Text style={[styles.severityText, { color: COLORS.warning }]}>
                            {a.ratio}×
                          </Text>
                        </View>
                      </View>
                      <View style={styles.alertFoot}>
                        <Text style={styles.footMeta}>
                          {a.category} • {a.date}
                        </Text>
                        <Text style={[styles.footPct, { color: COLORS.warning }]}>
                          {formatCurrency(a.amount)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {alerts.length > 0 && anomalies.length > 0 && (
                <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>
                  Budget alerts
                </Text>
              )}
              {alerts.map((a) => {
              const isOver = a.severity === 'over';
              const meta = a.category
                ? CATEGORY_META[a.category as CategoryName] || CATEGORY_META.Other
                : null;
              const accent = isOver ? COLORS.error : COLORS.warning;
              const bg = isOver ? '#FBDEDD' : '#FFF1DA';
              const pct = Math.min(Number(a.percent || 0), 100);
              return (
                <View
                  key={a.id}
                  testID={`alert-${a.id}`}
                  style={[styles.alertCard, { borderColor: accent }]}
                >
                  <View style={styles.alertHead}>
                    <View
                      style={[
                        styles.alertIcon,
                        { backgroundColor: meta ? meta.tint : bg },
                      ]}
                    >
                      <Ionicons
                        name={meta ? (meta.icon as any) : 'wallet'}
                        size={20}
                        color={meta ? meta.color : accent}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle}>{a.title}</Text>
                      <Text style={styles.alertMessage}>{a.message}</Text>
                    </View>
                    <View style={[styles.severityPill, { backgroundColor: bg }]}>
                      <Ionicons
                        name={isOver ? 'alert-circle' : 'warning'}
                        size={12}
                        color={accent}
                      />
                      <Text style={[styles.severityText, { color: accent }]}>
                        {isOver ? 'Over' : `${a.threshold}%`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.barBg}>
                    <View
                      style={[styles.barFill, { width: `${pct}%`, backgroundColor: accent }]}
                    />
                  </View>
                  <View style={styles.alertFoot}>
                    <Text style={styles.footMeta}>
                      {formatCurrency(a.spent)} of {formatCurrency(a.limit)}
                    </Text>
                    <Text style={[styles.footPct, { color: accent }]}>
                      {Math.round(Number(a.percent))}%
                    </Text>
                  </View>
                </View>
              );
            })}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F8EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: COLORS.onSurface,
    fontWeight: '800',
    fontSize: 18,
    marginTop: SPACING.lg,
  },
  emptyText: {
    color: COLORS.muted,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
  primaryBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: '700' },
  alertCard: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
  },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { color: COLORS.onSurface, fontWeight: '700', fontSize: 14 },
  alertMessage: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  severityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  severityText: { fontSize: 11, fontWeight: '700' },
  barBg: {
    marginTop: SPACING.md,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceTertiary,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  alertFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  footMeta: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  footPct: { fontSize: 14, fontWeight: '800' },
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
});
