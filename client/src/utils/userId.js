const USER_ID_KEY = "fathom_test_user_id";

// Generate a unique user ID
export function generateUserId() {
  return (
    "user_" +
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 11)
  );
}

// Get or create user ID
export function getUserId() {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = generateUserId();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

// Get user ID from URL or localStorage
export function getUserIdFromUrl() {
  const params = new URLSearchParams(
    window.location.search
  );
  return params.get("user_id") || getUserId();
}

export { USER_ID_KEY };
