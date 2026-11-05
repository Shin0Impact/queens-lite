// Settings for the online leaderboard. The GitHub Action fills these in from
// the repository variables FIREBASE_API_KEY and FIREBASE_PROJECT_ID. When
// they are empty, the online board is off and the game still works.
window.QUEENS_CONFIG = {
  firebase: {
    apiKey: '',
    projectId: '',
  },
};
