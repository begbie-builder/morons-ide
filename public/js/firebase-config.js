// ============================================================================
//  FIREBASE CONFIG  —  THIS IS THE ONLY FILE YOU NEED TO EDIT FOR CLOUD.
// ----------------------------------------------------------------------------
//  Paste the config object from your Firebase project here.
//  See SETUP.md ("Step 5") for exactly where to copy these values from.
//  These values are NOT secret — Firebase web keys are meant to be public;
//  your data is protected by the Firestore security rules (firestore.rules).
//  Until you fill this in, the IDE still works fully in LOCAL folder mode.
// ============================================================================

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// True once you have replaced the placeholders above with real values.
export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey) && !firebaseConfig.apiKey.startsWith("YOUR_");
}
