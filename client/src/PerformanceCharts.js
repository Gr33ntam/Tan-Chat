import React from 'react';
// Copy the code from the artifact above - it's the complete PerformanceCharts component

function PerformanceCharts({ stats, signalHistory }) {
  // Don't render if no signals
  if (stats.totalSignals === 0) {
    return null;
  }

  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '25px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    }}>
      <h2 style={{ margin: '0 0 25px 0', fontSize: '24px' }}>📈 Performance Visualizations</h2>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px'
      }}>
        {/* Win Rate Visual */}
        <WinRateChart stats={stats} />
        
        {/* Pips Progress Bar */}
        <PipsProgressBar stats={stats} />
      </div>
      
      {/* Signal Timeline */}
      {signalHistory && signalHistory.length > 0 && (
        <SignalTimeline signalHistory={signalHistory} />
      )}
    </div>
  );
}

function WinRateChart({ stats }) {
  const winRate = parseFloat(stats.winRate) || 0;
  const completedSignals = stats.wonSignals + stats.lostSignals;
  
  if (completedSignals === 0) return null;
  
  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#f9f9f9',
      borderRadius: '12px',
      border: '2px solid #e0e0e0'
    }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#666' }}>
        Win Rate Distribution
      </h3>
      
      {/* Circular Progress */}
      <div style={{ position: 'relative', width: '200px', height: '200px', margin: '0 auto' }}>
        <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#f0f0f0"
            strokeWidth="10"
          />
          {/* Win rate circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={winRate >= 60 ? '#4CAF50' : winRate >= 40 ? '#FF9800' : '#f44336'}
            strokeWidth="10"
            strokeDasharray={`${(winRate / 100) * 251.2} 251.2`}
            strokeLinecap="round"
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: winRate >= 60 ? '#4CAF50' : winRate >= 40 ? '#FF9800' : '#f44336' }}>
            {winRate}%
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Win Rate
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-around', fontSize: '14px' }}>
        <div>
          <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>✓ {stats.wonSignals}</span>
          <div style={{ color: '#666', fontSize: '12px' }}>Won</div>
        </div>
        <div>
          <span style={{ color: '#f44336', fontWeight: 'bold' }}>✗ {stats.lostSignals}</span>
          <div style={{ color: '#666', fontSize: '12px' }}>Lost</div>
        </div>
        {stats.pendingSignals > 0 && (
          <div>
            <span style={{ color: '#FF9800', fontWeight: 'bold' }}>○ {stats.pendingSignals}</span>
            <div style={{ color: '#666', fontSize: '12px' }}>Pending</div>
          </div>
        )}
      </div>
    </div>
  );
}

function PipsProgressBar({ stats }) {
  const maxPips = Math.max(Math.abs(stats.totalPips), 100);
  const percentage = (stats.totalPips / maxPips) * 100;
  
  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#f9f9f9',
      borderRadius: '12px',
      border: '2px solid #e0e0e0'
    }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#666' }}>
        Total Pips Performance
      </h3>
      
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '48px', 
          fontWeight: 'bold', 
          color: stats.totalPips >= 0 ? '#4CAF50' : '#f44336' 
        }}>
          {stats.totalPips > 0 ? '+' : ''}{stats.totalPips.toFixed(1)}
        </div>
        <div style={{ fontSize: '14px', color: '#666' }}>Total Pips</div>
      </div>
      
      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '30px',
        backgroundColor: '#e0e0e0',
        borderRadius: '15px',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: '2px',
          backgroundColor: '#999'
        }} />
        <div style={{
          position: 'absolute',
          left: stats.totalPips >= 0 ? '50%' : `${50 + percentage}%`,
          width: stats.totalPips >= 0 ? `${percentage}%` : `${-percentage}%`,
          height: '100%',
          backgroundColor: stats.totalPips >= 0 ? '#4CAF50' : '#f44336',
          transition: 'all 0.3s ease'
        }} />
      </div>
      
      {/* Stats breakdown */}
      <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
        <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#E8F5E9', borderRadius: '6px' }}>
          <div style={{ color: '#4CAF50', fontWeight: 'bold' }}>+{stats.avgPipsPerWin > 0 ? stats.avgPipsPerWin : 0}</div>
          <div style={{ color: '#666' }}>Avg Win</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#FFEBEE', borderRadius: '6px' }}>
          <div style={{ color: '#f44336', fontWeight: 'bold' }}>{stats.avgPipsPerLoss !== 0 ? stats.avgPipsPerLoss : 0}</div>
          <div style={{ color: '#666' }}>Avg Loss</div>
        </div>
      </div>
    </div>
  );
}

function SignalTimeline({ signalHistory }) {
  // Get last 10 completed signals
  const recentSignals = [...signalHistory]
    .filter(s => s.outcome === 'win' || s.outcome === 'loss')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .reverse();
  
  if (recentSignals.length === 0) return null;
  
  return (
    <div style={{ marginTop: '25px' }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#666' }}>
        Recent Signal Timeline
      </h3>
      
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        padding: '10px 0'
      }}>
        {recentSignals.map((signal, index) => {
          const isWin = signal.outcome === 'win';
          const pips = signal.pips_gained || 0;
          
          return (
            <div
              key={signal.id || index}
              style={{
                minWidth: '60px',
                height: '100px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              {/* Bar */}
              <div style={{
                width: '40px',
                height: `${Math.min(Math.abs(pips) / 2, 80)}px`,
                backgroundColor: isWin ? '#4CAF50' : '#f44336',
                borderRadius: '4px 4px 0 0',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                alignSelf: 'flex-end',
                marginTop: `${80 - Math.min(Math.abs(pips) / 2, 80)}px`
              }}>
                <span style={{ fontSize: '10px', color: 'white', fontWeight: 'bold', marginBottom: '2px' }}>
                  {pips > 0 ? '+' : ''}{pips.toFixed(0)}
                </span>
              </div>
              
              {/* Label */}
              <div style={{
                fontSize: '10px',
                color: '#666',
                textAlign: 'center',
                width: '100%'
              }}>
                {signal.pair}
              </div>
            </div>
          );
        })}
      </div>
      
      <div style={{
        marginTop: '10px',
        textAlign: 'center',
        fontSize: '12px',
        color: '#999'
      }}>
        Last {recentSignals.length} completed signals
      </div>
    </div>
  );
}

// Demo with sample data
export default function App() {
  const sampleStats = {
    totalSignals: 10,
    wonSignals: 6,
    lostSignals: 3,
    pendingSignals: 1,
    winRate: '66.7',
    totalPips: 125.5,
    avgPipsPerWin: 35.2,
    avgPipsPerLoss: -22.3
  };

  const sampleHistory = [
    { id: 1, pair: 'XAUUSD', outcome: 'win', pips_gained: 45, created_at: '2026-01-15' },
    { id: 2, pair: 'EURUSD', outcome: 'loss', pips_gained: -20, created_at: '2026-01-16' },
    { id: 3, pair: 'GBPUSD', outcome: 'win', pips_gained: 30, created_at: '2026-01-17' },
    { id: 4, pair: 'XAUUSD', outcome: 'win', pips_gained: 55, created_at: '2026-01-18' },
    { id: 5, pair: 'BTCUSD', outcome: 'loss', pips_gained: -15, created_at: '2026-01-19' },
    { id: 6, pair: 'EURUSD', outcome: 'win', pips_gained: 25, created_at: '2026-01-20' },
  ];

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <PerformanceCharts stats={sampleStats} signalHistory={sampleHistory} />
    </div>
  );
}