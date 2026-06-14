import React, { useState } from 'react';
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
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { api } from '@/src/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  CATEGORIES,
  CATEGORY_META,
  CategoryName,
  todayISO,
  formatCurrency,
} from '@/src/theme';

type Mode = 'menu' | 'form' | 'scanning' | 'bulk-review';

type BulkRow = {
  key: string;
  uri: string;
  amount: string;
  merchant: string;
  category: CategoryName;
  date: string;
  selected: boolean;
  status: 'scanning' | 'done' | 'error';
  error?: string;
};

export default function AddExpenseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('menu');

  // Single-screenshot state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<CategoryName>('Other');
  const [saving, setSaving] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Bulk state
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkSaving, setBulkSaving] = useState(false);

  const pickAndScan = async (source: 'camera' | 'library') => {
    setScanError(null);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setScanError('Camera permission denied.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          base64: true,
          quality: 0.7,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setScanError('Photos permission denied.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          base64: true,
          quality: 0.7,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
      }

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setMode('scanning');

      const mime = asset.mimeType || 'image/jpeg';
      const b64 = asset.base64 || '';
      if (!b64) {
        setScanError('Could not read image.');
        setMode('form');
        return;
      }
      const res = await api.scanScreenshot(b64, mime);
      if (res.success) {
        if (res.amount != null) setAmount(String(res.amount));
        if (res.merchant) setMerchant(res.merchant);
        if (res.date) setDate(res.date);
        if (res.category && CATEGORIES.includes(res.category as any)) {
          setCategory(res.category as CategoryName);
        }
      } else {
        setScanError(res.error || 'Could not read screenshot.');
      }
      setMode('form');
    } catch (e: any) {
      console.warn('scan err', e);
      setScanError(e?.message || 'Scan failed.');
      setMode('form');
    }
  };

  const pickBulk = async () => {
    setScanError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setScanError('Photos permission denied.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets?.length) return;

    const rows: BulkRow[] = result.assets.map((a, i) => ({
      key: `${Date.now()}-${i}`,
      uri: a.uri,
      amount: '',
      merchant: '',
      category: 'Other',
      date: todayISO(),
      selected: true,
      status: 'scanning',
    }));
    setBulkRows(rows);
    setBulkProgress({ done: 0, total: rows.length });
    setMode('bulk-review');

    // Scan each sequentially to keep API load sane
    for (let i = 0; i < result.assets.length; i++) {
      const asset = result.assets[i];
      const b64 = asset.base64 || '';
      const mime = asset.mimeType || 'image/jpeg';
      try {
        if (!b64) throw new Error('Image read failed');
        const r = await api.scanScreenshot(b64, mime);
        setBulkRows((prev) =>
          prev.map((row, idx) =>
            idx === i
              ? {
                  ...row,
                  amount: r.amount != null ? String(r.amount) : row.amount,
                  merchant: r.merchant || row.merchant,
                  date: r.date || row.date,
                  category:
                    r.category && CATEGORIES.includes(r.category as any)
                      ? (r.category as CategoryName)
                      : row.category,
                  status: r.success ? 'done' : 'error',
                  error: r.success ? undefined : r.error || 'Scan failed',
                  selected: r.success && !!r.amount,
                }
              : row
          )
        );
      } catch (e: any) {
        setBulkRows((prev) =>
          prev.map((row, idx) =>
            idx === i ? { ...row, status: 'error', error: e?.message || 'Scan failed', selected: false } : row
          )
        );
      }
      setBulkProgress({ done: i + 1, total: result.assets.length });
    }
  };

  const updateBulkRow = (key: string, patch: Partial<BulkRow>) =>
    setBulkRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeBulkRow = (key: string) =>
    setBulkRows((prev) => prev.filter((r) => r.key !== key));

  const saveBulk = async () => {
    const valid = bulkRows.filter(
      (r) => r.selected && r.status !== 'scanning' && parseFloat(r.amount) > 0
    );
    if (valid.length === 0) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        valid.map((r) =>
          api.createExpense({
            amount: parseFloat(r.amount),
            merchant: r.merchant.trim() || 'Unknown',
            category: r.category,
            date: r.date,
            source: 'screenshot',
          })
        )
      );
      router.back();
    } finally {
      setBulkSaving(false);
    }
  };

  const save = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    setSaving(true);
    try {
      await api.createExpense({
        amount: val,
        merchant: merchant.trim() || 'Unknown',
        category,
        note,
        date,
        source: imageUri ? 'screenshot' : 'manual',
      });
      router.back();
    } catch (e) {
      console.warn('save', e);
    } finally {
      setSaving(false);
    }
  };

  const selectedBulkCount = bulkRows.filter(
    (r) => r.selected && r.status !== 'scanning' && parseFloat(r.amount || '0') > 0
  ).length;
  const selectedBulkSum = bulkRows
    .filter((r) => r.selected && r.status !== 'scanning')
    .reduce((s, r) => s + (parseFloat(r.amount || '0') || 0), 0);

  return (
    <SafeAreaView style={styles.container} testID="add-screen">
      <View style={styles.header}>
        <Pressable testID="add-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={COLORS.onSurface} />
        </Pressable>
        <Text style={styles.title}>
          {mode === 'form' && imageUri
            ? 'Review expense'
            : mode === 'bulk-review'
            ? 'Review imports'
            : 'Add expense'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {mode === 'menu' && (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
          <Text style={styles.subtitle}>
            Snap or upload a UPI payment screenshot — we&apos;ll extract the details with AI.
          </Text>

          <Pressable
            testID="add-option-library"
            style={[styles.option, { backgroundColor: COLORS.brandPrimary }]}
            onPress={() => pickAndScan('library')}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="image-outline" size={22} color={COLORS.onBrandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: COLORS.onBrandPrimary }]}>
                Upload screenshot
              </Text>
              <Text style={[styles.optionDesc, { color: 'rgba(255,255,255,0.85)' }]}>
                Pick a GPay / PhonePe / Paytm receipt
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.onBrandPrimary} />
          </Pressable>

          <Pressable
            testID="add-option-bulk"
            style={[styles.option, { backgroundColor: COLORS.surfaceSecondary }]}
            onPress={pickBulk}
          >
            <View style={[styles.optionIcon, { backgroundColor: COLORS.brandTertiary }]}>
              <Ionicons name="images-outline" size={22} color={COLORS.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>Bulk import</Text>
              <Text style={styles.optionDesc}>Pick up to 10 screenshots at once</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
          </Pressable>

          <Pressable
            testID="add-option-camera"
            style={[styles.option, { backgroundColor: COLORS.surfaceSecondary }]}
            onPress={() => pickAndScan('camera')}
          >
            <View style={[styles.optionIcon, { backgroundColor: COLORS.brandTertiary }]}>
              <Ionicons name="camera-outline" size={22} color={COLORS.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>Scan with camera</Text>
              <Text style={styles.optionDesc}>Capture a receipt or payment screen</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
          </Pressable>

          <Pressable
            testID="add-option-manual"
            style={[styles.option, { backgroundColor: COLORS.surfaceSecondary }]}
            onPress={() => setMode('form')}
          >
            <View style={[styles.optionIcon, { backgroundColor: COLORS.surfaceTertiary }]}>
              <Ionicons name="create-outline" size={22} color={COLORS.onSurface} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>Enter manually</Text>
              <Text style={styles.optionDesc}>Type amount, merchant and category</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
          </Pressable>

          {scanError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={COLORS.error} />
              <Text style={styles.errorText}>{scanError}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {mode === 'scanning' && (
        <View style={styles.scanningBox}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.previewImg} resizeMode="contain" />
          )}
          <ActivityIndicator color={COLORS.brand} size="large" style={{ marginTop: 16 }} />
          <Text style={styles.scanningText}>Reading receipt with Claude…</Text>
        </View>
      )}

      {mode === 'bulk-review' && (
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{
              padding: SPACING.lg,
              paddingBottom: 140 + insets.bottom,
            }}
          >
            <View style={styles.bulkBanner}>
              <Ionicons
                name={bulkProgress.done < bulkProgress.total ? 'scan-outline' : 'checkmark-circle'}
                size={18}
                color={COLORS.brand}
              />
              <Text style={styles.bulkBannerText}>
                {bulkProgress.done < bulkProgress.total
                  ? `Scanning ${bulkProgress.done}/${bulkProgress.total}…`
                  : `Scanned ${bulkProgress.total} screenshot(s). Review and save.`}
              </Text>
            </View>

            {bulkRows.map((row) => {
              const isScanning = row.status === 'scanning';
              return (
                <View key={row.key} style={styles.bulkCard} testID={`bulk-row-${row.key}`}>
                  <View style={styles.bulkHead}>
                    <Image source={{ uri: row.uri }} style={styles.bulkThumb} />
                    <View style={{ flex: 1 }}>
                      {isScanning ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <ActivityIndicator size="small" color={COLORS.brand} />
                          <Text style={styles.bulkScanning}>Scanning…</Text>
                        </View>
                      ) : row.status === 'error' ? (
                        <Text style={styles.bulkError}>
                          {row.error || 'Could not scan'} — edit manually
                        </Text>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                          <Text style={styles.bulkOk}>AI-filled</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        testID={`bulk-toggle-${row.key}`}
                        onPress={() => updateBulkRow(row.key, { selected: !row.selected })}
                        style={[
                          styles.checkbox,
                          row.selected && {
                            backgroundColor: COLORS.brandPrimary,
                            borderColor: COLORS.brandPrimary,
                          },
                        ]}
                      >
                        {row.selected && (
                          <Ionicons name="checkmark" size={14} color={COLORS.onBrandPrimary} />
                        )}
                      </Pressable>
                      <Pressable
                        testID={`bulk-remove-${row.key}`}
                        onPress={() => removeBulkRow(row.key)}
                        style={styles.bulkRemove}
                      >
                        <Ionicons name="close" size={16} color={COLORS.error} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.bulkFields}>
                    <View style={styles.bulkFieldHalf}>
                      <Text style={styles.bulkLabel}>Amount</Text>
                      <View style={styles.bulkAmountWrap}>
                        <Text style={styles.bulkCurrency}>₹</Text>
                        <TextInput
                          testID={`bulk-amount-${row.key}`}
                          style={styles.bulkAmountInput}
                          value={row.amount}
                          onChangeText={(t) => updateBulkRow(row.key, { amount: t })}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={COLORS.muted}
                        />
                      </View>
                    </View>
                    <View style={styles.bulkFieldHalf}>
                      <Text style={styles.bulkLabel}>Merchant</Text>
                      <TextInput
                        testID={`bulk-merchant-${row.key}`}
                        style={styles.bulkInput}
                        value={row.merchant}
                        onChangeText={(t) => updateBulkRow(row.key, { merchant: t })}
                        placeholder="Merchant"
                        placeholderTextColor={COLORS.muted}
                      />
                    </View>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6, paddingTop: 6 }}
                  >
                    {CATEGORIES.map((c) => {
                      const active = row.category === c;
                      const m = CATEGORY_META[c];
                      return (
                        <Pressable
                          key={c}
                          testID={`bulk-cat-${row.key}-${c}`}
                          onPress={() => updateBulkRow(row.key, { category: c })}
                          style={[
                            styles.bulkCatChip,
                            active && { backgroundColor: m.tint, borderColor: m.color },
                          ]}
                        >
                          <Ionicons
                            name={m.icon as any}
                            size={12}
                            color={active ? m.color : COLORS.muted}
                          />
                          <Text
                            style={[
                              styles.bulkCatText,
                              active && { color: m.color, fontWeight: '700' },
                            ]}
                          >
                            {c}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })}

            {bulkRows.length === 0 && (
              <Text style={styles.emptyText}>No screenshots selected.</Text>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: SPACING.lg + insets.bottom }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.footerLabel}>
                {selectedBulkCount} ready • {formatCurrency(selectedBulkSum)}
              </Text>
            </View>
            <Pressable
              testID="bulk-save-all"
              disabled={selectedBulkCount === 0 || bulkSaving}
              style={[
                styles.applyBtn,
                (selectedBulkCount === 0 || bulkSaving) && { opacity: 0.6 },
              ]}
              onPress={saveBulk}
            >
              {bulkSaving ? (
                <ActivityIndicator color={COLORS.onBrandPrimary} />
              ) : (
                <Text style={styles.applyBtnText}>Save {selectedBulkCount}</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {mode === 'form' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
            {imageUri && (
              <View style={styles.previewWrap}>
                <Image source={{ uri: imageUri }} style={styles.previewSmall} />
                <Text style={styles.previewLabel}>Auto-filled from screenshot</Text>
              </View>
            )}

            {scanError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{scanError}</Text>
              </View>
            )}

            <Text style={styles.label}>Amount</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.currencyBig}>₹</Text>
              <TextInput
                testID="form-amount"
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            <Text style={styles.label}>Merchant</Text>
            <TextInput
              testID="form-merchant"
              style={styles.input}
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Swiggy"
              placeholderTextColor={COLORS.muted}
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
                    testID={`form-cat-${c}`}
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
            <TextInput
              testID="form-date"
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              testID="form-note"
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={note}
              onChangeText={setNote}
              placeholder="Any details…"
              placeholderTextColor={COLORS.muted}
              multiline
            />
          </ScrollView>

          <View style={styles.footerSimple}>
            <Pressable
              testID="form-save"
              style={[styles.saveBtn, (!amount || saving) && { opacity: 0.6 }]}
              onPress={save}
              disabled={!amount || saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.onBrandPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save expense</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
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
  subtitle: { color: COLORS.muted, marginBottom: SPACING.lg, fontSize: 13 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  optionDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  scanningBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  previewImg: {
    width: '70%',
    height: 280,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceTertiary,
  },
  scanningText: { color: COLORS.brand, marginTop: 12, fontWeight: '600' },
  previewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.brandTertiary,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  previewSmall: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceTertiary,
  },
  previewLabel: { flex: 1, color: COLORS.brand, fontWeight: '600', fontSize: 13 },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#FBDEDD',
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.md,
    alignItems: 'center',
    gap: 8,
  },
  errorText: { color: COLORS.error, fontSize: 13, flex: 1 },
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  footerSimple: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  footerLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  saveBtn: {
    backgroundColor: COLORS.brandPrimary,
    height: 52,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: COLORS.onBrandPrimary, fontSize: 16, fontWeight: '700' },
  applyBtn: {
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: SPACING.xl,
    height: 48,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 130,
  },
  applyBtnText: { color: COLORS.onBrandPrimary, fontWeight: '700', fontSize: 15 },
  bulkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.brandTertiary,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  bulkBannerText: { color: COLORS.brand, fontWeight: '600', fontSize: 13, flex: 1 },
  bulkCard: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  bulkHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm },
  bulkThumb: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceTertiary,
  },
  bulkScanning: { color: COLORS.brand, fontSize: 12, fontWeight: '600' },
  bulkOk: { color: COLORS.success, fontSize: 12, fontWeight: '700' },
  bulkError: { color: COLORS.error, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkRemove: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkFields: { flexDirection: 'row', gap: 8 },
  bulkFieldHalf: { flex: 1 },
  bulkLabel: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bulkAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    height: 40,
  },
  bulkCurrency: { color: COLORS.muted, fontSize: 14, marginRight: 4 },
  bulkAmountInput: { flex: 1, color: COLORS.onSurface, fontSize: 14, fontWeight: '700' },
  bulkInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    height: 40,
    color: COLORS.onSurface,
    fontSize: 13,
  },
  bulkCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bulkCatText: { color: COLORS.onSurfaceTertiary, fontSize: 11 },
  emptyText: { color: COLORS.muted, textAlign: 'center', marginTop: SPACING.xl },
});
