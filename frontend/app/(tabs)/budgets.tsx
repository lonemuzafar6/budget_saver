import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/src/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  CATEGORIES,
  CATEGORY_META,
  CategoryName,
  formatCurrency,
  monthLabel,
  currentMonth,
} from '@/src/theme';

const THRESHOLD_OPTIONS = [50, 60, 70, 80, 90, 100];

function ThresholdPicker({
  value,
  onChange,
  testIDPrefix,
}: {
  value: number;
  onChange: (n: number) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={pickerStyles.row}>
      <Text style={pickerStyles.label}>Alert me at</Text>
      <View style={pickerStyles.chips}>
        {THRESHOLD_OPTIONS.map((t) => {
          const active = value === t;
          return (
            <Pressable
              key={t}
              testID={`${testIDPrefix}-${t}`}
              onPress={() => onChange(t)}
              style={[pickerStyles.chip, active && pickerStyles.chipActive]}
            >
              <Text style={[pickerStyles.chipText, active && pickerStyles.chipTextActive]}>
                {t}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  row: { marginTop: SPACING.md },
  label: { fontSize: 11, color: COLORS.muted, fontWeight: '700', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceTertiary,
  },
  chipActive: { backgroundColor: COLORS.brandPrimary },
  chipText: { color: COLORS.onSurfaceTertiary, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: COLORS.onBrandPrimary },
});

export default function BudgetsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [totalBudget, setTotalBudget] = useState<any>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [threshold, setThreshold] = useState(80);

  const [editingTotal, setEditingTotal] = useState(false);
  const [totalAmount, setTotalAmount] = useState('');
  const [totalThreshold, setTotalThreshold] = useState(80);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listBudgets();
      setBudgets(res.budgets || []);
      setTotalBudget(res.total_budget || null);
    } catch (e) {
      console.warn('budgets', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const budgetByCategory = useMemo(() => {
    const map: Record<string, any> = {};
    for (const b of budgets) map[b.category] = b;
    return map;
  }, [budgets]);

  const saveCategory = async (cat: string) => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      await api.upsertBudget({ category: cat, amount: val, alert_threshold: threshold });
      setEditing(null);
      setAmount('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeBudget = async (id: string) => {
    await api.deleteBudget(id);
    load();
  };

  const saveTotal = async () => {
    const val = parseFloat(totalAmount);
    if (!val || val <= 0) {
      setEditingTotal(false);
      return;
    }
    setSaving(true);
    try {
      await api.upsertTotalBudget(val, totalThreshold);
      setEditingTotal(false);
      setTotalAmount('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeTotal = async () => {
    await api.deleteTotalBudget();
    setEditingTotal(false);
    load();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container} testID="budgets-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Budgets</Text>
          <Text style={styles.subtitle}>{monthLabel(currentMonth())}</Text>
        </View>
        <Pressable
          testID="budgets-alerts-btn"
          style={styles.headerBtn}
          onPress={() => router.push('/alerts')}
        >
          <Ionicons name="notifications-outline" size={20} color={COLORS.brand} />
        </Pressable>
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
          <Text style={styles.helper}>
            Set a monthly limit per category. We&apos;ll warn you as you approach it.
          </Text>

          {/* Total budget card */}
          <View style={[styles.card, styles.totalCard]} testID="total-budget-card">
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: COLORS.brandTertiary }]}>
                <Ionicons name="wallet" size={20} color={COLORS.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Total monthly budget</Text>
                {totalBudget && Number(totalBudget.amount) > 0 ? (
                  <Text style={styles.cardSub}>
                    {formatCurrency(totalBudget.amount)} •  Alert at {totalBudget.alert_threshold || 80}%
                  </Text>
                ) : (
                  <Text style={styles.cardSub}>Cap your overall monthly spending</Text>
                )}
              </View>
              {!editingTotal && (
                <Pressable
                  testID="edit-total-budget"
                  onPress={() => {
                    setEditingTotal(true);
                    setTotalAmount(totalBudget?.amount ? String(totalBudget.amount) : '');
                    setTotalThreshold(totalBudget?.alert_threshold || 80);
                  }}
                  style={styles.editBtn}
                >
                  <Ionicons
                    name={totalBudget ? 'create-outline' : 'add'}
                    size={18}
                    color={COLORS.brand}
                  />
                </Pressable>
              )}
            </View>

            {editingTotal && (
              <>
                <View style={styles.editRow}>
                  <View style={styles.inputWrap}>
                    <Text style={styles.currency}>₹</Text>
                    <TextInput
                      testID="total-budget-input"
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder="30000"
                      placeholderTextColor={COLORS.muted}
                      value={totalAmount}
                      onChangeText={setTotalAmount}
                      autoFocus
                    />
                  </View>
                  <Pressable
                    testID="save-total-budget"
                    style={styles.saveBtn}
                    onPress={saveTotal}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>{saving ? '...' : 'Save'}</Text>
                  </Pressable>
                  {totalBudget && (
                    <Pressable
                      testID="remove-total-budget"
                      style={styles.removeBtn}
                      onPress={removeTotal}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                    </Pressable>
                  )}
                </View>
                <ThresholdPicker
                  value={totalThreshold}
                  onChange={setTotalThreshold}
                  testIDPrefix="total-threshold"
                />
              </>
            )}
          </View>

          <Text style={[styles.helper, { marginTop: SPACING.lg }]}>By category</Text>

          {CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat as CategoryName];
            const b = budgetByCategory[cat];
            const spent = b?.spent || 0;
            const limit = b?.amount || 0;
            const alertAt = b?.alert_threshold || 80;
            const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
            let barColor = COLORS.brandPrimary;
            const ratio = limit > 0 ? spent / limit : 0;
            if (ratio >= 1) barColor = COLORS.error;
            else if (ratio >= alertAt / 100) barColor = COLORS.warning;

            const isEditing = editing === cat;

            return (
              <View key={cat} style={styles.card} testID={`budget-card-${cat}`}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, { backgroundColor: meta.tint }]}>
                    <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{cat}</Text>
                    {limit > 0 ? (
                      <Text style={styles.cardSub}>
                        {formatCurrency(spent)} of {formatCurrency(limit)}  •  Alert {alertAt}%
                      </Text>
                    ) : (
                      <Text style={styles.cardSub}>No budget set</Text>
                    )}
                  </View>
                  {!isEditing && (
                    <Pressable
                      testID={`edit-budget-${cat}`}
                      onPress={() => {
                        setEditing(cat);
                        setAmount(limit ? String(limit) : '');
                        setThreshold(alertAt);
                      }}
                      style={styles.editBtn}
                    >
                      <Ionicons
                        name={limit > 0 ? 'create-outline' : 'add'}
                        size={18}
                        color={COLORS.brand}
                      />
                    </Pressable>
                  )}
                </View>

                {limit > 0 && !isEditing && (
                  <View style={styles.barBg}>
                    <View
                      style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]}
                    />
                  </View>
                )}

                {isEditing && (
                  <>
                    <View style={styles.editRow}>
                      <View style={styles.inputWrap}>
                        <Text style={styles.currency}>₹</Text>
                        <TextInput
                          testID={`budget-input-${cat}`}
                          style={styles.input}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={COLORS.muted}
                          value={amount}
                          onChangeText={setAmount}
                          autoFocus
                        />
                      </View>
                      <Pressable
                        testID={`save-budget-${cat}`}
                        style={styles.saveBtn}
                        onPress={() => saveCategory(cat)}
                        disabled={saving}
                      >
                        <Text style={styles.saveBtnText}>{saving ? '...' : 'Save'}</Text>
                      </Pressable>
                      {b?.id && (
                        <Pressable
                          testID={`remove-budget-${cat}`}
                          style={styles.removeBtn}
                          onPress={() => {
                            setEditing(null);
                            removeBudget(b.id);
                          }}
                        >
                          <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                        </Pressable>
                      )}
                    </View>
                    <ThresholdPicker
                      value={threshold}
                      onChange={setThreshold}
                      testIDPrefix={`threshold-${cat}`}
                    />
                  </>
                )}
              </View>
            );
          })}
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
  title: { fontSize: 26, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: { color: COLORS.muted, fontSize: 13, marginBottom: SPACING.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  totalCard: {
    borderWidth: 1,
    borderColor: COLORS.brandSecondary,
    backgroundColor: COLORS.brandTertiary,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  cardSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barBg: {
    marginTop: SPACING.md,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceTertiary,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  editRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md, gap: 8 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 44,
  },
  currency: { color: COLORS.muted, fontSize: 16, marginRight: 4 },
  input: { flex: 1, color: COLORS.onSurface, fontSize: 16, fontWeight: '600' },
  saveBtn: {
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: SPACING.lg,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: COLORS.onBrandPrimary, fontWeight: '700' },
  removeBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
