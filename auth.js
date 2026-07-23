/* ================================================================
   auth.js — shared Firebase Auth + Firestore layer, used by both
   index.html (landing page login/register) and cnc-factory.html (the
   game itself). Loaded via <script> after the Firebase compat SDK, so it
   attaches to the same global `firebase` object on every page.

   Firebase Auth's default session persistence is 'local' (backed by
   IndexedDB), which is shared across every page on the same origin — so
   logging in on index.html means cnc-factory.html sees the same signed-in
   user automatically, with no extra wiring needed.
   ================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyDu4WW2wkCYwlAB8WvewOqkzw5x2BPfk2A",
  authDomain: "cncfactory-25b6d.firebaseapp.com",
  projectId: "cncfactory-25b6d",
  storageBucket: "cncfactory-25b6d.firebasestorage.app",
  messagingSenderId: "39477726987",
  appId: "1:39477726987:web:230c450bcef2d49ba9dc0e",
};

firebase.initializeApp(firebaseConfig);

const Auth = {
  currentUser: null,
  ready: false,           // becomes true once the first auth-state check resolves
  _listeners: [],         // callbacks registered via Auth.onChange(), fired on every auth-state change

  init() {
    firebase.auth().onAuthStateChanged((user) => {
      Auth.currentUser = user;
      Auth.ready = true;
      Auth._listeners.forEach((cb) => cb(user));
    });
  },
  // Registers a callback fired immediately with the current state (if
  // already known) and again on every future sign-in/sign-out.
  onChange(cb) {
    Auth._listeners.push(cb);
    if (Auth.ready) cb(Auth.currentUser);
  },
  // Resolves once the first auth-state check has completed (Firebase
  // needs a moment to read the persisted session). Callers that need to
  // know "is anyone logged in" before deciding what to load should await this.
  waitForReady() {
    return new Promise((resolve) => {
      if (Auth.ready) return resolve(Auth.currentUser);
      const cb = (user) => resolve(user);
      Auth._listeners.push(cb);
    });
  },

  friendlyError(err) {
    const map = {
      'auth/invalid-email': 'Geçersiz e-posta adresi.',
      'auth/email-already-in-use': 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.',
      'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
      'auth/user-not-found': 'Bu e-posta ile kayıtlı bir hesap bulunamadı.',
      'auth/wrong-password': 'Şifre yanlış.',
      'auth/invalid-credential': 'E-posta veya şifre yanlış.',
      'auth/too-many-requests': 'Çok fazla başarısız deneme. Birazdan tekrar dene.',
      'auth/requires-recent-login': 'Bu işlem için güvenlik nedeniyle tekrar giriş yapman gerekiyor.',
    };
    return map[err.code] || (err.message || 'Bilinmeyen bir hata oluştu.');
  },

  async register(email, password) {
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
    return cred.user;
  },
  async login(email, password) {
    const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
    return cred.user;
  },
  async logout() {
    await firebase.auth().signOut();
  },

  // Deletes the player's cloud save AND their Firebase Auth account itself.
  // Firebase requires a "recent" login for account deletion; if the
  // session is old, this throws auth/requires-recent-login and the caller
  // should prompt the user to sign in again before retrying.
  async deleteAccount() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const uid = user.uid;
    await firebase.firestore().collection('saves').doc(uid).delete().catch(() => {});
    await user.delete();
  },

  // Cloud save/load — one document per user, at saves/{uid}.
  async saveCloud(dataObj) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('not-signed-in');
    await firebase.firestore().collection('saves').doc(user.uid).set({
      ...dataObj,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },
  async loadCloud() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    const snap = await firebase.firestore().collection('saves').doc(user.uid).get();
    return snap.exists ? snap.data() : null;
  },

  // Lets someone request deletion of their data from a public page WITHOUT
  // being signed in — required by Google Play's account-deletion policy,
  // which mandates a web path that doesn't depend on the app/account
  // session being active. A site owner processes these requests manually
  // (there's no way to safely auto-verify identity without an active
  // session), which is why this writes a request record instead of
  // deleting anything directly.
  async requestDeletionByEmail(email) {
    await firebase.firestore().collection('accountDeletionRequests').add({
      email,
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },
};

Auth.init();
