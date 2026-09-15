// ---------------------------------------------------------------------------
// Sales Map configuration
//
// To share ONE live customer list with the whole team, connect a free Firebase
// Realtime Database. Follow the steps in README.md, then paste the config
// Firebase gives you below (replace `null`). Example:
//
// window.SALES_MAP_CONFIG = {
//   firebase: {
//     apiKey: "AIza...",
//     authDomain: "sales-map-12345.firebaseapp.com",
//     databaseURL: "https://sales-map-12345-default-rtdb.firebaseio.com",
//     projectId: "sales-map-12345",
//     storageBucket: "sales-map-12345.appspot.com",
//     messagingSenderId: "1234567890",
//     appId: "1:1234567890:web:abcdef123456",
//   },
// };
//
// While `firebase` is null the app stores customers only in the browser on
// each device (single-user mode).
// ---------------------------------------------------------------------------
window.SALES_MAP_CONFIG = {
  firebase: null,
};
