// Parse joined date string and return Date object
// Handles formats like: "2024年1月", "January 2024", "2024년 1월", "2024年1月"
export function parseJoinedDate(joinedStr) {
  if (!joinedStr) return null;

  // Month name mappings for different locales
  const monthMap = {
    // English
    'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
    'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
    // Japanese
    '1月': 0, '2月': 1, '3月': 2, '4月': 3, '5月': 4, '6月': 5,
    '7月': 6, '8月': 7, '9月': 8, '10月': 9, '11月': 10, '12月': 11,
    // Korean
    '1월': 0, '2월': 1, '3월': 2, '4월': 3, '5월': 4, '6월': 5,
    '7월': 6, '8월': 7, '9월': 8, '10월': 9, '11월': 10, '12월': 11,
  };

  // Extract year (4 digits)
  const yearMatch = joinedStr.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);

  // Try to find month
  let month = null;

  // Check for CJK month format (e.g., "1月", "12月")
  const cjkMonthMatch = joinedStr.match(/(\d{1,2})[月월]/);
  if (cjkMonthMatch) {
    month = parseInt(cjkMonthMatch[1], 10) - 1; // 0-indexed
  } else {
    // Check for English month names
    const lowerStr = joinedStr.toLowerCase();
    for (const [name, idx] of Object.entries(monthMap)) {
      if (lowerStr.includes(name)) {
        month = idx;
        break;
      }
    }
  }

  if (month === null) return null;

  return new Date(year, month, 1);
}

// Check if user joined within the last N months
export function isNewUser(joinedStr, monthsThreshold = 2, referenceDate = new Date()) {
  const joinedDate = parseJoinedDate(joinedStr);
  if (!joinedDate) return false;

  const thresholdDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - monthsThreshold, 1);

  return joinedDate >= thresholdDate;
}
