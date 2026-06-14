import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/src/api';
import { COLORS, SPACING, RADIUS, formatCurrency } from '@/src/theme';

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  contributed: number;
  remaining: number;
  progress_percent: number;
  target_date?: string;
};

export default function GoalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);

  // Create form
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Contribute state
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.listGoals();
      setGoals(res.goals || []);
    } catch (e) {
      console.warn('goals', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const saveGoal = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0 || !name.trim()) return;
    setSaving(true);
    try {
      await api.createGoal({
        name: name.trim(),
        target_amount: val,
        target_date: targetDate || undefined,
      });
      setName('');
      setAmount('');
      setTargetDate('');
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const contribute = async (id: string) => {
    const val = parseFloat(contribAmount);
    if (!val || val <= 0) return;
    try {
      await api.contributeGoal(id, val);
      setContributingId(null);
      setContribAmount('');
      await load();
    } catch (e) {
      console.warn('contribute', e);
    }
  };

  const remove = async (id: string) => {
    await api.deleteGoal(id);
    load();
  };

  return (
    <SafeAreaView style={styles.container} testID="goals-screen">
      <View style={styles.header}>
        <Pressable testID="goals-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Savings goals</Text>
        <Pressable
          testID="goals-add-btn"
          onPress={() => setCreating(true)}
          style={[styles.iconBtn, { backgroundColor: COLORS.brandPrimary }]}
        >
          <Ionicons name="add" size={20} color={COLORS.onBrandPrimary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.brand} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              padding: SPACING.lg,
              paddingBottom: 100 + insets.bottom,
            }}
          >
            {creating && (
              <View style={[styles.card, { backgroundColor: COLORS.brandTertiary, borderColor: COLORS.brandSecondary, borderWidth: 1 }]}>
                <Text style={styles.cardTitle}>New goal</Text>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  testID="goal-name"
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Goa trip, Emergency fund"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                />
                <Text style={styles.label}>Target amount</Text>
                <View style={styles.amountWrap}>
                  <Text style={styles.currency}>₹</Text>
                  <TextInput
                    testID="goal-amount"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="15000"
                    placeholderTextColor={COLORS.muted}
                    keyboardType="numeric"
                    style={styles.amountInput}
                  />
                </View>
                <Text style={styles.label}>Target date (optional)</Text>
                <TextInput
                  testID="goal-date"
                  value={targetDate}
                  onChangeText={setTargetDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                />
                <View style={styles.row}>
                  <Pressable
                    testID="goal-cancel"
                    style={styles.secondaryBtn}
                    onPress={() => {
                      setCreating(false);
                      setName('');
                      setAmount('');
                      setTargetDate('');
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    testID="goal-save"
                    style={[styles.primaryBtn, (!name || !amount || saving) && { opacity: 0.5 }]}
                    onPress={saveGoal}
                    disabled={!name || !amount || saving}
                  >
                    {saving ? (
                      <ActivityIndicator color={COLORS.onBrandPrimary} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Create goal</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {goals.length === 0 && !creating ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="flag-outline" size={36} color={COLORS.brand} />
                </View>
                <Text style={styles.emptyTitle}>No goals yet</Text>
                <Text style={styles.emptyText}>
                  Set a target and start saving toward it.
                </Text>
                <Pressable
                  testID="goals-empty-create"
                  style={[styles.primaryBtn, { marginTop: SPACING.lg }]}
                  onPress={() => setCreating(true)}
                >
                  <Text style={styles.primaryBtnText}>Create your first goal</Text>
                </Pressable>
              </View>
            ) : (
              goals.map((g) => {
                const isContributing = contributingId === g.id;
                const pct = Math.min(g.progress_percent || 0, 100);
                const isComplete = g.contributed >= g.target_amount;
                return (
                  <View key={g.id} style={styles.card} testID={`goal-card-${g.id}`}>
                    <View style={styles.cardHead}>
                      <View style={[styles.goalIcon, isComplete && { backgroundColor: '#E8F8EE' }]}>
                        <Ionicons
                          name={isComplete ? 'checkmark-circle' : 'flag'}
                          size={20}
                          color={isComplete ? COLORS.success : COLORS.brand}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.goalName}>{g.name}</Text>
                        <Text style={styles.goalMeta}>
                          {formatCurrency(g.contributed)} of {formatCurrency(g.target_amount)}
                          {g.target_date ? `  •  by ${g.target_date}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.goalPct, isComplete && { color: COLORS.success }]}>
                        {Math.round(pct)}%
                      </Text>
                    </View>
                    <View style={styles.barBg}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: isComplete ? COLORS.success : COLORS.brandPrimary,
                          },
                        ]}
                      />
                    </View>

                    {isContributing ? (
                      <View style={styles.contribRow}>
                        <View style={styles.amountWrapSmall}>
                          <Text style={styles.currency}>₹</Text>
                          <TextInput
                            testID={`contrib-amount-${g.id}`}
                            style={styles.amountInputSmall}
                            value={contribAmount}
                            onChangeText={setContribAmount}
                            keyboardType="numeric"
                            placeholder="Amount"
                            placeholderTextColor={COLORS.muted}
                            autoFocus
                          />
                        </View>
                        <Pressable
                          testID={`contrib-save-${g.id}`}
                          style={styles.saveSmall}
                          onPress={() => contribute(g.id)}
                        >
                          <Ionicons name="checkmark" size={18} color={COLORS.onBrandPrimary} />
                        </Pressable>
                        <Pressable
                          testID={`contrib-cancel-${g.id}`}
                          style={styles.cancelSmall}
                          onPress={() => {
                            setContributingId(null);
                            setContribAmount('');
                          }}
                        >
                          <Ionicons name="close" size={18} color={COLORS.muted} />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.actionRow}>
                        <Pressable
                          testID={`contrib-btn-${g.id}`}
                          style={styles.actionBtn}
                          onPress={() => setContributingId(g.id)}
                          disabled={isComplete}
                        >
                          <Ionicons name="add-circle-outline" size={16} color={COLORS.brand} />
                          <Text style={styles.actionBtnText}>Add contribution</Text>
                        </Pressable>
                        <Pressable
                          testID={`goal-delete-${g.id}`}
                          style={styles.deleteBtn}
                          onPress={() => remove(g.id)}
                        >
                          <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardTitle: { color: COLORS.brand, fontWeight: '700', fontSize: 14, marginBottom: SPACING.sm },
  label: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: SPACING.sm,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.onSurface,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    height: 44,
  },
  amountInput: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  currency: { color: COLORS.muted, fontSize: 16, marginRight: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: SPACING.md },
  primaryBtn: {
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: SPACING.lg,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: COLORS.surfaceTertiary,
    paddingHorizontal: SPACING.lg,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  secondaryBtnText: { color: COLORS.onSurface, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: COLORS.onSurface, fontWeight: '800', fontSize: 18, marginTop: SPACING.md },
  emptyText: { color: COLORS.muted, marginTop: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalName: { color: COLORS.onSurface, fontWeight: '700', fontSize: 14 },
  goalMeta: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  goalPct: { color: COLORS.brand, fontWeight: '800', fontSize: 15 },
  barBg: {
    marginTop: SPACING.md,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceTertiary,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtnText: { color: COLORS.brand, fontWeight: '700', fontSize: 13 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contribRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.md },
  amountWrapSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    height: 40,
  },
  amountInputSmall: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  saveSmall: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelSmall: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
