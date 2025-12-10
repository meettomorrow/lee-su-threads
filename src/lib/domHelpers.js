/**
 * DOM helper functions for finding and manipulating Threads UI elements
 */

/**
 * Find the parent container that has both the name section and follow button
 * This is used to locate where to insert location badges/buttons in the followers/following list
 *
 * @param {HTMLElement} container - The container element to search within
 * @param {string} username - The username to find (without @)
 * @returns {HTMLElement|null} - The parent container element or null if not found
 */
export function findUsernameContainer(container, username) {
  // Find the profile link first
  const profileLink = container.querySelector(`a[href="/@${username}"]`);
  if (!profileLink) {
    return null;
  }

  // Navigate up from the profile link to find the container that has a button with role="button"
  // This container will have the username, profile pic, and follow/following button
  let current = profileLink;

  for (let i = 0; i < 15 && current; i++) {
    const parent = current.parentElement;
    if (parent) {
      // Look for any button child (could be "Follow", "Following", "Follow Back", etc.)
      const hasButton = Array.from(parent.children).some(child =>
        child.getAttribute &&
        child.getAttribute('role') === 'button' &&
        child.tagName.toLowerCase() !== 'a' // Exclude link buttons
      );

      if (hasButton) {
        return parent;
      }
    }
    current = current.parentElement;
  }

  return null;
}

/**
 * Find the post container element by traversing up the DOM tree
 * Used for identifying where to insert profile badges in the timeline feed
 *
 * @param {HTMLElement} element - Starting element
 * @returns {HTMLElement|null} - The post container element or null if not found
 */
export function findPostContainer(element) {
  let current = element;
  let depth = 0;
  const maxDepth = 15;

  while (current && depth < maxDepth) {
    // Look for common post container patterns
    if (current.getAttribute &&
        (current.getAttribute('data-pressable-container') === 'true' ||
         current.classList?.contains('x1lliihq') ||
         current.tagName === 'ARTICLE')) {
      return current;
    }
    current = current.parentElement;
    depth++;
  }

  return null;
}

/**
 * Detect which tab is currently active in the followers/following dialog
 * Uses tab position instead of text matching for language-agnosticism
 *
 * @param {NodeList} tabs - List of tab elements with role="tab"
 * @returns {{isFollowers: boolean, isFollowing: boolean}} - Which tab is active
 */
export function detectActiveTab(tabs) {
  let isFollowers = false;
  let isFollowing = false;

  tabs.forEach((tab, index) => {
    if (tab.getAttribute('aria-selected') === 'true') {
      // Use tab position instead of string matching (language-agnostic)
      // First tab (index 0) = Followers
      // Second tab (index 1) = Following
      if (index === 0) {
        isFollowers = true;
      } else if (index === 1) {
        isFollowing = true;
      }
    }
  });

  return { isFollowers, isFollowing };
}
