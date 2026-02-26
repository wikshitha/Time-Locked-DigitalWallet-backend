// Time Helper Utility
// Converts days to minutes when in TEST_MODE, otherwise uses days

const isTestMode = process.env.TEST_MODE === 'true';

/**
 * Convert time period based on TEST_MODE
 * @param {number} days - Number of days
 * @returns {object} - { value: number, unit: 'minutes'|'days', milliseconds: number }
 */
export const convertTimePeriod = (days) => {
  if (isTestMode) {
    // In test mode: 1 day = 1 minute
    const minutes = days;
    const milliseconds = minutes * 60 * 1000;
    return {
      value: minutes,
      unit: 'minutes',
      milliseconds,
      description: `${minutes} minute(s)`,
    };
  } else {
    // In production mode: use actual days
    const milliseconds = days * 24 * 60 * 60 * 1000;
    return {
      value: days,
      unit: 'days',
      milliseconds,
      description: `${days} day(s)`,
    };
  }
};

/**
 * Add time period to a date
 * @param {Date} date - Starting date
 * @param {number} period - Number of days (converted to minutes in test mode)
 * @returns {Date} - New date with added time
 */
export const addTimePeriod = (date, period) => {
  const { milliseconds } = convertTimePeriod(period);
  return new Date(date.getTime() + milliseconds);
};

/**
 * Get human-readable time description
 * @param {number} days - Number of days
 * @returns {string} - Description like "3 days" or "3 minutes (test mode)"
 */
export const getTimeDescription = (days) => {
  if (isTestMode) {
    return `${days} minute(s) [TEST MODE]`;
  }
  return `${days} day(s)`;
};

/**
 * Check if we're in test mode
 * @returns {boolean}
 */
export const getTestMode = () => isTestMode;

/**
 * Get cron schedule based on test mode
 * @param {string} productionSchedule - Cron schedule for production (e.g., "0 0 * * *")
 * @param {string} testSchedule - Cron schedule for testing (e.g., "* * * * *")
 * @returns {string}
 */
export const getCronSchedule = (productionSchedule, testSchedule) => {
  return isTestMode ? testSchedule : productionSchedule;
};

console.log(`⏰ Time Helper initialized in ${isTestMode ? 'TEST MODE (days = minutes)' : 'PRODUCTION MODE (actual days)'}`);
