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

    // Process pairs after all extraction is complete
    if (profileInfo._pairs && profileInfo._pairs.length > 0) {
      const pairs = profileInfo._pairs;

      // Define label patterns for different languages
      const joinedLabels = ['Joined', '已加入', '参加日', '가입일', '가입 날짜'];
      const locationLabels = ['Based in', '所在地點', '所在地', '위치', '거주지'];
      const verifiedLabels = ['Verified by Meta', 'Meta 驗證', 'Meta 验证', 'Metaにより認証', 'Metaにより認証済み', 'Meta認証', 'Meta 인증', 'Meta 인증 완료'];
      const nameLabels = ['Name', '名稱', '名前', '이름']; // Exclude these
      const formerUsernameLabels = ['Former usernames', 'Previous usernames', '先前的用戶名稱', '先前的使用者名稱', '先前的用户名称', '以前のユーザーネーム', '이전 사용자 이름']; // Exclude these

      // Filter out name and former username fields
      const relevantPairs = pairs.filter(p =>
        !nameLabels.includes(p.label) && !formerUsernameLabels.includes(p.label)
      );

      // Primary: Label-based matching
      const joinedPair = relevantPairs.find(p => joinedLabels.includes(p.label));
      if (joinedPair) {
        // Remove everything after · (user number like "100M+", "#2,697,767")
        profileInfo.joined = joinedPair.value.split(/\s*[·•]\s*/)[0].trim();
      }

      const locationPair = relevantPairs.find(p => locationLabels.includes(p.label));
      if (locationPair) {
        profileInfo.location = locationPair.value;
      }

      const verifiedPair = relevantPairs.find(p => verifiedLabels.includes(p.label));
      if (verifiedPair) {
        profileInfo.isVerified = true;
        profileInfo.verifiedDate = verifiedPair.value; // e.g., "May 2021"
      }

      // Fallback: Position-based (for backward compatibility if labels don't match)
      if (!joinedPair && relevantPairs.length >= 1) {
        // First relevant pair is likely joined date
        profileInfo.joined = relevantPairs[0].value.split(/\s*[·•]\s*/)[0].trim();
      }

      if (!locationPair && relevantPairs.length >= 2) {
        // Second relevant pair is likely location (only if not verified)
        const secondPair = relevantPairs[1];
        if (!verifiedLabels.includes(secondPair.label)) {
          profileInfo.location = secondPair.value;
        }
      }
    }

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
