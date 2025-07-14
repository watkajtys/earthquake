# Enhanced Logging for Scheduled Tasks

## Overview

Enhanced logging has been implemented for scheduled tasks in the earthquake dashboard application. This provides comprehensive monitoring, performance tracking, and debugging capabilities for automated background processes.

## Key Features

### 1. Structured Logging
- Execution ID tracking for each task run
- Hierarchical log levels (TASK_START, MILESTONE, API_CALL, DB_OPERATION, KV_OPERATION, ERROR, TASK_COMPLETE)
- JSON-structured log output for easy parsing
- Performance metrics and timing data

### 2. Comprehensive Metrics Tracking
- API call metrics (URL, duration, status code, response size)
- Database operation metrics (operation type, table, records affected, duration, success/failure)
- KV storage operation metrics (operation type, key, data size, duration, success/failure)
- Data processing metrics (input/output counts, processing time)
- Error tracking with context and stack traces

### 3. Execution Context
- Unique execution IDs for tracking individual task runs
- Scheduled vs actual execution time tracking
- Environment context (available bindings, configuration)
- End-to-end performance summaries

## Implementation

### Core Logger Class
**Location:** `src/utils/scheduledTaskLogger.js`

The `ScheduledTaskLogger` class provides:
- Task lifecycle tracking (start → milestones → completion)
- Performance metric collection
- Error logging with context
- Execution summaries and analytics

### Enhanced Worker Integration
**Location:** `src/worker.js` (scheduled function)

The main scheduled task (`usgs-data-sync`) now includes:
- Environment validation logging
- Detailed API call tracking
- Proxy handler integration with logging context
- Comprehensive error handling

### Enhanced Proxy Handler
**Location:** `functions/routes/api/usgs-proxy.js`

The USGS proxy handler now logs:
- API call performance (USGS API timing, response sizes)
- KV operations (read/write timing, data sizes)
- Database operations (upsert performance, success/error rates)
- Data processing (feature comparison, filtering results)
- Error conditions with full context

## Usage Example

```javascript
// Initialize logger for a scheduled task
const logger = createScheduledTaskLogger('usgs-data-sync', event.scheduledTime);

// Add context information
logger.addContext('environment', {
  hasDB: !!env.DB,
  hasUsgsKV: !!env.USGS_LAST_RESPONSE_KV
});

// Log API calls
logger.logApiCall(apiUrl, startTime, endTime, response.status, responseSize, 'GET');

// Log database operations
logger.logDbOperation('UPSERT', 'EarthquakeEvents', successCount, duration, success);

// Log KV operations
logger.logKvOperation('PUT', key, dataSize, duration, success);

// Log milestones
logger.logMilestone('Data processing completed', { recordsProcessed: 100 });

// Log errors with context
logger.logError('API_ERROR', error, { apiUrl, stage: 'fetch' }, false);

// Complete the task
logger.logTaskCompletion(true, { message: 'Task completed successfully' });
```

## Log Output Structure

Each log entry includes:
- **Execution ID**: Unique identifier for the task run
- **Timestamp**: Precise timing information
- **Context**: Environment and execution context
- **Metrics**: Performance and resource utilization data
- **Error Details**: Stack traces and error context when applicable

### Sample Log Output

```json
{
  "level": "info",
  "message": "[usgs-data-sync] API_CALL",
  "data": {
    "executionId": "usgs-data-sync-abc123-def45",
    "apiUrl": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    "method": "GET",
    "duration": 1250,
    "statusCode": 200,
    "responseSize": 45678,
    "callNumber": 1
  }
}
```

## Benefits

1. **Operational Visibility**: Clear insight into scheduled task performance and health
2. **Performance Monitoring**: Track API response times, database performance, and data processing efficiency
3. **Error Tracking**: Detailed error context for faster debugging and resolution
4. **Capacity Planning**: Resource utilization metrics for scaling decisions
5. **Compliance**: Comprehensive audit trail for data processing activities

## Integration with Monitoring

The structured logs can be easily integrated with:
- Cloudflare Analytics and Logs
- External monitoring systems (DataDog, New Relic, etc.)
- Custom dashboards and alerting systems
- Performance analysis tools

## Future Enhancements

Potential additions include:
- Alert thresholds for performance degradation
- Historical trend analysis
- Automated performance reports
- Integration with Cloudflare Workers Analytics Engine
- Custom metrics dashboards

## Testing

Comprehensive test coverage is provided in `src/utils/scheduledTaskLogger.test.js`, covering:
- Logger initialization and configuration
- All logging methods and their output
- Performance metric tracking
- Error handling and edge cases
- Timer functionality