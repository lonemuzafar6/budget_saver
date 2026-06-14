import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

import { api } from '@/src/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  CATEGORIES,
  CATEGORY_META,
  CategoryName,
  formatCurrency,
} from '@/src/theme';

const FILTERS = ['All', ...CATEGORIES];

export default function TransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<string>('All');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listExpenses({ category, q });
      setItems(res.expenses || []);
    } catch (e) {
      console.warn('list expenses', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, q]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onDelete = async (id: string) => {
    try {
      await api.deleteExpense(id);
      setItems((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.warn('delete', e);
    }
  };

  const renderRight = (id: string) => (
    <Pressable
      testID={`delete-${id}`}
      onPress={() => onDelete(id)}
      style={styles.deleteBtn}
    >
      <Ionicons name="trash" size={22} color="#fff" />
    </Pressable>
  );

  const total = useMemo(
    () => items.reduce((s, e) => s + Number(e.amount || 0), 0),
    [items]
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container} testID="transactions-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.subtitle}>
          {items.length} • {formatCurrency(total)}
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={COLORS.muted} />
        <TextInput
          testID="tx-search"
          style={styles.searchInput}
          placeholder="Search merchant..."
          placeholderTextColor={COLORS.muted}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          onSubmitEditing={load}
        />
        {q.length > 0 && (
          <Pressable
            testID="tx-search-clear"
            onPress={() => {
              setQ('');
              setTimeout(load, 0);
            }}
          >
            <Ionicons name="close-circle" size={16} color={COLORS.muted} />
          </Pressable>
        )}
      </View>

      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: SPACING.lg }}
        >
          {FILTERS.map((f) => {
            const active = category === f;
            return (
              <Pressable
                key={f}
                testID={`chip-${f}`}
                onPress={() => setCategory(f)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={42} color={COLORS.muted} />
          <Text style={styles.emptyText}>No transactions found.</Text>
          <Pressable
            testID="tx-empty-add"
            style={styles.primaryBtn}
            onPress={() => router.push('/add')}
          >
            <Text style={styles.primaryBtnText}>Add your first expense</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: SPACING.lg,
            paddingBottom: 120 + insets.bottom,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          renderItem={({ item }) => {
            const meta = CATEGORY_META[item.category as CategoryName] || CATEGORY_META.Other;
            return (
              <Swipeable renderRightActions={() => renderRight(item.id)}>
                <Pressable
                  testID={`tx-row-${item.id}`}
                  style={styles.txRow}
                  onPress={() => router.push(`/expense/${item.id}`)}
                >
                  <View style={[styles.txIcon, { backgroundColor: meta.tint }]}>
                    <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txMerchant} numberOfLines={1}>
                      {item.merchant}
                    </Text>
                    <Text style={styles.txMeta}>
                      {item.category} • {item.date}
                      {item.source === 'screenshot' ? ' • scanned' : ''}
                    </Text>
                  </View>
                  <Text style={styles.txAmt}>{formatCurrency(item.amount)}</Text>
                </Pressable>
              </Swipeable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.onSurface },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  searchWrap: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: COLORS.onSurface, fontSize: 14 },
  chipsRow: { height: 56, justifyContent: 'center' },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  chipText: { color: COLORS.onSurfaceTertiary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: COLORS.onBrandPrimary },
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
  deleteBtn: {
    backgroundColor: COLORS.error,
    width: 72,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyText: { color: COLORS.muted, marginTop: 8 },
  primaryBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  primaryBtnText: { color: COLORS.onBrandPrimary, fontWeight: '700' },
});
