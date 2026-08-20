# Story 18.3: Create Anomaly Detection

## Story Info
- **Epic**: Historical Analysis
- **Estimated Hours**: 3
- **Dependencies**: Story 18.1, Story 18.2
- **Status**: `pending`

## User Story
Implement automatic anomaly detection to flag unusual expense patterns and alert users to potential billing errors.

## Acceptance Criteria
- [ ] Configurable variance threshold (default: 10%)
- [ ] Detect spikes in specific expense categories
- [ ] Detect categories with unusual patterns (e.g., every other year)
- [ ] Flag new categories not present in prior years
- [ ] Generate anomaly report with explanations
- [ ] Per-organization threshold configuration
- [ ] Threshold adjustment with A/B preview

## Technical Specifications

Anomaly detection with configurable thresholds and pattern recognition.

**Reference**: See `docs/architecture/anomaly-detection.md` for full algorithm details.

### Detection Algorithm: Hybrid Approach

1. **Standard Deviation** - Simple threshold: >2 std dev from 3-year mean = anomaly
2. **ARIMA** - Trend-based: Detects deviations from expected patterns
3. **Isolation Forest** - ML outlier detection across categories

### Core Detection Service

```python
# backend/app/services/analysis/anomaly_detection.py
from enum import Enum
from dataclasses import dataclass
from decimal import Decimal
from sklearn.ensemble import IsolationForest
from statsmodels.tsa.arima.model import ARIMA

class AnomalySeverity(str, Enum):
    INFO = "info"        # Notable but not concerning
    WARNING = "warning"  # 10-20% variance
    CRITICAL = "critical"  # >20% variance

class AnomalyType(str, Enum):
    SPIKE = "spike"
    DROP = "drop"
    NEW_CATEGORY = "new_category"
    MISSING_CATEGORY = "missing_category"
    PATTERN_BREAK = "pattern_break"
    OUTLIER = "outlier"

@dataclass
class DetectedAnomaly:
    pool_name: str
    anomaly_type: AnomalyType
    severity: AnomalySeverity
    current_value: Decimal
    expected_value: Decimal
    variance_percent: Decimal
    explanation: str
    years_affected: list[int]

class AnomalyDetectionService:
    def __init__(self, config: AnomalyDetectionConfig):
        self.warning_threshold = config.WARNING_THRESHOLD  # 0.10 = 10%
        self.critical_threshold = config.CRITICAL_THRESHOLD  # 0.20 = 20%
        self.std_dev_multiplier = config.STD_DEV_MULTIPLIER  # 2.0

    async def detect_anomalies(
        self,
        property_id: UUID,
        target_year: int,
        comparison_years: list[int],
        db: AsyncSession,
    ) -> list[DetectedAnomaly]:
        """Detect all anomalies using hybrid approach."""
        anomalies = []

        historical_data = await self._load_historical_data(
            property_id, [target_year] + comparison_years, db
        )

        # 1. Variance-based detection
        anomalies.extend(self._detect_variance_anomalies(historical_data, target_year))

        # 2. Statistical outliers (Isolation Forest)
        anomalies.extend(self._detect_statistical_outliers(historical_data, target_year))

        # 3. Trend anomalies (ARIMA)
        anomalies.extend(self._detect_trend_anomalies(historical_data, target_year))

        # 4. New/missing categories
        anomalies.extend(self._detect_category_changes(historical_data, target_year))

        return self._deduplicate_and_rank(anomalies)

    def _detect_variance_anomalies(self, data, target_year) -> list[DetectedAnomaly]:
        """Simple threshold-based variance detection."""
        anomalies = []
        for pool_name, year_data in data.items():
            if target_year not in year_data:
                continue

            current = year_data[target_year]
            prior_years = [v for y, v in year_data.items() if y < target_year]
            if not prior_years:
                continue

            avg = sum(prior_years) / len(prior_years)
            if avg == 0:
                continue

            variance = (current - avg) / avg

            if abs(variance) >= self.critical_threshold:
                severity = AnomalySeverity.CRITICAL
            elif abs(variance) >= self.warning_threshold:
                severity = AnomalySeverity.WARNING
            else:
                continue

            anomalies.append(DetectedAnomaly(
                pool_name=pool_name,
                anomaly_type=AnomalyType.SPIKE if variance > 0 else AnomalyType.DROP,
                severity=severity,
                current_value=current,
                expected_value=avg,
                variance_percent=variance * 100,
                explanation=f"{pool_name} {'increased' if variance > 0 else 'decreased'} "
                           f"by {abs(variance)*100:.1f}% vs 3-year average",
                years_affected=[target_year],
            ))

        return anomalies
```

### Per-Organization Configuration

```python
# backend/app/models/organization_settings.py
class OrganizationAnomalySettings(Base):
    __tablename__ = "organization_anomaly_settings"

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), primary_key=True)
    warning_threshold: Mapped[Decimal] = mapped_column(default=Decimal("0.10"))
    critical_threshold: Mapped[Decimal] = mapped_column(default=Decimal("0.20"))
    std_dev_multiplier: Mapped[float] = mapped_column(default=2.0)
    enabled_detection_types: Mapped[list[str]] = mapped_column(JSONB, default=["variance", "outlier", "trend"])
```

### Frontend Anomaly Report

```typescript
// frontend/src/features/analysis/components/AnomalyList.tsx
export function AnomalyList({ anomalies }: { anomalies: DetectedAnomaly[] }) {
  const grouped = useMemo(() => {
    return {
      critical: anomalies.filter(a => a.severity === 'critical'),
      warning: anomalies.filter(a => a.severity === 'warning'),
      info: anomalies.filter(a => a.severity === 'info'),
    };
  }, [anomalies]);

  return (
    <div className="space-y-6">
      {grouped.critical.length > 0 && (
        <div>
          <h3 className="text-red-600 font-medium mb-2">
            Critical Anomalies ({grouped.critical.length})
          </h3>
          {grouped.critical.map((anomaly, i) => (
            <AnomalyCard key={i} anomaly={anomaly} />
          ))}
        </div>
      )}

      {grouped.warning.length > 0 && (
        <div>
          <h3 className="text-amber-600 font-medium mb-2">
            Warnings ({grouped.warning.length})
          </h3>
          {grouped.warning.map((anomaly, i) => (
            <AnomalyCard key={i} anomaly={anomaly} />
          ))}
        </div>
      )}
    </div>
  );
}
```

## Test Cases

Test anomaly detection including:
- Variance threshold detection (10% warning, 20% critical)
- Statistical outlier detection (Isolation Forest)
- Trend-based anomalies (ARIMA)
- New category detection
- Missing category detection
- Per-organization threshold configuration
- A/B preview of threshold changes

## Definition of Done
- [ ] Anomaly detection identifies spikes
- [ ] Threshold configurable per organization
- [ ] Pattern detection works
- [ ] Anomaly report generates
- [ ] Report includes explanations
- [ ] Unit tests passing with 95%+ coverage
