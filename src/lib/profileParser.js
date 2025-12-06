/**
 * Profile parsing utilities for Threads API responses
 * Extracted for testability
 */

function extractProfileInfo(obj, result = {}) {
  if (!obj || typeof obj !== 'object') return result;

  // Initialize array to collect all label-value pairs
  if (result._pairs === undefined) {
    result._pairs = [];
    result._currentLabel = null;
  }

  if (obj['bk.components.Text']) {
    const textComp = obj['bk.components.Text'];
    const text = textComp.text;
    const style = textComp.text_style;

    if (style === 'semibold' && text) {
      // This is a label - store it
      result._currentLabel = text;
    } else if (style === 'normal' && text && result._currentLabel) {
      // This is a value - pair it with the label
      result._pairs.push({ label: result._currentLabel, value: text });
      result._currentLabel = null;
    }
  }

  if (obj['bk.components.RichText']) {
    const children = obj['bk.components.RichText'].children || [];
    let fullText = '';
    for (const child of children) {
      if (child['bk.components.TextSpan']) {
        fullText += child['bk.components.TextSpan'].text || '';
      }
    }
    // Try multiple patterns for name/username extraction
    // Support both half-width ( and full-width （ parentheses
    // Pattern 1: "Name (@username)" with closing paren
    let match = fullText.match(/^(.+?)\s*[（(]@([\w.]+)[)）]$/);
    // Pattern 2: "Name (@username" without closing paren (sometimes the ) is in a separate span)
    if (!match) {
      match = fullText.match(/^(.+?)\s*[（(]@([\w.]+)/);
    }
    // Pattern 3: Just "@username" somewhere in the text
    if (!match) {
      match = fullText.match(/@([\w.]+)/);
      if (match) {
        result.username = match[1];
        // Try to get display name from the part before @
        const nameMatch = fullText.match(/^(.+?)\s*[（(]@/);
        if (nameMatch) {
          result.displayName = nameMatch[1].trim();
        }
      }
    }
    if (match && match[2]) {
      result.displayName = match[1]?.trim();
      result.username = match[2];
    }
  }

  if (obj['bk.components.Image']) {
    const url = obj['bk.components.Image'].url;
    if (url && url.includes('cdninstagram.com')) {
      result.profileImage = url;
    }
  }

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        extractProfileInfo(item, result);
      }
    } else if (typeof value === 'object' && value !== null) {
      extractProfileInfo(value, result);
    }
  }

  // After traversing, extract joined and location from pairs
  // Pairs order: [0]=Joined, [1]=Location, [2+]=extra fields (Previous names, Verified, etc.)
  // - Joined is always the 1st pair (index 0), may contain "·" suffix to strip
  // - Location is always the 2nd pair (index 1)
  if (result._pairs && result._pairs.length >= 2 && !result._pairsProcessed) {
    result._pairsProcessed = true;
    const pairs = result._pairs;
    // 1st pair = Joined (clean up user number suffix)
    let joinedRaw = pairs[0].value;
    // Remove everything after · (user number like "100M+", "#2,697,767")
    result.joined = joinedRaw.split(/\s*[·•]\s*/)[0].trim();
    // 2nd pair = Location
    result.location = pairs[1].value;
  }

  return result;
}

function parseProfileResponse(responseText) {
  try {
    let jsonStr = responseText;
    if (jsonStr.startsWith('for (;;);')) {
      jsonStr = jsonStr.substring(9);
    }
    const data = JSON.parse(jsonStr);
    const profileInfo = extractProfileInfo(data);

    // Clean up internal properties
    delete profileInfo._pairs;
    delete profileInfo._currentLabel;
    delete profileInfo._pairsProcessed;

    return profileInfo;
  } catch (e) {
    console.error('Failed to parse response:', e);
    return null;
  }
}

// Export for testing (ESM)
export { extractProfileInfo, parseProfileResponse };
