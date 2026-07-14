import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const COLORS = ['#4ecca3','#48b1ff','#ff6b6b','#ffd93d','#6c5ce7','#a29bfe','#fd79a8','#00cec9','#e17055','#0984e3','#636e72','#b2bec3','#d63031','#e84393','#00b894','#fdcb6e','#74b9ff','#a4b0be'];

function formatMoney(n, currency = 'ARS') {
  const prefix = currency === 'USD' ? 'U$S' : '$';
  return `${prefix}${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('resumen');
  const [filterCat, setFilterCat] = useState(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Fetch data
  useEffect(() => {
    async function load() {
      setLoading(true);
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

      const [expRes, catRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('*, categories(name, id), expense_types(name)')
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: false }),
        supabase
          .from('categories')
          .select('id, name')
          .order('id'),
      ]);

      setExpenses(expRes.data || []);
      setCategories(catRes.data || []);
      setLoading(false);
    }
    load();
  }, [year, month]);

  // Computed
  const totalARS = useMemo(() =>
    expenses.filter(e => e.currency === 'ARS').reduce((s, e) => s + Number(e.amount), 0),
    [expenses]
  );
  const totalUSD = useMemo(() =>
    expenses.filter(e => e.currency === 'USD').reduce((s, e) => s + Number(e.amount), 0),
    [expenses]
  );

  const byCategory = useMemo(() => {
    const map = {};
    expenses.forEach(e => {
      const cat = e.categories?.name || 'Sin categoría';
      if (!map[cat]) map[cat] = { name: cat, ARS: 0, USD: 0 };
      map[cat][e.currency] += Number(e.amount);
    });
    return Object.values(map).sort((a, b) => (b.ARS + b.USD * 1000) - (a.ARS + a.USD * 1000));
  }, [expenses]);

  const byType = useMemo(() => {
    const map = { Fijo: 0, Variable: 0 };
    expenses.filter(e => e.currency === 'ARS').forEach(e => {
      const type = e.expense_types?.name === 'fijo' ? 'Fijo' : 'Variable';
      map[type] += Number(e.amount);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    if (!filterCat) return expenses;
    return expenses.filter(e => e.categories?.name === filterCat);
  }, [expenses, filterCat]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setFilterCat(null);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setFilterCat(null);
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: '#16213e', padding: '8px 12px', borderRadius: 8, border: '1px solid #333' }}>
        <div style={{ color: '#fff', fontWeight: 600 }}>{d.name}</div>
        {d.ARS > 0 && <div style={{ color: '#4ecca3' }}>{formatMoney(d.ARS)}</div>}
        {d.USD > 0 && <div style={{ color: '#48b1ff' }}>{formatMoney(d.USD, 'USD')}</div>}
      </div>
    );
  };

  if (loading) return <div className="app"><div className="loading">Cargando...</div></div>;

  return (
    <div className="app">
      <div className="header">
        <h1>Finanzas Personales</h1>
        <div className="subtitle">Dashboard</div>
      </div>

      {/* Month selector */}
      <div className="month-selector">
        <button onClick={prevMonth}>‹</button>
        <span>{MONTHS[month - 1]} {year}</span>
        <button onClick={nextMonth}>›</button>
      </div>

      {/* Summary cards */}
      <div className="summary-cards">
        <div className="card">
          <div className="card-label">Total ARS</div>
          <div className="card-value">{formatMoney(totalARS)}</div>
        </div>
        <div className="card">
          <div className="card-label">Total USD</div>
          <div className="card-value">{formatMoney(totalUSD, 'USD')}</div>
        </div>
        <div className="card">
          <div className="card-label">Gastos</div>
          <div className="card-value small">{expenses.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Categorías</div>
          <div className="card-value small">{byCategory.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'resumen' ? 'active' : ''}`} onClick={() => setTab('resumen')}>Resumen</button>
        <button className={`tab ${tab === 'gastos' ? 'active' : ''}`} onClick={() => setTab('gastos')}>Gastos</button>
        <button className={`tab ${tab === 'tipo' ? 'active' : ''}`} onClick={() => setTab('tipo')}>Por tipo</button>
      </div>

      {/* Tab: Resumen */}
      {tab === 'resumen' && (
        <>
          {byCategory.length === 0 ? (
            <div className="empty-state">No hay gastos este mes</div>
          ) : (
            <div className="chart-container">
              <div className="chart-title">Gasto por categoría (ARS)</div>
              <ResponsiveContainer width="100%" height={byCategory.length * 40 + 20}>
                <BarChart data={byCategory} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#aaa', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ARS" fill="#4ecca3" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Tab: Gastos */}
      {tab === 'gastos' && (
        <>
          <div className="filters">
            <button
              className={`filter-chip ${!filterCat ? 'active' : ''}`}
              onClick={() => setFilterCat(null)}
            >
              Todos
            </button>
            {byCategory.map(c => (
              <button
                key={c.name}
                className={`filter-chip ${filterCat === c.name ? 'active' : ''}`}
                onClick={() => setFilterCat(c.name === filterCat ? null : c.name)}
              >
                {c.name}
              </button>
            ))}
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="empty-state">No hay gastos</div>
          ) : (
            <div className="expense-list">
              {filteredExpenses.map(e => (
                <div key={e.id} className="expense-item">
                  <div className="expense-info">
                    <div className="expense-desc">{e.description}</div>
                    <div className="expense-meta">
                      {new Date(e.created_at).toLocaleDateString('es-AR')} · {e.categories?.name || '—'}
                    </div>
                  </div>
                  <div className={`expense-amount ${e.currency.toLowerCase()}`}>
                    {formatMoney(e.amount, e.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: Por tipo */}
      {tab === 'tipo' && (
        <>
          {byType.every(t => t.value === 0) ? (
            <div className="empty-state">No hay gastos este mes</div>
          ) : (
            <div className="chart-container">
              <div className="chart-title">Fijo vs Variable (ARS)</div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={byType}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    label={({ name, value }) => `${name}: ${formatMoney(value)}`}
                  >
                    <Cell fill="#4ecca3" />
                    <Cell fill="#48b1ff" />
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
