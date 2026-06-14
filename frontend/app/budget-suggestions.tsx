import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/src/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  CATEGORY_META,
  CategoryName,
  formatCurrency,
} from '@/src/theme';

type Suggestion = {
  category: string;
  avg: number;
  months_with_data: number;
  suggested_amount: number;
  current_amount: number | null;
  reason: string;
};

export default function BudgetSuggestionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [includeTotal, setIncludeTotal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.budgetSuggestions();
        setData(res);
        const initial: Record<string, boolean> = {};
        for (const s of res.suggestions as Suggestion[]) {
          if (s.suggested_amount > 0) initial[s.category] = true;
        }
        setSelected(initial);
        setIncludeTotal((res.total?.suggested_amount || 0) > 0);
      } catch (e) {
        console.warn('suggestions', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const eligible: Suggestion[] = useMemo(
    () => (data?.suggestions || []).filter((s: Suggestion) => s.suggested_amount > 0),
    [data]
  );

  const selectedCount = useMemo(
    () => eligible.filter((s) => selected[s.category]).length + (includeTotal ? 1 : 0),
    [eligible, selected, includeTotal]
  );

  const totalSuggestedSum = useMemo(
    () =>
      eligible
        .filter((s) => selected[s.category])
        .reduce((sum, s) => sum + s.suggested_amount, 0),
    [eligible, selected]
  );

  const toggle = (cat: string) =>
    setSelected((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    for (const s of eligible) next[s.category] = true;
    setSelected(next);
    if ((data?.total?.suggested_amount || 0) > 0) setIncludeTotal(true);
  };

  const clearAll = () => {
    setSelected({});
    setIncludeTotal(false);
  };

  const apply = useCallback(async () => {
    if (selectedCount === 0) return;
    setApplying(true);
    try {
      const tasks: Promise<any>[] = [];
      for (const s of eligible) {
        if (selected[s.category]) {
          tasks.push(
            api.upsertBudget({ category: s.category, amount: s.suggested_amount })
          );
        }
      }
      if (includeTotal && data?.total?.suggested_amount > 0) {
        tasks.push(api.upsertTotalBudget(data.total.suggested_amount));
      }
      await Promise.all(tasks);
      setDone(true);
      setTimeout(() => router.back(), 700);
    } catch (e) {
      console.warn('apply', e);
    } finally {
      setApplying(false);
    }
  }, [eligible, selected, includeTotal, data, router, selectedCount]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      </SafeAreaView>
    );
  }

  const hasAny = eligible.length > 0 || (data?.total?.suggested_amount || 0) > 0;

  return (
    <SafeAreaView style={styles.container} testID="suggestions-screen">
      <View style={styles.header}>
        <Pressable testID="suggestions-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Smart suggestions</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: SPACING.lg,
          paddingBottom: 160 + insets.bottom,
        }}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Ionicons name="sparkles" size={20} color={COLORS.brand} />
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={styles.summaryTitle}>Based on the last 3 months</Text>
              <Text style={styles.summarySub}>
                We&apos;ve added a 10% buffer to your average monthly spend.
              </Text>
            </View>
          </View>
        </View>

        {!hasAny ? (
          <View style={styles.emptyBox}>
            <Ionicons name="bulb-outline" size={36} color={COLORS.muted} />
            <Text style={styles.emptyTitle}>Not enough history yet</Text>
            <Text style={styles.emptyText}>
              Log expenses for at least one month and come back for personalised suggestions.
            </Text>
            <Pressable
              testID="suggestions-go-back"
              style={styles.primaryBtn}
              onPress={() => router.back()}
            >
              <Text style={styles.primaryBtnText}>Got it</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.selectRow}>
              <Pressable testID="suggestions-select-all" onPress={selectAll}>
                <Text style={styles.linkText}>Select all</Text>
              </Pressable>
              <Text style={styles.dot}>•</Text>
              <Pressable testID="suggestions-clear-all" onPress={clearAll}>
                <Text style={styles.linkText}>Clear</Text>
              </Pressable>
            </View>

            {/* Total budget suggestion */}
            {data?.total?.suggested_amount > 0 && (
              <Pressable
                testID="suggestion-total"
                style={[styles.row, includeTotal && styles.rowActive]}
                onPress={() => setIncludeTotal((v) => !v)}
              >
                <View style={[styles.iconBox, { backgroundColor: COLORS.brandTertiary }]}>
                  <Ionicons name="wallet" size={20} color={COLORS.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Total monthly budget</Text>
                  <Text style={styles.rowReason}>
                    Avg {formatCurrency(data.total.avg)}/mo across{' '}
                    {data.total.months_with_data} month(s)
                  </Text>
                  {data.total.current_amount != null && (
                    <Text style={styles.currentAmt}>
                      Current: {formatCurrency(data.total.current_amount)}
                    </Text>
                  )}
                </View>
                <View style={styles.rightCol}>
                  <Text style={styles.suggestedAmt}>
                    {formatCurrency(data.total.suggested_amount)}
                  </Text>
                  <View
                    style={[
                      styles.checkbox,
                      includeTotal && { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
                    ]}
                  >
                    {includeTotal && (
                      <Ionicons name="checkmark" size={16} color={COLORS.onBrandPrimary} />
                    )}
                  </View>
                </View>
              </Pressable>
            )}

            <Text style={styles.sectionHeader}>By category</Text>
            {eligible.map((s) => {
              const meta = CATEGORY_META[s.category as CategoryName] || CATEGORY_META.Other;
              const checked = !!selected[s.category];
              return (
                <Pressable
                  key={s.category}
                  testID={`suggestion-${s.category}`}
                  style={[styles.row, checked && styles.rowActive]}
                  onPress={() => toggle(s.category)}
                >
                  <View style={[styles.iconBox, { backgroundColor: meta.tint }]}>
                    <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{s.category}</Text>
                    <Text style={styles.rowReason} numberOfLines={2}>
                      {s.reason}
                    </Text>
                    {s.current_amount != null && (
                      <Text style={styles.currentAmt}>
                        Current: {formatCurrency(s.current_amount)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.rightCol}>
                    <Text style={styles.suggestedAmt}>
                      {formatCurrency(s.suggested_amount)}
                    </Text>
                    <View
                      style={[
                        styles.checkbox,
                        checked && {
                          backgroundColor: COLORS.brandPrimary,
                          borderColor: COLORS.brandPrimary,
                        },
                      ]}
                    >
                      {checked && (
                        <Ionicons name="checkmark" size={16} color={COLORS.onBrandPrimary} />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>

      {hasAny && (
        <View style={[styles.footer, { paddingBottom: SPACING.lg + insets.bottom }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footerLabel}>
              {selectedCount} selected • {formatCurrency(totalSuggestedSum)}
            </Text>
          </View>
          <Pressable
            testID="suggestions-apply"
            disabled={selectedCount === 0 || applying || done}
            onPress={apply}
            style={[
              styles.applyBtn,
              (selectedCount === 0 || applying || done) && { opacity: 0.6 },
            ]}
          >
            {applying ? (
              <ActivityIndicator color={COLORS.onBrandPrimary} />
            ) : (
              <Text style={styles.applyBtnText}>
                {done ? 'Applied ✓' : `Apply ${selectedCount}`}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.onSurface },
  summaryCard: {
    backgroundColor: COLORS.brandTertiary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.brandSecondary,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryTitle: { color: COLORS.brand, fontWeight: '700', fontSize: 14 },
  summarySub: { color: COLORS.onBrandTertiary, fontSize: 12, marginTop: 2 },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
    paddingHorizontal: 4,
  },
  dot: { color: COLORS.muted },
  linkText: { color: COLORS.brandPrimary, fontSize: 13, fontWeight: '700' },
  sectionHeader: {
    color: COLORS.muted,
    fontWeight: '700',
    fontSize: 12,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowActive: { borderColor: COLORS.brandSecondary },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  rowTitle: { color: COLORS.onSurface, fontWeight: '700', fontSize: 14 },
  rowReason: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  currentAmt: { color: COLORS.muted, fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  rightCol: { alignItems: 'flex-end', gap: 8 },
  suggestedAmt: { color: COLORS.brand, fontWeight: '800', fontSize: 15 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: { color: COLORS.onSurface, fontWeight: '800', fontSize: 16, marginTop: SPACING.md },
  emptyText: { color: COLORS.muted, marginTop: 8, textAlign: 'center' },
  primaryBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: '700' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  footerLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  applyBtn: {
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: SPACING.xl,
    height: 48,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  applyBtnText: { color: COLORS.onBrandPrimary, fontWeight: '700', fontSize: 15 },
});
