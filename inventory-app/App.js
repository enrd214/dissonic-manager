// Manager
import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  Switch,
  Share,
  useColorScheme,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

// Optional packages: if one isn't installed in Snack yet, the app still opens and that feature tells you what to add.
let SecureStore = null;
try { SecureStore = require('expo-secure-store'); } catch (e) {}
let DateTimePicker = null;
try { DateTimePicker = require('@react-native-community/datetimepicker').default; } catch (e) {}
let Notifications = null;
try { Notifications = require('expo-notifications'); } catch (e) {}
let ImagePicker = null;
try { ImagePicker = require('expo-image-picker'); } catch (e) {}
let FS = null;
try { FS = require('expo-file-system'); } catch (e) {}
let DocPicker = null;
try { DocPicker = require('expo-document-picker'); } catch (e) {}
let XLSX = null;
try { XLSX = require('xlsx'); } catch (e) {}
let Ionicons = null;
try { Ionicons = require('@expo/vector-icons').Ionicons; } catch (e) {}


const keyStore = {
  get: () =>
    SecureStore
      ? SecureStore.getItemAsync('jawa-key')
      : AsyncStorage.getItem('jawa-key'),
  set: (v) =>
    SecureStore
      ? SecureStore.setItemAsync('jawa-key', v)
      : AsyncStorage.setItem('jawa-key', v),
};

const KEY = 'panda-v1';
let hapticsOn = true;
const tick = () => hapticsOn && Haptics.selectionAsync();
const bump = () =>
  hapticsOn && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

const INVENTORY_STATUSES = ['In Stock', 'In Build', 'Listed', 'Sold'];
const CATS = [
  'CPU',
  'Cooler',
  'MOBO',
  'RAM',
  'Storage',
  'GPU',
  'PSU',
  'Case',
  'Etc.',
];

// ---- Expenses & subscriptions ----
const EXP_CATS = ['Tools', 'Supplies', 'Shipping supplies', 'Software', 'Subscription', 'Fuel / travel', 'Other'];
const FREQ = { none: 'One-time', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' };
const STEP = { monthly: 1, quarterly: 3, yearly: 12 };
const PER_MONTH = { none: 0, weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
const noon = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
const fmtDate = (t) => new Date(t).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });

// every date (ms) an expense is charged between from and to
function charges(e, from, to) {
  const out = [];
  const start = new Date(e.date);
  const end = e.ended ? Math.min(e.ended, to) : to;
  if (e.recurring === 'weekly') {
    for (let t = +start; t <= end; t += 7 * DAY) if (t >= from) out.push(t);
  } else if (STEP[e.recurring]) {
    for (let k = 0; k < 600; k++) {
      const d = new Date(start.getFullYear(), start.getMonth() + k * STEP[e.recurring], 1, 12);
      d.setDate(Math.min(start.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      if (+d > end) break;
      if (+d >= from) out.push(+d);
    }
  } else if (e.date >= from && e.date <= end) out.push(+start);
  return out;
}
// ---- Look and feel helpers ----
let P = null; // the active colour palette, set on every render
const ICON_FALLBACK = { add: '+', 'settings-outline': '⚙︎', 'swap-vertical': '⇅', search: '⌕' };
const Icon = ({ name, size = 22, color }) =>
  Ionicons ? <Ionicons name={name} size={size} color={color} /> : <Text style={{ fontSize: size * 0.8, color }}>{ICON_FALLBACK[name] || '•'}</Text>;
const STATUS_COLORS = { Planned: '#8E8E93', 'In progress': '#F59E0B', Listed: '#3B82F6', Sold: '#22A06B', 'In Stock': '#64748B', 'In Build': '#F59E0B' };
const Pill = ({ status, styles: s }) => {
  const c = STATUS_COLORS[status] || '#8E8E93';
  return (
    <View style={[s.pill, { backgroundColor: c + '22' }]}>
      <Text style={[s.pillT, { color: c }]}>{status}</Text>
    </View>
  );
};

const BUILD_SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'costHigh', label: 'Highest cost' },
  { key: 'costLow', label: 'Lowest cost' },
  { key: 'profitHigh', label: 'Biggest profit' },
  { key: 'profitLow', label: 'Smallest profit' },
  { key: 'name', label: 'Name A to Z' },
];
// Builds without a sell price have no profit yet, so they always sort to the bottom of the profit views
function sortBuilds(rows, key) {
  const cost = (b) => buildTotal(b);
  const profit = (b) => (n(b.sell?.price) > 0 ? buildProfit(b).profit : null);
  if (key === 'profitHigh' || key === 'profitLow') {
    const dir = key === 'profitHigh' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const pa = profit(a), pb = profit(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return (pa - pb) * dir;
    });
  }
  const by = {
    newest: (a, b) => b.id - a.id,
    oldest: (a, b) => a.id - b.id,
    costHigh: (a, b) => cost(b) - cost(a),
    costLow: (a, b) => cost(a) - cost(b),
    name: (a, b) => (a.name || '').localeCompare(b.name || ''),
  };
  return [...rows].sort(by[key] || by.newest);
}

// ---- Days in stock ----
const daysSince = (t) => Math.max(0, Math.floor((Date.now() - t) / DAY));
const buildAge = (b) => { const st = statusOf(b); return st === 'In progress' ? daysSince(b.id) : st === 'Listed' ? daysSince(b.listedAt || b.id) : null; };
const itemAge = (p) => (['In Stock', 'Listed'].includes(p.status || 'In Stock') ? daysSince(p.id) : null);
const ageText = (age, limit) => (age == null ? '' : ` · ${age}d${limit > 0 && age >= limit ? ' ⚠︎' : ''}`);
const expenseTotal = (list, from, to) => list.reduce((a, e) => a + n(e.amount) * charges(e, from, to).length, 0);

// Optional packages: if Snack doesn't have them yet the app still opens, and photos just ask you to add them.

const CHECKLIST = [
  'Powers on / POST / BIOS',
  'OS installed and activated',
  'CPU stress test passed',
  'GPU stress test passed',
  'Temps in a safe range',
  'RAM running at rated speed',
  'Storage health checked',
  'Fans and RGB all working',
  'Front and rear ports tested',
  'Wi-Fi and Bluetooth working',
  'Cleaned and cosmetics checked',
  'Serial numbers recorded',
];
const GREEN = '#1e8e3e';
const RED = '#c0392b';
const DAY = 86400000;

// Photos are stored by file name so they survive app updates
const photoUri = (f) => (!FS || /^(file|http|ph|content):/.test(f) ? f : new FS.File(FS.Paths.document, f).uri);
function keepPhoto(uri, i) {
  try {
    if (!FS) return uri;
    const name = `photo-${Date.now()}-${i}.jpg`;
    new FS.File(uri).copy(new FS.File(FS.Paths.document, name));
    return name;
  } catch (e) {
    return uri;
  }
}

const BUILD_STATUSES = ['Planned', 'In progress', 'Listed', 'Sold'];

const n = (v) => parseFloat(v) || 0;
const money = (v) => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
const buildTotal = (b) => CATS.reduce((t, c) => t + n(b.parts?.[c]?.price), 0);
const statusOf = (b) => b.status || (b.sold ? 'Sold' : 'Planned');

const generateSku = (b, allBuilds, when) => {
  if (b.sku) return b.sku;
  const now = when || new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  const gpuName = b.parts?.GPU?.name || '';
  const cpuName = b.parts?.CPU?.name || '';

  const gpuMatch =
    gpuName.match(/(?:rtx|gtx|rx)?\s*(\d{3,4}\s*(?:ti|xt|super)?)/i) ||
    gpuName.match(/(\d{3,4})/);
  const cpuMatch =
    cpuName.match(/(\d{4,5}[a-z]*)/i) || cpuName.match(/(\d{4})/);

  const gpuCode = gpuMatch
    ? gpuMatch[1].replace(/\s+/g, '').toUpperCase()
    : 'GEN';
  const cpuCode = cpuMatch
    ? cpuMatch[1].replace(/\s+/g, '').toUpperCase()
    : 'CPU';

  const seq = String(allBuilds.length + 1).padStart(2, '0');
  return `${yy}${mm}-${gpuCode}-${cpuCode}-${seq}`;
};

const buildProfit = (b) => {
  const sl = b.sell || {};
  const cost = buildTotal(b),
    sp = n(sl.price);
  const fee = sl.feeType === '%' ? (sp * n(sl.fee)) / 100 : n(sl.fee);
  const profit = sp - fee - n(sl.shipping) - cost - n(sl.loss);
  return {
    cost,
    sp,
    fee,
    ship: n(sl.shipping),
    loss: n(sl.loss),
    profit,
    margin: sp > 0 ? (profit / sp) * 100 : 0,
  };
};

const EMPTY = {
  inventory: [],
  builds: [],
  expenses: [],
  settings: {
    theme: 'system',
    haptics: true,
    hideSoldInAll: false,
    staleDays: '30',
    reminders: false,
    lastBackupAt: null,
    fee: '',
    feeType: '$',
    shipping: '',
  },
};

export default function App() {
  const [data, setData] = useState(EMPTY);
  const [tab, setTab] = useState('home');
  const [showSettings, setShowSettings] = useState(false);
  const [showProfit, setShowProfit] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [expEdit, setExpEdit] = useState(null);
  const saveExpense = (rec) => {
    const list = data.expenses || [];
    const next = rec.id ? list.map((x) => (x.id === rec.id ? rec : x)) : [...list, { ...rec, id: Date.now() }];
    save({ ...data, expenses: next });
    setExpEdit(null);
  };
  const deleteExpense = (id) => {
    save({ ...data, expenses: (data.expenses || []).filter((x) => x.id !== id) });
    setExpEdit(null);
  };
  const scheme = useColorScheme();
  const [edit, setEdit] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((s) => {
      if (s) {
        const parsed = JSON.parse(s);
        let mergedInventory = parsed.inventory || parsed.parts || [];
        if (parsed.items && parsed.items.length > 0) {
          const migratedItems = parsed.items.map((it) => ({
            ...it,
            status:
              it.status === 'Available' ? 'In Stock' : it.status || 'In Stock',
            quantity: 1,
          }));
          const existingIds = new Set(mergedInventory.map((p) => p.id));
          migratedItems.forEach((it) => {
            if (!existingIds.has(it.id)) mergedInventory.push(it);
          });
        }
        setData({ ...EMPTY, ...parsed, inventory: mergedInventory });
      }
    });
  }, []);

  const save = (d) => {
    setData(d);
    AsyncStorage.setItem(KEY, JSON.stringify(d));
  };

  const upsertInventoryItem = (rec) => {
    const list = data.inventory || [];
    const next = rec.id
      ? list.map((r) => (r.id === rec.id ? rec : r))
      : [...list, { ...rec, id: Date.now() }];
    save({ ...data, inventory: next });
    setEdit(null);
  };

  // Copy a build's part list (not the inventory links, photos, or checklist) into a fresh Planned build
  const duplicateBuild = (b) => {
    const parts = {};
    Object.entries(b.parts || {}).forEach(([k, v]) => {
      if (v && (v.name || v.price)) parts[k] = { name: v.name, price: v.price };
    });
    const copy = { name: (b.name || 'Build') + ' (copy)', parts, status: 'Planned', sell: { ...b.sell, loss: '' } };
    setEdit(null);
    setTimeout(() => setEdit({ kind: 'builds', rec: copy }), 450);
  };

  const saveBuild = (newBuild) => {
    const assignedPartIds = Object.values(newBuild.parts || {})
      .map((p) => p?.partId)
      .filter(Boolean);

    const oldBuild = data.builds.find((b) => b.id === newBuild.id);
    const oldPartIds = oldBuild
      ? Object.values(oldBuild.parts || {})
          .map((p) => p?.partId)
          .filter(Boolean)
      : [];

    const unassignedIds = oldPartIds.filter(
      (id) => !assignedPartIds.includes(id)
    );
    const targetStatus = statusOf(newBuild) === 'Sold' ? 'Sold' : 'In Build';

    const updatedInventory = (data.inventory || []).map((p) => {
      if (assignedPartIds.includes(p.id)) return { ...p, status: targetStatus };
      if (unassignedIds.includes(p.id)) return { ...p, status: 'In Stock' };
      return p;
    });

    const isSold = statusOf(newBuild) === 'Sold';
    const buildWithSku = {
      ...newBuild,
      sku: generateSku(newBuild, data.builds),
      soldAt: isSold ? newBuild.soldAt || oldBuild?.soldAt || Date.now() : null,
      listedAt: newBuild.listedAt || oldBuild?.listedAt || (statusOf(newBuild) === 'Listed' ? Date.now() : null),
      updatedAt: Date.now(),
    };

    const updatedBuilds = newBuild.id
      ? data.builds.map((b) => (b.id === newBuild.id ? buildWithSku : b))
      : [...data.builds, { ...buildWithSku, id: Date.now() }];

    save({ ...data, inventory: updatedInventory, builds: updatedBuilds });
    setEdit(null);
  };

  const removeBuild = (id) => {
    const target = data.builds.find((b) => b.id === id);
    const assignedIds = target
      ? Object.values(target.parts || {})
          .map((p) => p?.partId)
          .filter(Boolean)
      : [];

    const updatedInventory = (data.inventory || []).map((p) =>
      assignedIds.includes(p.id) ? { ...p, status: 'In Stock' } : p
    );

    save({
      ...data,
      inventory: updatedInventory,
      builds: data.builds.filter((b) => b.id !== id),
    });
    setEdit(null);
  };

  const remove = (kind, id) => {
    if (kind === 'builds') return removeBuild(id);
    save({
      ...data,
      inventory: (data.inventory || []).filter((r) => r.id !== id),
    });
    setEdit(null);
  };

  const prefs = data.settings || EMPTY.settings;
  const dark =
    prefs.theme === 'system' ? scheme === 'dark' : prefs.theme === 'dark';
  const s = makeStyles(dark ? DARK : LIGHT);
  P = dark ? DARK : LIGHT;
  hapticsOn = prefs.haptics !== false;
  const staleLimit = prefs.staleDays == null || prefs.staleDays === '' ? 30 : n(prefs.staleDays);
  useEffect(() => { syncReminders(data.expenses || [], !!prefs.reminders); }, [data.expenses, prefs.reminders]);

  const setPrefs = (patch) =>
    save({ ...data, settings: { ...prefs, ...patch } });
  const restore = (d) =>
    save({ ...EMPTY, ...d, settings: { ...EMPTY.settings, ...d.settings } });

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={s.head}>
        <Text style={s.title}>{tab === 'home' ? '💻 Build Manager' : { builds: 'Builds', inventory: 'Inventory', money: 'Financials' }[tab]}</Text>
        <TouchableOpacity style={s.gearBtn} onPress={() => { tick(); setShowSettings(true); }}>
          <Icon name="settings-outline" size={21} color={P.text} />
        </TouchableOpacity>
      </View>

      {tab === 'home' && (
        <Home
          data={data}
          styles={s}
          onProfit={() => { tick(); setShowProfit(true); }}
          onOffer={() => setShowOffer(true)}
          onExpense={() => { tick(); setExpEdit({}); }}
          onSettings={() => { tick(); setShowSettings(true); }}
          goTab={(k) => {
            tick();
            setTab(k);
          }}
          onOpen={setEdit}
          onNew={(kind) =>
            setEdit({
              kind,
              rec:
                kind === 'builds'
                  ? {
                      parts: {},
                      sell: {
                        fee: prefs.fee,
                        feeType: prefs.feeType,
                        shipping: prefs.shipping,
                      },
                    }
                  : { status: 'In Stock', quantity: '1' },
            })
          }
        />
      )}
      {tab === 'builds' && (
        <List
          rows={data.builds}
          kind="builds"
          onOpen={setEdit}
          hideSoldInAll={prefs.hideSoldInAll}
          sortKey={prefs.buildSort || 'newest'}
          onSort={(k) => setPrefs({ buildSort: k })}
          styles={s}
          sub={(r) => `${r.sku || 'No SKU'} · ${CATS.filter((c) => r.parts?.[c]?.name).length}/${CATS.length} parts · ${money(buildTotal(r))} cost` + ageText(buildAge(r), staleLimit)}
          right={(r) => {
            if (!(n(r.sell?.price) > 0)) return null;
            const p = buildProfit(r).profit;
            return { text: (p >= 0 ? '+' : '') + money(p), color: p < 0 ? RED : GREEN };
          }}
        />
      )}
      {tab === 'inventory' && (
        <List
          rows={data.inventory || []}
          kind="inventory"
          onOpen={setEdit}
          hideSoldInAll={prefs.hideSoldInAll}
          styles={s}
          sub={(r) => `${r.category ? r.category + ' · ' : ''}qty ${r.quantity || 1} · buy ${money(n(r.buy_price))}` + ageText(itemAge(r), staleLimit)}
          right={(r) => (r.sell_price ? { text: money(n(r.sell_price)) } : null)}
        />
      )}
      {tab === 'money' && <Financials builds={data.builds} expenses={data.expenses || []} styles={s} onProfit={() => { tick(); setShowProfit(true); }} onExpense={(e) => { tick(); setExpEdit(e || {}); }} />}

      {(tab === 'builds' || tab === 'inventory') && (
        <TouchableOpacity
          style={s.fab}
          onPress={() =>
            setEdit({
              kind: tab,
              rec:
                tab === 'builds'
                  ? {
                      parts: {},
                      sell: {
                        fee: prefs.fee,
                        feeType: prefs.feeType,
                        shipping: prefs.shipping,
                      },
                    }
                  : { status: 'In Stock', quantity: '1' },
            })
          }>
          <Icon name="add" size={30} color="#fff" />
        </TouchableOpacity>
      )}

      <View style={s.tabs}>
        {[['home', 'Home', 'home'], ['builds', 'Builds', 'desktop'], ['inventory', 'Inventory', 'cube'], ['money', 'Financials', 'stats-chart']].map(([k, l, ic]) => {
          const on = tab === k;
          return (
            <TouchableOpacity key={k} style={s.tab} onPress={() => { tick(); setTab(k); }}>
              <Icon name={on ? ic : ic + '-outline'} size={24} color={on ? P.link : P.sub} />
              <Text style={[s.tabT, on && s.tabOn]}>{l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {expEdit && <ExpenseEditor rec={expEdit} builds={data.builds} dark={dark} styles={s} onSave={saveExpense} onDelete={deleteExpense} onClose={() => setExpEdit(null)} />}
      {showProfit && <ProfitBreakdown builds={data.builds} expenses={data.expenses || []} styles={s} onClose={() => setShowProfit(false)} />}
      {showOffer && <MaxOffer prefs={prefs} styles={s} onClose={() => setShowOffer(false)} />}
      {showSettings && (
        <SettingsScreen
          data={data}
          styles={s}
          onChange={setPrefs}
          onRestore={restore}
          onImportEbay={(newParts) => {
            const nextInv = [...(data.inventory || []), ...newParts];
            save({ ...data, inventory: nextInv });
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {edit && edit.kind === 'builds' && (
        <BuildEditor
          rec={edit.rec}
          inventoryParts={data.inventory || []}
          styles={s}
          onClose={() => setEdit(null)}
          onSave={saveBuild}
          onDelete={(id) => remove('builds', id)}
          onDuplicate={duplicateBuild}
        />
      )}
      {edit && edit.kind === 'inventory' && (
        <Editor
          edit={edit}
          styles={s}
          onClose={() => setEdit(null)}
          onSave={upsertInventoryItem}
          onDelete={(id) => remove('inventory', id)}
        />
      )}
    </SafeAreaView>
  );
}

const List = ({ rows, kind, onOpen, sub, right, hideSoldInAll, sortKey, onSort, styles: s }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const filterOptions = kind === 'inventory' ? ['All', ...INVENTORY_STATUSES] : ['All', ...BUILD_STATUSES];

  const filtered = rows.filter((r) => {
    const query = search.toLowerCase();
    const nameMatch = (r.name || '').toLowerCase().includes(query);
    const catMatch = (r.category || '').toLowerCase().includes(query);
    const skuMatch = (r.sku || '').toLowerCase().includes(query);
    const status = kind === 'builds' ? statusOf(r) : r.status || 'In Stock';
    const filterMatch = filter === 'All' ? !hideSoldInAll || status !== 'Sold' : status === filter;
    return (nameMatch || catMatch || skuMatch) && filterMatch;
  });
  const filteredRows = kind === 'builds' ? sortBuilds(filtered, sortKey || 'newest') : filtered;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 2 }}>
        <View style={s.bRow}>
          <View style={[s.searchWrap, { flex: 1 }]}>
            <Icon name="search" size={17} color={P.sub} />
            <TextInput style={s.searchInput} placeholder={`Search ${kind}`} placeholderTextColor={P.sub} value={search} onChangeText={setSearch} clearButtonMode="while-editing" />
          </View>
          {kind === 'builds' && (
            <MenuButton
              styles={s}
              align="right"
              style={s.sortBtn}
              label={<><Icon name="swap-vertical" size={17} color={P.link} /><Text style={s.sortT}>Sort</Text></>}
              options={BUILD_SORTS}
              selected={sortKey || 'newest'}
              onPick={onSort}
            />
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
          {filterOptions.map((st) => (
            <TouchableOpacity key={st} style={[s.chip, filter === st && s.chipOn, { marginRight: 8 }]} onPress={() => { tick(); setFilter(st); }}>
              <Text style={filter === st ? { color: '#fff', fontWeight: '600' } : s.chipT}>{st}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredRows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 2, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Icon name="file-tray-outline" size={40} color={P.sub} />
            <Text style={s.empty}>{search || filter !== 'All' ? 'No matching items found.' : 'Nothing here yet. Tap + to add.'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const r = right ? right(item) : null;
          return (
            <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => onOpen({ kind, rec: item })}>
              <View style={s.rowTop}>
                <Text style={[s.name, { flex: 1 }]} numberOfLines={1}>{item.name || '(unnamed)'}</Text>
                <Pill status={kind === 'builds' ? statusOf(item) : item.status || 'In Stock'} styles={s} />
              </View>
              <View style={s.rowBottom}>
                <Text style={[s.sub, { flex: 1, marginTop: 0 }]} numberOfLines={1}>{sub(item)}</Text>
                {r && <Text style={[s.rowRight, r.color && { color: r.color }]}>{r.text}</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

function confirmDelete(b, onDelete) {
  if (hapticsOn)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  Alert.alert(
    'Delete build?',
    `"${
      b.name || 'This build'
    }" will be permanently deleted. Linked parts will return to stock.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (hapticsOn)
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onDelete(b.id);
        },
      },
    ]
  );
}

function MenuButton({
  style,
  label,
  options,
  selected,
  onPick,
  styles: s,
  align = 'left',
}) {
  const ref = useRef(null);
  const { marginBottom, ...inner } = StyleSheet.flatten(style) || {};
  const [pos, setPos] = useState(null);
  const ty = useRef(new Animated.Value(6)).current;
  const op = useRef(new Animated.Value(0)).current;

  const open = () => {
    bump();
    op.setValue(0);
    ty.setValue(6);
    if (ref.current && ref.current.measureInWindow)
      ref.current.measureInWindow((x, y, w, h) => setPos({ x, y, w, h }));
    else setPos({ x: 16, y: 300, w: 200, h: 44 });
  };
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const ease = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 140, easing: ease, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 140, easing: ease, useNativeDriver: true }),
    ]).start();
  }, [pos]);

  let box = {};
  if (pos) {
    const { width: SW, height: SH } = Dimensions.get('window');
    const W = 250,
      H = options.length * 52 + 8;
    const left = Math.min(
      Math.max(12, align === 'right' ? pos.x + pos.w - W : pos.x),
      SW - W - 12
    );
    const below = pos.y + pos.h + 8 + H < SH - 40;
    box = { left, width: W, top: below ? pos.y + pos.h + 8 : pos.y - H - 8 };
  }

  return (
    <>
      <View ref={ref} collapsable={false} style={{ marginBottom }}>
        <TouchableOpacity style={inner} onPress={open}>
          {label}
        </TouchableOpacity>
      </View>
      {pos && (
        <Modal transparent animationType="none" onRequestClose={close}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <Animated.View
            style={[
              s.popShadow,
              box,
              { opacity: op, transform: [{ translateY: ty }] },
            ]}>
            <View style={s.popBlur}>
              {options.map((o, i) => (
                <TouchableOpacity
                  key={o.key}
                  style={[s.popRow, i > 0 && s.popSep]}
                  onPress={() => {
                    tick();
                    onPick(o.key);
                    close();
                  }}>
                  <Text style={s.popT}>{o.label}</Text>
                  {selected === o.key && <Text style={s.popT}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

function SettingsScreen({
  data,
  onChange,
  onRestore,
  onImportEbay,
  onClose,
  styles: s,
}) {
  const st = data.settings || {};
  const [key, setKey] = useState('');
  const [paste, setPaste] = useState(null);
  const [range, setRange] = useState('year');
  const [ebayText, setEbayText] = useState('');
  const [showEbayModal, setShowEbayModal] = useState(false);

  useEffect(() => {
    keyStore.get().then((k) => k && setKey(k));
  }, []);

  const saveKey = async () => {
    await keyStore.set(key.trim());
    Alert.alert(
      'Saved',
      SecureStore
        ? 'Your Jawa key is stored securely on this phone.'
        : 'Saved on this phone.'
    );
  };

  const testJawa = async () => {
    try {
      const res = await fetch('https://www.jawa.gg/ims/v1/listings', {
        headers: { Authorization: `Bearer ${key.trim()}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || `Error ${res.status}`);
      Alert.alert(
        'Connected',
        `Found ${j.total} listing(s) on your Jawa account.`
      );
    } catch (e) {
      Alert.alert('Could not connect', String(e.message || e));
    }
  };

  const processEbayImport = () => {
    try {
      const lines = ebayText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const excludedKeywords = [
        'shirt',
        'shoe',
        'book',
        'toy',
        'pokemon',
        'card',
        'vinyl',
        'cd',
        'jacket',
        'pants',
        'hat',
        'decor',
        'lamp',
        'kitchen',
        'mug',
        'poster',
      ];
      let imported = [];

      lines.forEach((line) => {
        const parts = line
          .split(/,|\t/)
          .map((p) => p.replace(/^["']|["']$/g, '').trim());
        const title = parts.find((p) => p.length > 8) || parts[0] || '';
        const lowerTitle = title.toLowerCase();

        const isExcluded = excludedKeywords.some((kw) =>
          lowerTitle.includes(kw)
        );
        if (isExcluded || lowerTitle.length < 3) return;

        let category = 'Etc.';
        if (
          /rtx|gtx|rx\s*\d|geforce|radeon|gpu|graphics|ti|super/i.test(
            lowerTitle
          )
        )
          category = 'GPU';
        else if (/ryzen|intel|core|i3|i5|i7|i9|cpu|processor/i.test(lowerTitle))
          category = 'CPU';
        else if (/ddr4|ddr5|ram|memory|dimm/i.test(lowerTitle)) category = 'RAM';
        else if (/ssd|nvme|hdd|storage|drive|m\.2/i.test(lowerTitle))
          category = 'Storage';
        else if (/motherboard|board|am4|am5|lga/i.test(lowerTitle))
          category = 'MOBO';
        else if (/psu|power supply|watts|watt/i.test(lowerTitle))
          category = 'PSU';
        else if (/case|chassis|tower/i.test(lowerTitle)) category = 'Case';
        else if (/cooler|aio|fan|heatsink/i.test(lowerTitle))
          category = 'Cooler';

        const priceMatch = line.match(/\$?(\d+\.\d{2})/);
        const price = priceMatch ? priceMatch[1] : '';

        imported.push({
          id: Date.now() + Math.random(),
          name: title,
          category,
          buy_price: price,
          quantity: '1',
          status: 'In Stock',
          notes: 'Imported from eBay CSV',
        });
      });

      if (imported.length === 0) {
        Alert.alert(
          'No valid PC parts found',
          'Ensure your text contains item titles and prices. Non-hardware items were automatically filtered out.'
        );
        return;
      }

      onImportEbay(imported);
      setShowEbayModal(false);
      setEbayText('');
      Alert.alert(
        'Success',
        `Successfully imported ${imported.length} PC part(s) into Inventory!`
      );
    } catch (e) {
      Alert.alert('Import Error', 'Could not parse eBay text/CSV data.');
    }
  };

  const toggleReminders = async (v) => {
    if (v && !Notifications) return Alert.alert('Reminders need expo-notifications', 'Add expo-notifications to your Snack dependencies, then try again.');
    if (v) {
      const p = await Notifications.requestPermissionsAsync();
      if (!p.granted) return Alert.alert('Notifications are off', 'Allow notifications in the iPhone Settings app, then try again.');
    }
    onChange({ reminders: v });
  };
  const exportBackup = async () => {
    try {
      const res = await Share.share({ message: JSON.stringify(data) });
      if (res.action === Share.sharedAction) onChange({ lastBackupAt: Date.now() });
    } catch (e) {}
  };
  const importXlsx = async () => {
    if (!DocPicker || !XLSX) return Alert.alert('Import needs two packages', 'Add expo-document-picker and xlsx to your Snack dependencies, then try again.');
    try {
      const res = await DocPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      const uri = res.assets[0].uri;
      let bytes;
      try { bytes = await new FS.File(uri).bytes(); } catch (e) { bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer()); }
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheets = {};
      wb.SheetNames.forEach((nm) => { sheets[nm] = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: null, raw: true }); });
      const parsed = parsePandaExport(sheets);
      if (!parsed.builds.length && !parsed.inventory.length) throw new Error('No Panda Manager sheets (Builds Summary, Builds Detail, Parts Inventory) were found in that file.');
      const done = (mode) => {
        onRestore(applyImport(data, parsed, mode));
        Alert.alert('Imported', `${parsed.builds.length} builds and ${parsed.inventory.length} parts from Panda Manager.${parsed.notes.length ? '\n\n' + parsed.notes.join('\n') : ''}`);
      };
      Alert.alert('Import from Panda Manager', `Found ${parsed.builds.length} builds and ${parsed.inventory.length} parts. Importing the same file twice won't create duplicates.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add to my data', onPress: () => done('merge') },
        { text: 'Replace my data', style: 'destructive', onPress: () => done('replace') },
      ]);
    } catch (e) {
      Alert.alert('Could not import', String(e.message || e));
    }
  };
  const doRestore = () => {
    try {
      const d = JSON.parse(paste);
      if (!Array.isArray(d.builds)) throw new Error('not a Manager backup');
      Alert.alert(
        'Replace all data?',
        'This overwrites everything in the app with the backup.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: () => {
              onRestore(d);
              setPaste(null);
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Invalid backup', 'That text is not a Manager backup.');
    }
  };

  return (
    <Modal animationType="slide">
      <SafeAreaView style={s.root}>
        <View style={s.bHead}>
          <Text style={s.name}>Settings</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={[s.link, { fontWeight: '700' }]}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled">
          <Text style={s.sec}>APPEARANCE & PREFERENCES</Text>
          <View style={[s.seg, { margin: 0 }]}>
            {[
              ['system', 'System'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ].map(([k, l]) => (
              <TouchableOpacity
                key={k}
                style={[s.segBtn, st.theme === k && s.segOn]}
                onPress={() => {
                  tick();
                  onChange({ theme: k });
                }}>
                <Text style={[s.segT, st.theme === k && { color: '#fff' }]}>
                  {l}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View
            style={[
              s.card,
              s.bRow,
              { justifyContent: 'space-between', marginTop: 12 },
            ]}>
            <Text style={s.name}>Haptics</Text>
            <Switch
              value={st.haptics !== false}
              onValueChange={(v) => onChange({ haptics: v })}
            />
          </View>

          <View
            style={[
              s.card,
              s.bRow,
              { justifyContent: 'space-between', marginTop: 8 },
            ]}>
            <Text style={[s.name, { flex: 1, paddingRight: 8 }]}>
              Hide parts in sold builds in "All"
            </Text>
            <Switch
              value={!!st.hideSoldInAll}
              onValueChange={(v) => onChange({ hideSoldInAll: v })}
            />
          </View>

          <Text style={s.sec}>EBAY / BULK IMPORT</Text>
          <TouchableOpacity
            style={s.btn}
            onPress={() => setShowEbayModal(true)}>
            <Text style={s.btnT}>Import eBay CSV / Orders</Text>
          </TouchableOpacity>

          <Text style={s.sec}>DEFAULTS FOR NEW BUILDS</Text>
          <Text style={s.sub}>Fees</Text>
          <View style={s.bRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder={st.feeType === '%' ? '0' : '$0.00'}
              keyboardType="decimal-pad"
              value={String(st.fee ?? '')}
              onChangeText={(t) => onChange({ fee: t })}
            />
            <MenuButton
              align="right"
              styles={s}
              style={[s.unit, { marginBottom: 12 }]}
              label={<Text style={s.unitT}>{st.feeType || '$'} ▾</Text>}
              options={[
                { key: '$', label: '$   Dollar amount' },
                { key: '%', label: '%   Percent of sell price' },
              ]}
              selected={st.feeType || '$'}
              onPick={(k) => onChange({ feeType: k })}
            />
          </View>
          <Text style={s.sub}>Shipping cost</Text>
          <TextInput
            style={s.input}
            placeholder="$0.00"
            keyboardType="decimal-pad"
            value={String(st.shipping ?? '')}
            onChangeText={(t) => onChange({ shipping: t })}
          />

          <Text style={s.sec}>REMINDERS</Text>
          <View style={[s.card, s.bRow, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>Subscription reminders</Text>
              <Text style={s.sub}>A notification at 9 AM the day before each charge.</Text>
            </View>
            <Switch value={!!st.reminders} onValueChange={toggleReminders} />
          </View>

          <Text style={s.sec}>STALE WARNING</Text>
          <Text style={s.sub}>Flag parts and builds that sit unsold this many days. Use 0 to turn it off.</Text>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            placeholder="30"
            value={String(st.staleDays ?? '30')}
            onChangeText={(t) => onChange({ staleDays: t })}
          />

          <Text style={s.sec}>JAWA</Text>
          <TextInput
            style={s.input}
            placeholder="Paste your Jawa API key"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={key}
            onChangeText={setKey}
          />
          <TouchableOpacity style={s.btn} onPress={saveKey}>
            <Text style={s.btnT}>Save key</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btn} onPress={testJawa}>
            <Text style={s.btnT}>Test connection (read-only)</Text>
          </TouchableOpacity>

          <Text style={s.sec}>EXPORT FOR TAXES</Text>
          <Text style={s.sub}>A CSV of sold builds and expenses for the range you pick.</Text>
          <MenuButton
            styles={s}
            style={[s.unit, { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }]}
            label={<><Text style={[s.unitT, { fontSize: 16 }]}>{RANGE_LABELS[range]}</Text><Text style={s.unitT}>▾</Text></>}
            options={Object.keys(RANGE_LABELS).map((k) => ({ key: k, label: RANGE_LABELS[k] }))}
            selected={range}
            onPick={setRange}
          />
          <TouchableOpacity style={s.btn} onPress={() => shareCsv(buildCsv(data, range), rangeFor(range).label)}>
            <Text style={s.btnT}>Export sales & expenses (CSV)</Text>
          </TouchableOpacity>

          <Text style={s.sec}>IMPORT</Text>
          <Text style={s.sub}>Bring in the .xlsx you exported from Panda Manager on your PC.</Text>
          <TouchableOpacity style={s.btn} onPress={importXlsx}>
            <Text style={s.btnT}>Import Panda Manager export</Text>
          </TouchableOpacity>

          <Text style={s.sec}>BACKUP</Text>
          <Text style={s.sub}>
            {st.lastBackupAt ? `Last backup: ${daysSince(st.lastBackupAt) === 0 ? 'today' : daysSince(st.lastBackupAt) + ' days ago'}` : 'No backup yet'}
          </Text>
          <TouchableOpacity style={s.btn} onPress={exportBackup}>
            <Text style={s.btnT}>Export backup</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btn}
            onPress={() => setPaste(paste === null ? '' : null)}>
            <Text style={s.btnT}>Restore from backup</Text>
          </TouchableOpacity>
          {paste !== null && (
            <View style={{ marginTop: 12 }}>
              <Text style={s.sub}>Paste the backup text you exported</Text>
              <TextInput
                style={[s.input, { height: 120 }]}
                multiline
                value={paste}
                onChangeText={setPaste}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#c0392b' }]}
                onPress={doRestore}>
                <Text style={s.btnT}>Restore</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {showEbayModal && (
          <Modal animationType="slide" transparent={false}>
            <SafeAreaView style={s.root}>
              <View style={s.bHead}>
                <TouchableOpacity onPress={() => setShowEbayModal(false)}>
                  <Text style={s.link}>Cancel</Text>
                </TouchableOpacity>
                <Text style={s.name}>eBay CSV Importer</Text>
                <TouchableOpacity onPress={processEbayImport}>
                  <Text style={[s.link, { fontWeight: '700' }]}>Import</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Text style={s.sub}>
                  Paste your eBay Seller Hub CSV rows or order text below. Non-PC
                  items (clothing, media, etc.) will be automatically filtered
                  out and hardware items will be categorized.
                </Text>
                <TextInput
                  style={[s.input, { height: 200, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Paste CSV / text here..."
                  value={ebayText}
                  onChangeText={setEbayText}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </ScrollView>
            </SafeAreaView>
          </Modal>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function BuildEditor({
  rec,
  inventoryParts = [],
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  styles: s,
}) {
  const [b, setB] = useState(rec);
  const [sub, setSub] = useState('parts');
  const setSell = (field, v) => setB({ ...b, sell: { ...b.sell, [field]: v } });
  const r = buildProfit(b);
  const feeType = b.sell?.feeType || '$';

  const setPartField = (c, field, v) =>
    setB((prev) => ({
      ...prev,
      parts: {
        ...prev.parts,
        [c]: { ...prev.parts?.[c], [field]: v },
      },
    }));

  const linkInventoryPart = (c, item) => {
    if (!item) {
      setB((prev) => ({
        ...prev,
        parts: { ...prev.parts, [c]: { name: '', price: '', partId: null } },
      }));
      return;
    }
    setB((prev) => ({
      ...prev,
      parts: {
        ...prev.parts,
        [c]: {
          name: item.name,
          price: item.buy_price,
          partId: item.id,
        },
      },
    }));
  };

  return (
    <Modal animationType="slide">
      <SafeAreaView style={s.root}>
        <View style={s.bHead}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.link}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.name}>{b.id ? 'Edit Build' : 'New Build'}</Text>
          <TouchableOpacity onPress={() => onSave(b)}>
            <Text style={[s.link, { fontWeight: '700' }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <View style={s.seg}>
          {[
            ['parts', 'Parts'],
            ['sell', 'Sell & Profit'],
            ['details', 'Details'],
          ].map(([k, l]) => (
            <TouchableOpacity
              key={k}
              style={[s.segBtn, sub === k && s.segOn]}
              onPress={() => {
                tick();
                setSub(k);
              }}>
              <Text style={[s.segT, sub === k && { color: '#fff' }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {sub === 'details' ? (
          <DetailsTab b={b} setB={setB} styles={s} />
        ) : sub === 'sell' ? (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled">
            <Text style={s.sub}>Status</Text>
            <MenuButton
              styles={s}
              style={[
                s.unit,
                {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                },
              ]}
              label={
                <>
                  <Text style={[s.unitT, { fontSize: 16 }]}>{statusOf(b)}</Text>
                  <Text style={s.unitT}>▾</Text>
                </>
              }
              options={BUILD_STATUSES.map((st) => ({ key: st, label: st }))}
              selected={statusOf(b)}
              onPick={(k) => setB({ ...b, status: k })}
            />

            <Text style={s.sub}>Sell price</Text>
            <TextInput
              style={s.input}
              placeholder="$0.00"
              keyboardType="decimal-pad"
              value={b.sell?.price == null ? '' : String(b.sell.price)}
              onChangeText={(t) => setSell('price', t)}
            />

            <Text style={s.sub}>Fees</Text>
            <View style={[s.bRow, { zIndex: 10 }]}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder={feeType === '%' ? '0' : '$0.00'}
                keyboardType="decimal-pad"
                value={b.sell?.fee == null ? '' : String(b.sell.fee)}
                onChangeText={(t) => setSell('fee', t)}
              />
              <MenuButton
                align="right"
                styles={s}
                style={[s.unit, { marginBottom: 12 }]}
                label={<Text style={s.unitT}>{feeType} ▾</Text>}
                options={[
                  { key: '$', label: '$   Dollar amount' },
                  { key: '%', label: '%   Percent of sell price' },
                ]}
                selected={feeType}
                onPick={(k) => setSell('feeType', k)}
              />
            </View>

            <Text style={s.sub}>Shipping cost</Text>
            <TextInput
              style={s.input}
              placeholder="$0.00"
              keyboardType="decimal-pad"
              value={b.sell?.shipping == null ? '' : String(b.sell.shipping)}
              onChangeText={(t) => setSell('shipping', t)}
            />

            <Text style={s.sub}>Refund / loss</Text>
            <TextInput
              style={s.input}
              placeholder="$0.00"
              keyboardType="decimal-pad"
              value={b.sell?.loss == null ? '' : String(b.sell.loss)}
              onChangeText={(t) => setSell('loss', t)}
            />

            <View style={s.card}>
              <Line l="Sell price" v={money(r.sp)} styles={s} />
              <Line l="Parts cost" v={'-' + money(r.cost)} styles={s} />
              <Line
                l={feeType === '%' ? `Fees (${n(b.sell?.fee)}%)` : 'Fees'}
                v={'-' + money(r.fee)}
                styles={s}
              />
              <Line l="Shipping" v={'-' + money(r.ship)} styles={s} />
              {r.loss > 0 && <Line l="Refund / loss" v={'-' + money(r.loss)} styles={s} />}
              <View style={s.hr} />
              <Line
                l="Final profit"
                v={money(r.profit)}
                bold
                styles={s}
                color={r.profit < 0 ? '#c0392b' : '#1e8e3e'}
              />
              <Line
                l="Profit margin"
                v={r.margin.toFixed(1) + '%'}
                bold
                styles={s}
                color={r.profit < 0 ? '#c0392b' : '#1e8e3e'}
              />
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled">
            <TextInput
              style={s.input}
              placeholder="Build name"
              value={b.name || ''}
              onChangeText={(t) => setB({ ...b, name: t })}
            />

            <Text style={s.sub}>SKU (Auto-generated)</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 2610-4070-5600-01"
              value={b.sku || ''}
              onChangeText={(t) => setB({ ...b, sku: t })}
            />

            {CATS.map((c) => {
              const currentPartId = b.parts?.[c]?.partId;
              const availableInStock = inventoryParts.filter(
                (p) => p.status === 'In Stock' || p.id === currentPartId
              );

              const stockOptions = [
                { key: 'none', label: 'None / Manual Entry' },
                ...availableInStock.map((p) => ({
                  key: String(p.id),
                  label: `${p.name} ($${p.buy_price || 0})`,
                  raw: p,
                })),
              ];

              return (
                <View key={c} style={{ marginBottom: 4 }}>
                  <View style={s.catHeader}>
                    <Text style={s.bCat}>{c}</Text>
                    {availableInStock.length > 0 && (
                      <MenuButton
                        align="right"
                        styles={s}
                        style={s.miniPickBtn}
                        label={
                          <Text style={s.miniPickText}>
                            {currentPartId ? '✓ Linked' : '+ Stock ▾'}
                          </Text>
                        }
                        options={stockOptions}
                        selected={
                          currentPartId ? String(currentPartId) : 'none'
                        }
                        onPick={(k) => {
                          const option = stockOptions.find((o) => o.key === k);
                          linkInventoryPart(c, option?.raw || null);
                        }}
                      />
                    )}
                  </View>

                  <View style={s.bRow}>
                    <TextInput
                      style={[s.input, s.bName]}
                      placeholder="Item name"
                      value={b.parts?.[c]?.name || ''}
                      onChangeText={(t) => setPartField(c, 'name', t)}
                    />
                    <TextInput
                      style={[s.input, s.bPrice]}
                      placeholder="$0"
                      keyboardType="decimal-pad"
                      value={
                        b.parts?.[c]?.price == null
                          ? ''
                          : String(b.parts[c].price)
                      }
                      onChangeText={(t) => setPartField(c, 'price', t)}
                    />
                  </View>
                </View>
              );
            })}

            {b.id && (
              <>
                <TouchableOpacity style={s.btn} onPress={() => onDuplicate(b)}>
                  <Text style={s.btnT}>Duplicate build</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: '#c0392b' }]}
                  onPress={() => confirmDelete(b, onDelete)}>
                  <Text style={s.btnT}>Delete build</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}

        <View style={s.bTotal}>
          <Text style={s.name}>Parts total</Text>
          <Text style={s.val}>{money(buildTotal(b))}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const Line = ({ l, v, bold, color, styles: s }) => (
  <View style={s.line}>
    <Text
      style={[
        s.sub,
        bold && { fontWeight: '700', color: StyleSheet.flatten(s.name).color },
      ]}>
      {l}
    </Text>
    <Text style={[s.lineV, bold && { fontWeight: '700' }, color && { color }]}>
      {v}
    </Text>
  </View>
);


// ---------- Profit breakdown (tap the profit card) ----------
function ProfitBreakdown({ builds, expenses = [], styles: s, onClose }) {
  const now = new Date();
  const [mode, setMode] = useState('month');
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const all = builds
    .filter((b) => statusOf(b) === 'Sold')
    .map((b) => ({ b, r: buildProfit(b), t: new Date(b.soldAt || b.id) }));
  const inP = all.filter(({ t }) => t.getFullYear() === y && (mode === 'year' || t.getMonth() === m));
  const sum = (k) => inP.reduce((a, x) => a + x.r[k], 0);
  const from = mode === 'year' ? +new Date(y, 0, 1) : +new Date(y, m, 1);
  const to = mode === 'year' ? +new Date(y, 11, 31, 23, 59, 59) : +new Date(y, m + 1, 0, 23, 59, 59);
  const rev = sum('sp'), cost = sum('cost'), fees = sum('fee'), ship = sum('ship'), loss = sum('loss');
  const exp = expenseTotal(expenses, from, to);
  const profit = sum('profit') - exp;
  const margin = rev > 0 ? (profit / rev) * 100 : 0;
  const best = [...inP].sort((a, b) => b.r.profit - a.r.profit)[0];
  const dated = inP.filter(({ b }) => b.soldAt);
  const avgDays = dated.length ? dated.reduce((a, { b }) => a + Math.max(0, b.soldAt - b.id) / DAY, 0) / dated.length : null;

  const nb = mode === 'year' ? 12 : new Date(y, m + 1, 0).getDate();
  const bars = Array(nb).fill(0);
  inP.forEach(({ r, t }) => { bars[mode === 'year' ? t.getMonth() : t.getDate() - 1] += r.profit; });
  expenses.forEach((e) => charges(e, from, to).forEach((t) => { const d = new Date(t); bars[mode === 'year' ? d.getMonth() : d.getDate() - 1] -= n(e.amount); }));
  const hi = Math.max(0, ...bars), lo = Math.min(0, ...bars), span = hi - lo || 1, H = 110;

  const shift = (d) => {
    tick();
    if (mode === 'year') setY(y + d);
    else { const dt = new Date(y, m + d, 1); setY(dt.getFullYear()); setM(dt.getMonth()); }
  };
  const atEnd = mode === 'year' ? y >= now.getFullYear() : y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());
  const title = mode === 'year' ? String(y) : new Date(y, m, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const color = profit < 0 ? RED : GREEN;

  return (
    <Modal animationType="slide">
      <SafeAreaView style={s.root}>
        <View style={s.bHead}>
          <Text style={s.name}>Profit</Text>
          <TouchableOpacity onPress={onClose}><Text style={[s.link, { fontWeight: '700' }]}>Done</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          <View style={[s.seg, { margin: 0 }]}>
            {[['month', 'Month'], ['year', 'Year']].map(([k, l]) => (
              <TouchableOpacity key={k} style={[s.segBtn, mode === k && s.segOn]} onPress={() => { tick(); setMode(k); }}>
                <Text style={[s.segT, mode === k && { color: '#fff' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 14 }}>
            <TouchableOpacity onPress={() => shift(-1)}><Text style={[s.link, { fontSize: 28 }]}>‹</Text></TouchableOpacity>
            <Text style={s.name}>{title}</Text>
            <TouchableOpacity disabled={atEnd} onPress={() => shift(1)}><Text style={[s.link, { fontSize: 28, opacity: atEnd ? 0.25 : 1 }]}>›</Text></TouchableOpacity>
          </View>

          <View style={s.card}>
            <Text style={s.sub}>NET PROFIT</Text>
            <Text style={[s.val, { fontSize: 36, color }]}>{money(profit)}</Text>
            <Text style={s.sub}>{margin.toFixed(1)}% margin · {inP.length} build{inP.length === 1 ? '' : 's'} sold</Text>
            <View style={{ flexDirection: 'row', height: H, marginTop: 16 }}>
              {bars.map((v, i) => (
                <TouchableOpacity key={i} disabled={mode !== 'year'} style={{ flex: 1, marginHorizontal: mode === 'year' ? 3 : 1 }}
                  onPress={() => { tick(); setMode('month'); setM(i); }}>
                  <View style={{ position: 'absolute', left: 0, right: 0, top: ((v >= 0 ? hi - v : hi) / span) * H,
                    height: v ? Math.max(2, (Math.abs(v) / span) * H) : 0, backgroundColor: v < 0 ? RED : GREEN, borderRadius: 3 }} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: s.sub.color, opacity: 0.5, marginTop: -((lo < 0 ? -lo : 0) / span) * H }} />
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              {bars.map((_, i) => (
                <Text key={i} style={[s.sub, { flex: 1, fontSize: 10, textAlign: 'center', marginTop: 0 }]}>
                  {mode === 'year' ? 'JFMAMJJASOND'[i] : i % 5 === 0 ? i + 1 : ''}
                </Text>
              ))}
            </View>
            {mode === 'year' && <Text style={[s.sub, { marginTop: 8 }]}>Tap a bar to open that month</Text>}
          </View>

          <View style={s.card}>
            <Line l="Revenue" v={money(rev)} styles={s} />
            <Line l="Parts cost" v={'-' + money(cost)} styles={s} />
            <Line l="Fees" v={'-' + money(fees)} styles={s} />
            <Line l="Shipping" v={'-' + money(ship)} styles={s} />
            <Line l="Refunds / losses" v={'-' + money(loss)} styles={s} />
            <Line l="Expenses & subscriptions" v={'-' + money(exp)} styles={s} />
            <View style={s.hr} />
            <Line l="Net profit" v={money(profit)} bold color={color} styles={s} />
          </View>

          {inP.length > 0 && (
            <View style={s.card}>
              <Line l="Average profit per build" v={money((profit + exp) / inP.length)} styles={s} />
              {best && <Line l={`Best flip: ${best.b.name || '(unnamed)'}`} v={money(best.r.profit)} styles={s} />}
              {avgDays != null && <Line l="Average days to sell" v={avgDays.toFixed(1)} styles={s} />}
            </View>
          )}

          {inP.length === 0 && <Text style={[s.sub, { textAlign: 'center', marginTop: 20 }]}>No sold builds in this {mode}.</Text>}
          {inP.length > 0 && <Text style={[s.sub, { marginBottom: 6, marginTop: 4 }]}>SOLD BUILDS</Text>}
          {[...inP].sort((a, b) => b.t - a.t).map(({ b, r, t }) => (
            <View key={b.id} style={s.row}>
              <Line l={b.name || '(unnamed)'} v={money(r.profit)} bold color={r.profit < 0 ? RED : GREEN} styles={s} />
              <Text style={s.sub}>{t.toLocaleDateString('default', { month: 'short', day: 'numeric' })}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Max offer calculator ----------
function MaxOffer({ prefs, styles: s, onClose }) {
  const [sell, setSell] = useState('');
  const [fee, setFee] = useState(String(prefs.fee ?? ''));
  const [feeT, setFeeT] = useState(prefs.feeType || '$');
  const [ship, setShip] = useState(String(prefs.shipping ?? ''));
  const [other, setOther] = useState('');
  const [tT, setTT] = useState('%');
  const [tV, setTV] = useState('20');
  const [ask, setAsk] = useState('');

  const sp = n(sell);
  const feeAmt = feeT === '%' ? (sp * n(fee)) / 100 : n(fee);
  const target = tT === '%' ? (sp * n(tV)) / 100 : n(tV);
  const costs = feeAmt + n(ship) + n(other);
  const max = sp - costs - target;
  const askProfit = sp - costs - n(ask);
  const field = (label, value, set, ph = '$0.00') => (
    <>
      <Text style={s.sub}>{label}</Text>
      <TextInput style={s.input} placeholder={ph} keyboardType="decimal-pad" value={value} onChangeText={set} />
    </>
  );

  return (
    <Modal animationType="slide">
      <SafeAreaView style={s.root}>
        <View style={s.bHead}>
          <Text style={s.name}>Max offer</Text>
          <TouchableOpacity onPress={onClose}><Text style={[s.link, { fontWeight: '700' }]}>Done</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          {field('Expected sell price', sell, setSell)}

          <Text style={s.sub}>Fees</Text>
          <View style={s.bRow}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder={feeT === '%' ? '0' : '$0.00'} keyboardType="decimal-pad" value={fee} onChangeText={setFee} />
            <MenuButton styles={s} align="right" style={[s.unit, { marginBottom: 12 }]} label={<Text style={s.unitT}>{feeT} ▾</Text>}
              options={[{ key: '$', label: '$   Dollar amount' }, { key: '%', label: '%   Percent of sell price' }]}
              selected={feeT} onPick={setFeeT} />
          </View>

          {field('Shipping cost', ship, setShip)}
          {field('Other costs (repairs, extra parts)', other, setOther)}

          <Text style={s.sub}>Your target</Text>
          <View style={s.bRow}>
            <TextInput style={[s.input, { flex: 1 }]} keyboardType="decimal-pad" value={tV} onChangeText={setTV} />
            <MenuButton styles={s} align="right" style={[s.unit, { marginBottom: 12 }]} label={<Text style={s.unitT}>{tT === '%' ? '% margin' : '$ profit'} ▾</Text>}
              options={[{ key: '%', label: '%   Profit margin' }, { key: '$', label: '$   Profit in dollars' }]}
              selected={tT} onPick={setTT} />
          </View>

          <View style={s.card}>
            <Text style={s.sub}>MAX OFFER</Text>
            <Text style={[s.val, { fontSize: 36, color: max < 0 ? RED : GREEN }]}>{sp > 0 ? money(Math.max(max, 0)) : '$0.00'}</Text>
            <Text style={s.sub}>{sp <= 0 ? 'Enter a sell price to start.' : max < 0 ? 'No offer works at these numbers.' : 'Pay more than this and you miss your target.'}</Text>
            <View style={s.hr} />
            <Line l="Sell price" v={money(sp)} styles={s} />
            <Line l="Fees" v={'-' + money(feeAmt)} styles={s} />
            <Line l="Shipping" v={'-' + money(n(ship))} styles={s} />
            <Line l="Other costs" v={'-' + money(n(other))} styles={s} />
            <Line l="Your target profit" v={'-' + money(target)} styles={s} />
          </View>

          {field('Their asking price (optional)', ask, setAsk)}
          {n(ask) > 0 && sp > 0 && (
            <View style={s.card}>
              <Line l="Profit at their price" v={money(askProfit)} bold color={askProfit < 0 ? RED : GREEN} styles={s} />
              <Line l="Margin" v={((askProfit / sp) * 100).toFixed(1) + '%'} styles={s} />
              <Text style={[s.sub, { marginTop: 6 }]}>
                {n(ask) <= max ? 'Under your max. Good deal.' : `Counter at ${money(Math.max(max, 0))} or lower.`}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Build details: test checklist + photos ----------
function DetailsTab({ b, setB, styles: s }) {
  const checks = b.checks || {};
  const done = CHECKLIST.filter((_, i) => checks[i]).length;
  const photos = b.photos || [];
  const [view, setView] = useState(null);

  const toggle = (i) => {
    tick();
    setB((p) => ({ ...p, checks: { ...(p.checks || {}), [i]: !(p.checks || {})[i] } }));
  };
  const add = async (camera) => {
    if (!ImagePicker) return Alert.alert('Photos need expo-image-picker', 'Add expo-image-picker to your Snack dependencies, then try again.');
    try {
      let res;
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert('Camera is off', 'Allow camera access in the iPhone Settings app.');
        res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.6 });
      }
      if (res.canceled) return;
      const saved = res.assets.map((a, i) => keepPhoto(a.uri, i));
      setB((p) => ({ ...p, photos: [...(p.photos || []), ...saved] }));
    } catch (e) {
      Alert.alert('Could not add photo', String(e.message || e));
    }
  };
  const remove = (f) => {
    Alert.alert('Delete photo?', 'This removes the photo from this build.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
          try { if (FS && !/^(file|http|ph|content):/.test(f)) new FS.File(FS.Paths.document, f).delete(); } catch (e) {}
          setB((p) => ({ ...p, photos: (p.photos || []).filter((x) => x !== f) }));
          setView(null);
        } },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <View style={s.catHeader}>
        <Text style={s.sec}>TEST CHECKLIST</Text>
        <Text style={[s.sub, done === CHECKLIST.length && { color: GREEN, fontWeight: '700' }]}>
          {done === CHECKLIST.length ? 'Ready to list' : `${done}/${CHECKLIST.length}`}
        </Text>
      </View>
      <View style={s.card}>
        {CHECKLIST.map((label, i) => (
          <TouchableOpacity key={label} style={[s.bRow, { paddingVertical: 9 }]} onPress={() => toggle(i)}>
            <Text style={{ fontSize: 22, color: checks[i] ? GREEN : s.sub.color }}>{checks[i] ? '☑' : '☐'}</Text>
            <Text style={[s.name, { fontSize: 16, flex: 1, fontWeight: '400' }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.sub}>Test notes (temps, scores, serials)</Text>
      <TextInput style={[s.input, { height: 90 }]} multiline value={b.testNotes || ''} onChangeText={(t) => setB((p) => ({ ...p, testNotes: t }))} />

      <View style={s.catHeader}><Text style={s.sec}>PHOTOS ({photos.length})</Text></View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity style={[s.btn, { flex: 1, marginTop: 0 }]} onPress={() => add(true)}><Text style={s.btnT}>Take photo</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { flex: 1, marginTop: 0 }]} onPress={() => add(false)}><Text style={s.btnT}>Choose photos</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {photos.map((f) => (
          <TouchableOpacity key={f} onPress={() => setView(f)}>
            <Image source={{ uri: photoUri(f) }} style={{ width: 100, height: 100, borderRadius: 10 }} />
          </TouchableOpacity>
        ))}
      </View>

      {view && (
        <Modal animationType="fade" onRequestClose={() => setView(null)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <Image source={{ uri: photoUri(view) }} style={{ flex: 1 }} resizeMode="contain" />
            <View style={{ flexDirection: 'row', gap: 10, padding: 16 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, marginTop: 0 }]} onPress={() => setView(null)}><Text style={s.btnT}>Close</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1, marginTop: 0, backgroundColor: RED }]} onPress={() => remove(view)}><Text style={s.btnT}>Delete</Text></TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </ScrollView>
  );
}

// ---- Import from the old Panda Manager (Windows) spreadsheet export ----
const OLD_CATS = { cpu: 'CPU', cooler: 'Cooler', mobo: 'MOBO', ram: 'RAM', storage: 'Storage', gpu: 'GPU', psu: 'PSU', case: 'Case', other: 'Etc.' };
const oldCat = (c) => OLD_CATS[String(c || '').trim().toLowerCase()] || 'Etc.';
const PM_SUMMARY_LABELS = ['total cost', 'extra costs', 'shipping out', 'listed price', 'sold price', 'profit'];
const pmNum = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
const pmStr = (v) => { const x = pmNum(v); return x == null || x === 0 ? '' : String(Math.round(x * 100) / 100); };
const pmStamp = (v) => {
  if (v instanceof Date) return +v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return +new Date(1899, 11, 30 + Math.floor(v), 12); // Excel date number
  const m = String(v == null ? '' : v).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  return m ? +new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)) : null;
};
const pmTable = (rows) => {
  if (!rows || !rows.length) return [];
  const head = rows[0].map((h) => String(h == null ? '' : h).trim());
  return rows.slice(1).filter((r) => r.some((x) => x != null && x !== '')).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] == null ? null : r[i]; });
    return o;
  });
};
// The app has one slot per category, so a second part in the same category goes into Etc.
function pmAddSlot(parts, cat, name, price) {
  const cur = parts[cat];
  if (!cur) { parts[cat] = { name, price: pmStr(price) }; return; }
  if (cat !== 'Etc.') return pmAddSlot(parts, 'Etc.', name, price);
  parts['Etc.'] = { name: [cur.name, name].filter(Boolean).join(' + '), price: pmStr((pmNum(cur.price) || 0) + (price || 0)) };
}

// sheets = { 'Builds Summary': [[...rows]], 'Builds Detail': [[...]], 'Parts Inventory': [[...]] }
function parsePandaExport(sheets) {
  const notes = [];
  const builds = [];
  const byName = {};

  pmTable(sheets['Builds Summary']).forEach((r) => {
    const name = String(r['Name'] || '').trim();
    if (!name) return;
    const listed = pmNum(r['Listed Price']) || 0;
    const sold = pmNum(r['Sell Price']) || 0;
    const st = String(r['Status'] || '').toLowerCase();
    const status = st === 'sold' ? 'Sold' : st === 'listed' ? 'Listed' : st.includes('progress') ? 'In progress' : listed > 0 ? 'Listed' : 'In progress';
    const created = pmStamp(r['Created']) || Date.now();
    const soldAt = status === 'Sold' ? pmStamp(r['Sold On']) : null;
    if (status === 'Sold' && !soldAt) notes.push(`"${name}" is sold but has no sold date, so it counts in the month it was created.`);
    const b = {
      id: created + (pmNum(r['ID']) || 0),
      name,
      status,
      parts: {},
      sell: { price: pmStr(sold || listed), fee: '', feeType: '$', shipping: pmStr(r['Shipping Out']), loss: '' },
      soldAt,
      listedAt: null,
      updatedAt: created,
      testNotes: [status === 'Sold' && r['Buyer'] ? `Sold via ${r['Buyer']}.` : '', r['Notes']].filter(Boolean).join('\n'),
    };
    builds.push(b);
    byName[name] = b;
  });

  // Builds Detail: one block per build (header row ends in "Price | Market"), then its parts, then totals
  let cur = null, lastCat = 'Etc.';
  (sheets['Builds Detail'] || []).forEach((row) => {
    const [a, nm, price, market] = row;
    if (price === 'Price' && market === 'Market') {
      const title = String(a || '').trim();
      cur = byName[title] || null;
      lastCat = 'Etc.';
      if (!cur) notes.push(`Parts for "${title}" were skipped because that build isn't in Builds Summary.`);
      return;
    }
    if (!cur) return;
    const label = String(a == null ? '' : a).trim().toLowerCase();
    if (PM_SUMMARY_LABELS.includes(label)) {
      if (label === 'extra costs') cur.sell.fee = pmStr(price);
      if (label === 'shipping out' && !cur.sell.shipping) cur.sell.shipping = pmStr(price);
      return;
    }
    const partName = String(nm == null ? '' : nm).trim();
    if (!partName && pmNum(price) == null) return;
    const cat = label ? oldCat(a) : lastCat;
    lastCat = cat;
    pmAddSlot(cur.parts, cat, partName, pmNum(price));
  });

  const inventory = [];
  pmTable(sheets['Parts Inventory']).forEach((r) => {
    const name = String(r['Name'] || '').trim();
    if (!name) return;
    const st = String(r['Status'] || '').toLowerCase();
    const item = {
      id: (pmStamp(r['Added']) || Date.now()) + (pmNum(r['ID']) || 0),
      name,
      category: oldCat(r['Category']),
      quantity: String(pmNum(r['Qty']) || 1),
      buy_price: pmStr(r['Buy Price']),
      status: st === 'sold' ? 'Sold' : st === 'assigned' ? 'In Build' : st === 'listed' ? 'Listed' : 'In Stock',
      notes: r['Notes'] ? String(r['Notes']) : '',
    };
    inventory.push(item);
    const b = byName[String(r['Assigned To'] || '').trim()];
    const slot = b && Object.values(b.parts).find((p) => !p.partId && p.name.toLowerCase() === name.toLowerCase());
    if (slot) slot.partId = item.id;
  });

  return { builds, inventory, notes };
}

// mode: 'merge' keeps what's already in the app (re-importing never duplicates), 'replace' starts over
function applyImport(data, parsed, mode) {
  const keepB = mode === 'replace' ? [] : data.builds || [];
  const keepI = mode === 'replace' ? [] : data.inventory || [];
  const haveB = new Set(keepB.map((b) => b.id));
  const haveI = new Set(keepI.map((p) => p.id));
  const builds = [...keepB];
  parsed.builds.filter((b) => !haveB.has(b.id)).sort((a, b) => a.id - b.id).forEach((b) => builds.push({ ...b, sku: generateSku(b, builds, new Date(b.id)) }));
  const inventory = [...keepI, ...parsed.inventory.filter((p) => !haveI.has(p.id))];
  return { ...data, builds, inventory };
}

// ---- CSV export for taxes ----
function rangeFor(key) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const r = (a, b, label) => ({ from: +a, to: Math.min(+b, Date.now()), label });
  if (key === 'month') return r(new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59), 'this-month');
  if (key === 'lastmonth') return r(new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59), 'last-month');
  if (key === 'lastyear') return r(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31, 23, 59, 59), String(y - 1));
  if (key === 'all') return r(new Date(2000, 0, 1), new Date(), 'all-time');
  return r(new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59), String(y));
}
const RANGE_LABELS = { month: 'This month', lastmonth: 'Last month', year: 'This year', lastyear: 'Last year', all: 'All time' };
const csvCell = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const csvRow = (a) => a.map(csvCell).join(',');
const iso = (t) => new Date(t).toISOString().slice(0, 10);

function buildCsv(data, range) {
  const { from, to } = rangeFor(range);
  const rows = [csvRow(['SALES']), csvRow(['Date sold', 'SKU', 'Build', 'Sale price', 'Parts cost', 'Fees', 'Shipping', 'Refund/loss', 'Profit'])];
  const tot = { sp: 0, cost: 0, fee: 0, ship: 0, loss: 0, profit: 0 };
  (data.builds || [])
    .filter((b) => statusOf(b) === 'Sold')
    .map((b) => ({ b, r: buildProfit(b), t: b.soldAt || b.id }))
    .filter((x) => x.t >= from && x.t <= to)
    .sort((a, b) => a.t - b.t)
    .forEach(({ b, r, t }) => {
      rows.push(csvRow([iso(t), b.sku, b.name, r.sp.toFixed(2), r.cost.toFixed(2), r.fee.toFixed(2), r.ship.toFixed(2), r.loss.toFixed(2), r.profit.toFixed(2)]));
      Object.keys(tot).forEach((k) => { tot[k] += r[k]; });
    });
  rows.push(csvRow(['TOTAL', '', '', tot.sp.toFixed(2), tot.cost.toFixed(2), tot.fee.toFixed(2), tot.ship.toFixed(2), tot.loss.toFixed(2), tot.profit.toFixed(2)]), '');
  rows.push(csvRow(['EXPENSES']), csvRow(['Date', 'Name', 'Category', 'Amount', 'Repeats', 'Build']));
  const lines = [];
  (data.expenses || []).forEach((e) => charges(e, from, to).forEach((t) => lines.push({ t, e })));
  let expTotal = 0;
  lines.sort((a, b) => a.t - b.t).forEach(({ t, e }) => {
    rows.push(csvRow([iso(t), e.name, e.category, n(e.amount).toFixed(2), FREQ[e.recurring || 'none'], e.buildName || '']));
    expTotal += n(e.amount);
  });
  rows.push(csvRow(['TOTAL', '', '', expTotal.toFixed(2)]), '', csvRow(['NET PROFIT (sales profit minus expenses)', (tot.profit - expTotal).toFixed(2)]));
  return rows.join('\n');
}

async function shareCsv(csv, label) {
  try {
    const f = new FS.File(FS.Paths.cache, `panda-${label}.csv`);
    if (f.exists) f.delete();
    f.create();
    f.write(csv);
    await Share.share({ url: f.uri });
  } catch (e) {
    await Share.share({ message: csv });
  }
}

// ---- Subscription reminders: a notification at 9 AM the day before each charge ----
if (Notifications) Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});
async function syncReminders(expenses, on) {
  try {
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!on) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const now = Date.now();
    const items = [];
    expenses.forEach((e) => {
      if (!e.recurring || e.recurring === 'none' || e.ended) return;
      charges(e, now, now + 75 * DAY).forEach((t) => {
        const d = new Date(t);
        d.setDate(d.getDate() - 1);
        d.setHours(9, 0, 0, 0);
        if (+d > now) items.push({ when: d, e });
      });
    });
    for (const { when, e } of items.sort((a, b) => a.when - b.when).slice(0, 50)) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Subscription charges tomorrow', body: `${e.name || 'Subscription'}: ${money(n(e.amount))}` },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    }
  } catch (err) {}
}

function ExpenseRow({ e, styles: s, onPress }) {
  const rec = e.recurring && e.recurring !== 'none';
  const next = rec && !e.ended ? charges(e, Date.now(), Date.now() + 400 * DAY)[0] : null;
  const bits = [
    e.category,
    rec ? FREQ[e.recurring] : fmtDate(e.date),
    rec ? (e.ended ? 'cancelled ' + fmtDate(e.ended) : next ? 'next ' + fmtDate(next) : null) : null,
    e.buildName ? 'for ' + e.buildName : null,
  ].filter(Boolean);
  return (
    <TouchableOpacity style={s.row} onPress={onPress}>
      <Line l={e.name || '(unnamed)'} v={'-' + money(n(e.amount))} bold styles={s} />
      <Text style={s.sub}>{bits.join(' · ')}</Text>
    </TouchableOpacity>
  );
}

function ExpenseEditor({ rec, builds, dark, styles: s, onSave, onDelete, onClose }) {
  const [r, setR] = useState({ name: '', category: 'Supplies', recurring: 'none', date: noon(new Date()), ...rec, amount: rec.amount == null ? '' : String(rec.amount) });
  const [dtext, setDtext] = useState(new Date(r.date).toISOString().slice(0, 10));
  const isRec = r.recurring !== 'none';
  const recentBuilds = [...builds].sort((a, b) => (b.updatedAt || b.id || 0) - (a.updatedAt || a.id || 0)).slice(0, 12);

  const save = () => {
    if (n(r.amount) <= 0) return Alert.alert('Enter an amount', 'The expense needs an amount above $0.');
    onSave({ ...r, amount: n(r.amount) });
  };
  const confirm = (title, msg, label, fn) =>
    Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: label, style: 'destructive', onPress: fn }]);

  return (
    <Modal animationType="slide">
      <SafeAreaView style={s.root}>
        <View style={s.bHead}>
          <TouchableOpacity onPress={onClose}><Text style={s.link}>Cancel</Text></TouchableOpacity>
          <Text style={s.name}>{r.id ? 'Edit expense' : 'New expense'}</Text>
          <TouchableOpacity onPress={save}><Text style={[s.link, { fontWeight: '700' }]}>Save</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <Text style={s.sub}>Name</Text>
          <TextInput style={s.input} placeholder="Thermal paste, tape gun, Adobe..." value={r.name} onChangeText={(t) => setR({ ...r, name: t })} />
          <Text style={s.sub}>Amount</Text>
          <TextInput style={s.input} placeholder="$0.00" keyboardType="decimal-pad" value={r.amount} onChangeText={(t) => setR({ ...r, amount: t })} />

          <Text style={s.sub}>Category</Text>
          <MenuButton styles={s} style={[s.unit, { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }]}
            label={<><Text style={[s.unitT, { fontSize: 16 }]}>{r.category}</Text><Text style={s.unitT}>▾</Text></>}
            options={EXP_CATS.map((c) => ({ key: c, label: c }))} selected={r.category} onPick={(k) => setR({ ...r, category: k })} />

          <Text style={s.sub}>{isRec ? 'First charged on' : 'Date bought'}</Text>
          {DateTimePicker ? (
            <DateTimePicker value={new Date(r.date)} mode="date" display="compact" themeVariant={dark ? 'dark' : 'light'}
              style={{ alignSelf: 'flex-start', marginBottom: 12 }} onChange={(_, d) => d && setR({ ...r, date: noon(d) })} />
          ) : (
            <TextInput style={s.input} placeholder="YYYY-MM-DD" value={dtext} autoCorrect={false}
              onChangeText={(t) => { setDtext(t); if (/^\d{4}-\d{2}-\d{2}$/.test(t)) setR({ ...r, date: noon(new Date(t + 'T12:00:00')) }); }} />
          )}

          <Text style={s.sub}>How often does it charge?</Text>
          <MenuButton styles={s} style={[s.unit, { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }]}
            label={<><Text style={[s.unitT, { fontSize: 16 }]}>{FREQ[r.recurring]}</Text><Text style={s.unitT}>▾</Text></>}
            options={Object.keys(FREQ).map((k) => ({ key: k, label: FREQ[k] }))} selected={r.recurring}
            onPick={(k) => setR({ ...r, recurring: k, ended: k === 'none' ? null : r.ended })} />

          <Text style={s.sub}>For a specific build? (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {[{ id: null, name: 'None' }, ...recentBuilds].map((b) => {
              const on = (r.buildId || null) === b.id;
              return (
                <TouchableOpacity key={String(b.id)} style={[s.chip, on && s.chipOn, { marginRight: 8 }]}
                  onPress={() => { tick(); setR({ ...r, buildId: b.id, buildName: b.id ? b.name || '(unnamed)' : null }); }}>
                  <Text style={on ? { color: '#fff' } : s.chipT}>{b.name || '(unnamed)'}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={s.sub}>Note</Text>
          <TextInput style={[s.input, { height: 70 }]} multiline value={r.note || ''} onChangeText={(t) => setR({ ...r, note: t })} />

          {isRec && r.id && !r.ended && (
            <TouchableOpacity style={s.btn} onPress={() => confirm('Cancel subscription?', 'It stops counting as an expense from today. Past charges stay in your history.', 'Cancel it', () => setR({ ...r, ended: noon(new Date()) }))}>
              <Text style={s.btnT}>Cancel subscription</Text>
            </TouchableOpacity>
          )}
          {isRec && r.ended && (
            <View>
              <Text style={s.sub}>Cancelled {fmtDate(r.ended)}</Text>
              <TouchableOpacity style={s.btn} onPress={() => setR({ ...r, ended: null })}><Text style={s.btnT}>Resume subscription</Text></TouchableOpacity>
            </View>
          )}
          {r.id && (
            <TouchableOpacity style={[s.btn, { backgroundColor: RED }]} onPress={() => confirm('Delete expense?', isRec ? 'All of its past and future charges will be removed from your numbers.' : "This can't be undone.", 'Delete', () => onDelete(r.id))}>
              <Text style={s.btnT}>Delete</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Financials({ builds, expenses = [], onProfit, onExpense, styles: s }) {
  const t = {
    rev: 0,
    cost: 0,
    fees: 0,
    ship: 0,
    profit: 0,
    sold: [],
    tied: 0,
    proj: 0,
  };
  builds.forEach((b) => {
    const r = buildProfit(b);
    if (statusOf(b) === 'Sold') {
      t.sold.push({ b, r });
      t.rev += r.sp;
      t.cost += r.cost;
      t.fees += r.fee;
      t.ship += r.ship;
      t.profit += r.profit;
    } else {
      t.tied += r.cost;
      if (r.sp > 0) t.proj += r.profit;
    }
  });

  const expAll = expenseTotal(expenses, 0, Date.now());
  const lossAll = t.sold.reduce((a, { r }) => a + r.loss, 0);
  const net = t.profit - expAll;
  const margin = t.rev > 0 ? (net / t.rev) * 100 : 0;
  const subs = expenses.filter((e) => e.recurring && e.recurring !== 'none');
  const once = expenses.filter((e) => !e.recurring || e.recurring === 'none').sort((a, b) => b.date - a.date);
  const monthlySubs = subs.filter((e) => !e.ended).reduce((a, e) => a + n(e.amount) * PER_MONTH[e.recurring], 0);
  const mk = (d) => new Date(d).toLocaleString('default', { month: 'long', year: 'numeric' });
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity activeOpacity={0.7} onPress={onProfit}>
        <Card
          label="Net profit · tap for breakdown"
          value={money(net)}
          big
          styles={s}
        />
      </TouchableOpacity>
      <Card label="Profit margin" value={margin.toFixed(1) + '%'} styles={s} />
      <View style={s.card}>
        <Line l="Revenue" v={money(t.rev)} styles={s} />
        <Line l="Parts cost" v={'-' + money(t.cost)} styles={s} />
        <Line l="Fees" v={'-' + money(t.fees)} styles={s} />
        <Line l="Shipping" v={'-' + money(t.ship)} styles={s} />
        <Line l="Refunds / losses" v={'-' + money(lossAll)} styles={s} />
        <Line l="Expenses & subscriptions" v={'-' + money(expAll)} styles={s} />
        <View style={s.hr} />
        <Line
          l="Builds sold"
          v={`${t.sold.length} of ${builds.length}`}
          bold
          styles={s}
        />
      </View>
      <View style={s.card}>
        <Line l="Tied up in unsold builds" v={money(t.tied)} styles={s} />
        <Line l="Projected profit if they sell" v={money(t.proj)} styles={s} />
      </View>
      <View style={s.catHeader}>
        <Text style={s.sec}>SUBSCRIPTIONS</Text>
        <Text style={s.sub}>{money(monthlySubs)} / month</Text>
      </View>
      {subs.length === 0 && <Text style={[s.sub, { marginBottom: 10 }]}>None yet. Add one below and set it to repeat.</Text>}
      {subs.map((e) => <ExpenseRow key={e.id} e={e} styles={s} onPress={() => onExpense(e)} />)}

      <View style={s.catHeader}>
        <Text style={s.sec}>EXPENSES</Text>
        <TouchableOpacity onPress={() => onExpense(null)}><Text style={s.link}>+ Add expense</Text></TouchableOpacity>
      </View>
      {once.length === 0 && <Text style={[s.sub, { marginBottom: 10 }]}>No one-time expenses yet.</Text>}
      {once.map((e, i) => (
        <React.Fragment key={e.id}>
          {(i === 0 || mk(once[i - 1].date) !== mk(e.date)) && <Text style={[s.sub, { marginTop: 8, marginBottom: 4 }]}>{mk(e.date).toUpperCase()}</Text>}
          <ExpenseRow e={e} styles={s} onPress={() => onExpense(e)} />
        </React.Fragment>
      ))}

      {t.sold.length > 0 && (
        <Text style={[s.sub, { marginBottom: 6, marginTop: 12 }]}>SOLD BUILDS</Text>
      )}
      {t.sold.map(({ b, r }) => (
        <View key={b.id} style={s.row}>
          <Line
            l={b.name || '(unnamed)'}
            v={money(r.profit)}
            bold
            styles={s}
            color={r.profit < 0 ? '#c0392b' : '#1e8e3e'}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function Home({ data, styles: s, goTab, onOpen, onNew, onProfit, onOffer, onExpense, onSettings }) {
  const builds = data.builds || [];
  const inv = data.inventory || [];

  // This month (builds sold before the update use the date they were created)
  const now = new Date();
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  let rev = 0, profit = 0, soldCount = 0;
  builds.forEach((b) => {
    if (statusOf(b) !== 'Sold') return;
    const d = new Date(b.soldAt || b.id);
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return;
    const r = buildProfit(b);
    rev += r.sp;
    profit += r.profit;
    soldCount++;
  });
  const expM = expenseTotal(data.expenses || [], +new Date(now.getFullYear(), now.getMonth(), 1), +new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));
  const net = profit - expM;
  const margin = rev > 0 ? (net / rev) * 100 : 0;

  // Pipeline
  const counts = BUILD_STATUSES.map((st) => [st, builds.filter((b) => statusOf(b) === st).length]);
  const listed = builds.filter((b) => statusOf(b) === 'Listed');
  const listedProfit = listed.reduce((t, b) => t + (n(b.sell?.price) > 0 ? buildProfit(b).profit : 0), 0);
  const inBuilds = builds.filter((b) => statusOf(b) !== 'Sold').reduce((t, b) => t + buildTotal(b), 0);

  const limit = data.settings?.staleDays == null || data.settings.staleDays === '' ? 30 : n(data.settings.staleDays);
  const aging =
    limit > 0
      ? [
          ...builds.map((b) => ({ key: 'b' + b.id, name: b.name, kind: 'builds', rec: b, age: buildAge(b), label: statusOf(b) })),
          ...inv.map((p) => ({ key: 'p' + p.id, name: p.name, kind: 'inventory', rec: p, age: itemAge(p), label: p.status || 'In Stock' })),
        ].filter((x) => x.age != null && x.age >= limit).sort((a, b) => b.age - a.age)
      : [];

  const lastB = data.settings?.lastBackupAt;
  const backupDue = builds.length + inv.length + (data.expenses || []).length > 0 && (!lastB || daysSince(lastB) >= 14);

  // Lists
  const recent = [...builds].sort((a, b) => (b.updatedAt || b.id || 0) - (a.updatedAt || a.id || 0)).slice(0, 4);
  const stock = inv.filter((p) => (p.status || 'In Stock') === 'In Stock');
  const units = stock.reduce((t, p) => t + (n(p.quantity) || 1), 0);
  const stockCost = stock.reduce((t, p) => t + n(p.buy_price) * (n(p.quantity) || 1), 0);
  const newest = [...stock].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 3);

  const Header = ({ title, to }) => (
    <View style={s.catHeader}>
      <Text style={s.sec}>{title}</Text>
      {to && (
        <TouchableOpacity onPress={() => goTab(to)}>
          <Text style={s.link}>See all</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}>
      {backupDue && (
        <TouchableOpacity style={s.card} onPress={onSettings}>
          <Text style={s.name}>Back up your data</Text>
          <Text style={s.sub}>
            {lastB ? `Your last backup was ${daysSince(lastB)} days ago.` : "You haven't made a backup yet."} Tap to open Settings.
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity activeOpacity={0.7} style={s.card} onPress={onProfit}>
        <Text style={s.sub}>{monthName.toUpperCase()}</Text>
        <Text style={[s.val, { fontSize: 34, color: net < 0 ? RED : GREEN }]}>{money(net)}</Text>
        <Text style={s.sub}>net profit after expenses and losses</Text>
        <View style={s.hr} />
        <Line l="Revenue" v={money(rev)} styles={s} />
        <Line l="Builds sold" v={String(soldCount)} styles={s} />
        <Line l="Expenses" v={'-' + money(expM)} styles={s} />
        <Line l="Profit margin" v={margin.toFixed(1) + '%'} styles={s} />
        <Text style={[s.link, { marginTop: 8 }]}>View breakdown ›</Text>
      </TouchableOpacity>

      <View style={s.tiles}>
        {[
          ['hammer-outline', 'New build', () => onNew('builds')],
          ['cube-outline', 'Add part', () => onNew('inventory')],
          ['receipt-outline', 'Expense', () => onExpense()],
          ['calculator-outline', 'Max offer', () => onOffer()],
        ].map(([ic, label, fn]) => (
          <TouchableOpacity key={label} style={s.tile} activeOpacity={0.7} onPress={() => { tick(); fn(); }}>
            <View style={s.tileIcon}><Icon name={ic} size={22} color={P.link} /></View>
            <Text style={s.tileT}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Header title="PIPELINE" />
      <View style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {counts.map(([st, c]) => (
            <TouchableOpacity key={st} style={{ alignItems: 'center', flex: 1 }} onPress={() => goTab('builds')}>
              <Text style={s.val}>{c}</Text>
              <Text style={s.sub}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {listed.length > 0 && (
          <>
            <View style={s.hr} />
            <Line l={`Projected profit (${listed.length} listed)`} v={money(listedProfit)} color={listedProfit < 0 ? RED : GREEN} styles={s} />
          </>
        )}
      </View>

      {aging.length > 0 && (
        <>
          <Header title={`SITTING ${limit}+ DAYS (${aging.length})`} />
          {aging.slice(0, 4).map((x) => (
            <TouchableOpacity key={x.key} style={s.row} onPress={() => { tick(); onOpen({ kind: x.kind, rec: x.rec }); }}>
              <Line l={x.name || '(unnamed)'} v={`${x.age} days`} bold styles={s} />
              <Text style={s.sub}>{x.label}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      <Header title="RECENT BUILDS" to="builds" />
      {recent.length === 0 && <Text style={[s.sub, { marginBottom: 10 }]}>No builds yet. Tap + New build.</Text>}
      {recent.map((b) => {
        const r = buildProfit(b);
        return (
          <TouchableOpacity key={b.id} style={s.row} onPress={() => { tick(); onOpen({ kind: 'builds', rec: b }); }}>
            <Text style={s.name}>{b.name || '(unnamed)'}</Text>
            <Text style={s.sub}>
              {statusOf(b)} · {money(buildTotal(b))} in parts{r.sp > 0 ? ' · profit ' + money(r.profit) : ''}
            </Text>
          </TouchableOpacity>
        );
      })}

      <Header title="INVENTORY" to="inventory" />
      <View style={s.card}>
        <Line l="Parts in stock" v={`${units} unit${units === 1 ? '' : 's'}`} styles={s} />
        <Line l="Stock at cost" v={money(stockCost)} styles={s} />
        <Line l="Parts in unsold builds" v={money(inBuilds)} styles={s} />
      </View>
      {newest.map((p) => (
        <TouchableOpacity key={p.id} style={s.row} onPress={() => { tick(); onOpen({ kind: 'inventory', rec: p }); }}>
          <Text style={s.name}>{p.name || '(unnamed)'}</Text>
          <Text style={s.sub}>
            {p.category ? p.category + ' · ' : ''}qty {p.quantity || 1} · buy {money(n(p.buy_price))}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const Card = ({ label, value, big, styles: s }) => (
  <View style={s.card}>
    <Text style={s.sub}>{label}</Text>
    <Text style={[s.val, big && { fontSize: 32 }]}>{value}</Text>
  </View>
);

const FIELDS = {
  inventory: [
    ['name', 'Item / Part Name'],
    ['category', 'Category (GPU, CPU, Laptop, etc.)'],
    ['quantity', 'Quantity', 1],
    ['buy_price', 'Buy price', 1],
    ['sell_price', 'Sold / Listed price', 1],
    ['notes', 'Notes'],
  ],
};

function Editor({ edit, onClose, onSave, onDelete, styles: s }) {
  const [rec, setRec] = useState(edit.rec);

  return (
    <Modal animationType="slide">
      <SafeAreaView style={s.root}>
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled">
          {FIELDS.inventory.map(([k, label, num]) => (
            <View key={k}>
              <Text style={s.sub}>{label}</Text>
              <TextInput
                style={s.input}
                value={rec[k] == null ? '' : String(rec[k])}
                keyboardType={num ? 'decimal-pad' : 'default'}
                onChangeText={(t) => setRec({ ...rec, [k]: t })}
              />
            </View>
          ))}
          <View style={s.chips}>
            {INVENTORY_STATUSES.map((st) => (
              <TouchableOpacity
                key={st}
                style={[s.chip, rec.status === st && s.chipOn]}
                onPress={() => setRec({ ...rec, status: st })}>
                <Text style={rec.status === st ? { color: '#fff' } : s.chipT}>
                  {st}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.btn} onPress={() => onSave(rec)}>
            <Text style={s.btnT}>Save</Text>
          </TouchableOpacity>
          {rec.id && (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#c0392b' }]}
              onPress={() => onDelete(rec.id)}>
              <Text style={s.btnT}>Delete</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={{ padding: 16 }} onPress={onClose}>
            <Text style={[{ textAlign: 'center' }, s.link]}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const LIGHT = {
  bg: '#F2F2F7', card: '#FFFFFF', text: '#111114', sub: '#6E6E76', btn: '#3B6FF0',
  chip: '#E7E7EC', line: '#E3E3E8', link: '#3B6FF0', shadow: 0.07,
};
const DARK = {
  bg: '#000000', card: '#1C1C1E', text: '#F5F5F7', sub: '#9A9AA2', btn: '#4C82FF',
  chip: '#2C2C2E', line: '#303034', link: '#5B8DFF', shadow: 0,
};
P = LIGHT;

const makeStyles = (c) => {
  const lift = { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: c.shadow, shadowRadius: 12, elevation: c.shadow ? 2 : 0 };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
    title: { color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
    gear: { fontSize: 22, color: c.text },
    gearBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', ...lift },

    row: { backgroundColor: c.card, padding: 16, borderRadius: 18, marginBottom: 12, ...lift },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 10 },
    rowRight: { color: c.text, fontSize: 15, fontWeight: '700' },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    pillT: { fontSize: 12, fontWeight: '700' },
    name: { color: c.text, fontSize: 17, fontWeight: '600' },
    sub: { color: c.sub, fontSize: 13, marginTop: 2 },
    empty: { textAlign: 'center', color: c.sub, fontSize: 15 },
    emptyWrap: { alignItems: 'center', marginTop: 60, gap: 10 },
    card: { backgroundColor: c.card, padding: 18, borderRadius: 18, marginBottom: 12, ...lift },
    val: { color: c.text, fontSize: 26, fontWeight: '700' },

    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 12, gap: 8 },
    searchInput: { flex: 1, color: c.text, fontSize: 16, paddingVertical: 11 },
    sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 14, height: 44 },
    sortT: { color: c.link, fontSize: 15, fontWeight: '600' },
    input: { color: c.text, backgroundColor: c.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, marginBottom: 14, marginTop: 6 },
    btn: { backgroundColor: c.btn, paddingVertical: 15, borderRadius: 14, marginTop: 12 },
    btnT: { color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
    chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.chip },
    chipOn: { backgroundColor: c.btn },
    chipT: { color: c.text },

    tabs: { flexDirection: 'row', backgroundColor: c.card, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingTop: 6 },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 2 },
    tabT: { fontSize: 11, fontWeight: '600', color: c.sub },
    tabOn: { color: c.link },
    fab: { position: 'absolute', right: 20, bottom: 92, width: 58, height: 58, borderRadius: 29, backgroundColor: c.btn, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
    fabT: { color: '#fff', fontSize: 30, marginTop: -2 },

    tiles: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    tile: { flex: 1, backgroundColor: c.card, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 8, ...lift },
    tileIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' },
    tileT: { color: c.text, fontSize: 12, fontWeight: '600' },

    bHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: c.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line },
    link: { color: c.link, fontSize: 16 },
    catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    sec: { color: c.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 26, marginBottom: 8 },
    bRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bCat: { color: c.text, width: 58, fontWeight: '700' },
    bName: { flex: 1, marginBottom: 8 },
    bPrice: { width: 84, marginBottom: 8 },
    miniPickBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    miniPickText: { color: c.link, fontSize: 13, fontWeight: '600' },
    bTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: c.card, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line },

    seg: { flexDirection: 'row', margin: 16, marginBottom: 0, backgroundColor: c.chip, borderRadius: 12, padding: 3 },
    segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10 },
    segOn: { backgroundColor: c.btn },
    segT: { textAlign: 'center', fontWeight: '600', color: c.sub },
    unit: { backgroundColor: c.card, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
    unitT: { color: c.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    lineV: { color: c.text, fontSize: 15, fontWeight: '500' },
    hr: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginVertical: 8 },

    popShadow: { position: 'absolute', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 20 },
    popBlur: { borderRadius: 26, overflow: 'hidden', backgroundColor: 'rgba(28,28,30,0.97)', paddingVertical: 4 },
    popRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 52, paddingHorizontal: 22 },
    popSep: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
    popT: { color: '#fff', fontSize: 17 },
  });
};