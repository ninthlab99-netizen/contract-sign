/* ============================================================
 * firebase-init.js - Firebase 專案初始化（合約簽署工具）
 *
 * 沿用 NINTH LAB 維修檢查表的同一個 Firebase 專案（ninthlab-fix），
 * 用不同的 collection（contracts / signatures）存資料，
 * 不會跟維修檢查表的 repairs / meta 資料互相干擾。
 *
 * apiKey 等設定值屬於「用戶端設定」，公開寫在前端程式碼中是
 * Firebase 官方預期且安全的做法，真正的存取控制交給 Firestore
 * 安全性規則（見專案 README 的「Firestore 規則」章節）。
 * ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB6EoBRaks9B9zpUw1iAa270yXuGxgzkH0",
  authDomain: "ninthlab-fix.firebaseapp.com",
  projectId: "ninthlab-fix",
  storageBucket: "ninthlab-fix.firebasestorage.app",
  messagingSenderId: "777473800802",
  appId: "1:777473800802:web:b22c2793aabc166fc8ef3b",
};

firebase.initializeApp(FIREBASE_CONFIG);

const fsDB = firebase.firestore();
const fsAuth = firebase.auth();
