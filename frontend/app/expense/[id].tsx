import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/src/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  CATEGORIES,
  CATEGORY_META,
  CategoryName,
} from '@/src/theme';

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<CategoryName>('Other');

  useEffect(() => {
    (async () => {
      try {
        const e = await api.getExpense(id as string);
        setAmount(String(e.amount));
        setMerchant(e.merchant);
        setNote(e.note || '');
        setDate(e.date);
        setCategory(e.category);
      } catch (err) {
        console.warn('load expense', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const save = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    setSaving(true);
    try {
      await api.updateExpense(id as string, {
        amount: val,
        merchant: merchant.trim() || 'Unknown',
        category,
        note,
        date,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await api.deleteExpense(id as string);
    router.back();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="edit-expense-screen">
      <View style={styles.header}>
        <Pressable testID="edit-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>Edit expense</Text>
        <Pressable testID="edit-delete" onPress={remove} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={COLORS.error} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountWrap}>
            <Text style={styles.currencyBig}>₹</Text>
            <TextInput
              testID="edit-amount"
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>Merchant</Text>
          <TextInput
            testID="edit-merchant"
            style={styles.input}
            value={merchant}
            onChangeText={setMerchant}
          />

          <Text style={styles.label}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {CATEGORIES.map((c) => {
              const meta = CATEGORY_META[c];
              const active = category === c;
              return (
                <Pressable
                  key={c}
                  testID={`edit-cat-${c}`}
                  style={[
                    styles.catChip,
                    { borderColor: active ? meta.color : COLORS.border },
                    active && { backgroundColor: meta.tint },
                  ]}
                  onPress={() => setCategory(c)}
                >
                  <Ionicons
                    name={meta.icon as any}
                    size={14}
                    color={active ? meta.color : COLORS.muted}
                  />
                  <Text
                    style={[
                      styles.catChipText,
                      { color: active ? meta.color : COLORS.onSurfaceTertiary },
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Date</Text>
          <TextInput testID="edit-date" style={styles.input} value={date} onChangeText={setDate} />

          <Text style={styles.label}>Note</Text>
          <TextInput
            testID="edit-note"
            style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            value={note}
            onChangeText={setNote}
            multiline
          />
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="edit-save"
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.onBrandPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save changes</Text>
            )}
          </Pressable>
        </View>
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
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 64,
  },
  currencyBig: { fontSize: 28, color: COLORS.muted, fontWeight: '700', marginRight: 6 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '800', color: COLORS.onSurface },
  input: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.onSurface,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catChipText: { fontSize: 13, fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  saveBtn: {
    backgroundColor: COLORS.brandPrimary,
    height: 52,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: COLORS.onBrandPrimary, fontSize: 16, fontWeight: '700' },
});
