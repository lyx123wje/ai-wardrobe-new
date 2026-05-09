import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function MonthCalendar({
  year, month,           // 当前展示的年月 (month 0-11)
  selectedDate,          // 选中的日期 'YYYY-MM-DD' | null
  datesWithOutfits,      // Set<string> 有穿搭的日期
  onSelectDate,          // (dateKey: string) => void
}) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 生成日历格子
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay(); // 0=日
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells = [];

  // 上月填充
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    cells.push({ day: d, type: 'prev', key: `prev-${d}` });
  }

  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, type: 'current', key: dateKey, dateKey });
  }

  // 下月填充
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, type: 'next', key: `next-${d}` });
    }
  }

  return (
    <View style={styles.container}>
      {/* 星期头 */}
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map(w => (
          <View key={w} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{w}</Text>
          </View>
        ))}
      </View>

      {/* 日期网格 */}
      <View style={styles.grid}>
        {cells.map(cell => {
          const isCurrent = cell.type === 'current';
          const isToday = isCurrent && cell.dateKey === todayKey;
          const isSelected = isCurrent && cell.dateKey === selectedDate;
          const hasOutfit = isCurrent && datesWithOutfits.has(cell.dateKey);

          return (
            <Pressable
              key={cell.key}
              style={[
                styles.cell,
                !isCurrent && styles.cellDimmed,
                isSelected && styles.cellSelected,
              ]}
              onPress={() => isCurrent && onSelectDate(cell.dateKey)}
            >
              <Text style={[
                styles.cellText,
                !isCurrent && styles.cellTextDimmed,
                isToday && styles.cellTextToday,
                isSelected && styles.cellTextSelected,
              ]}>
                {cell.day}
              </Text>
              {hasOutfit && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: 16, padding: 12 },
  weekdayRow: { flexDirection: 'row', marginBottom: 8 },
  weekdayCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  weekdayText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '14.28%', aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
  },
  cellDimmed: { opacity: 0.3 },
  cellSelected: { backgroundColor: '#eef2ff' },
  cellText: { fontSize: 15, fontWeight: '500', color: '#334155' },
  cellTextDimmed: { color: '#cbd5e1' },
  cellTextToday: { color: '#3b82f6', fontWeight: '700' },
  cellTextSelected: { color: '#6366f1', fontWeight: '700' },
  dot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#f59e0b', marginTop: 2,
  },
  dotSelected: { backgroundColor: '#6366f1' },
});
